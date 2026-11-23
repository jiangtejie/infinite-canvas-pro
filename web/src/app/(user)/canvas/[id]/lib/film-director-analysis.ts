import type { FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import { normalizeFilmAssetSuggestionName } from "@/lib/film/film-asset-suggestions";
import { scriptTextHash } from "@/lib/film/film-script-import";
import { errorMessage } from "@/lib/utils";
import type { FilmEpisode } from "@/lib/film/types";
import type { AiConfig } from "@/stores/use-config-store";
import { requestFilmAiAssetExtraction } from "@/app/(user)/film/utils/film-ai-assets";
import { requestFilmAiStoryboard, type FilmParseOptions } from "@/app/(user)/film/utils/film-ai-parse";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasFilmMeta, type CanvasNodeData, type FilmParseSnapshot } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { addFilmContextEdge } from "./film-context-edges";
import type { FilmCommandResult } from "./film-node-registry";
import { patchFilmScriptNode } from "./film-node-patch";
import type { FilmAssetProjectKind, FilmScriptAssetProposal, FilmScriptAssetProposalItem } from "./film-script-assets";
import { buildFilmScriptAssetProposal, createFilmScriptAssetNode, findFilmScriptAssetNode, isFilmAssetProjectKind } from "./film-script-assets";
import { buildFilmParseGraph } from "./film-script-parse";
import { buildFilmStructureProposal, filterFilmProposalEpisodes, type FilmProposalIssue, type FilmProposalMode, type FilmStructureProposal } from "./film-structure-proposal";

export type FilmDirectorAnalysisStage = "structure" | "assets";

export type FilmDirectorAnalysisShot = {
    id: string;
    sceneKey: string;
    episodeTitle: string;
    sceneName: string;
    shotNo: string;
    shotType: string;
    cameraMovement: string;
    duration: number;
    description: string;
    dialogue: string;
    prompt: string;
};

export type FilmDirectorAnalysisProposal = {
    scriptNodeId: string;
    sourceHash: string;
    structure: FilmStructureProposal;
    episodes: FilmEpisode[];
    shots: FilmDirectorAnalysisShot[];
    assets: FilmScriptAssetProposal;
    conflicts: FilmProposalIssue[];
    totals: {
        episodes: number;
        scenes: number;
        shots: number;
        duration: number;
        assets: number;
        existingAssets: number;
        costumes: number;
    };
};

export type FilmDirectorAnalysisSelection = {
    mode: FilmProposalMode;
    sceneKeys: Iterable<string>;
    assetKeys: Iterable<string>;
    bindMentions: boolean;
};

export type FilmDirectorAnalysisOptions = FilmParseOptions & {
    film?: CanvasFilmMeta;
    nodes?: CanvasNodeData[];
    connections?: CanvasConnection[];
    onProgress?: (stage: FilmDirectorAnalysisStage, done: number, total: number) => void;
};

type FilmDirectorAnalysisSuccess = Extract<FilmCommandResult, { nodes: CanvasNodeData[] }> & {
    createdNodes: CanvasNodeData[];
    createdAssetNodes: CanvasNodeData[];
    sceneCount: number;
    shotCount: number;
    boundCount: number;
};

export type FilmDirectorAnalysisApplyResult = FilmDirectorAnalysisSuccess | { error: string };

const ASSET_COLUMN_GAP = 80;
const ASSET_ROW_GAP = 36;

/** 复用现有拆镜与资产提取请求，一次生成导演分析提案；不新建任务链或提示词编译器。 */
export async function requestFilmDirectorAnalysis(
    config: AiConfig,
    scriptNode: CanvasNodeData,
    options: FilmDirectorAnalysisOptions = {},
): Promise<FilmDirectorAnalysisProposal> {
    const text = scriptNode.metadata?.filmScript?.text || "";
    if (!text.trim()) throw new Error("先在剧本节点填写正文");
    const [structureResult, assetResult] = await Promise.allSettled([
        requestFilmAiStoryboard(config, text, options, (done, total) => options.onProgress?.("structure", done, total)),
        requestFilmAiAssetExtraction(config, text, (done, total) => options.onProgress?.("assets", done, total)),
    ]);
    if (structureResult.status === "rejected") throw structureResult.reason;
    const proposal = buildFilmDirectorAnalysis(structureResult.value, assetResult.status === "fulfilled" ? assetResult.value : [], scriptNode, options.nodes ?? [], options.connections ?? [], options.film);
    if (assetResult.status === "rejected") proposal.conflicts.push({ level: "warning", message: `资产提取失败：${errorMessage(assetResult.reason, "可稍后重新分析")}` });
    return proposal;
}

/** 只构造待确认提案；现有画布节点仅用于匹配已有资产和统计。 */
export function buildFilmDirectorAnalysis(
    episodes: FilmEpisode[],
    suggestions: FilmAssetSuggestion[],
    scriptNode: CanvasNodeData,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    film?: CanvasFilmMeta,
): FilmDirectorAnalysisProposal {
    const structure = buildFilmStructureProposal(episodes, nodes, connections, film);
    const assets = buildFilmScriptAssetProposal(suggestions, nodes, episodes);
    const conflicts: FilmProposalIssue[] = [...structure.issues];
    if (assets.totals.byKind.costume) conflicts.push({ level: "info", message: `${assets.totals.byKind.costume} 项服装保留在母版库，不创建项目一级节点，也不会自动绑定镜头。` });
    if (assets.totals.existing) conflicts.push({ level: "info", message: `${assets.totals.existing} 项资产画布已有，应用时复用并按最终镜头文本重新关联。` });
    return {
        scriptNodeId: scriptNode.id,
        sourceHash: scriptTextHash(scriptNode.metadata?.filmScript?.text || ""),
        structure,
        episodes,
        shots: episodes.flatMap((episode, episodeIndex) => episode.scenes.flatMap((scene, sceneIndex) => scene.shots.map((shot) => ({
            id: shot.id,
            sceneKey: `${episodeIndex}:${sceneIndex}`,
            episodeTitle: episode.title,
            sceneName: scene.name,
            shotNo: shot.shotNo,
            shotType: shot.shotType,
            cameraMovement: shot.cameraMovement,
            duration: shot.duration,
            description: shot.description || shot.prompt,
            dialogue: shot.dialogue,
            prompt: shot.prompt,
        })))),
        assets,
        conflicts,
        totals: {
            ...structure.totals,
            assets: assets.totals.assets,
            existingAssets: assets.totals.existing,
            costumes: assets.totals.byKind.costume,
        },
    };
}

/** 一次原子应用勾选场次、勾选资产和提及边；任何校验失败都不修改输入图。 */
export function applyFilmDirectorAnalysis(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    proposal: FilmDirectorAnalysisProposal,
    selection: FilmDirectorAnalysisSelection,
): FilmDirectorAnalysisApplyResult {
    const selectedEpisodes = filterFilmProposalEpisodes(proposal.episodes, selection.sceneKeys);
    if (!selectedEpisodes.length) return { error: "至少勾选一场再应用" };
    const scriptNode = nodes.find((node) => node.id === proposal.scriptNodeId && node.type === CanvasNodeType.FilmScript);
    if (!scriptNode) return { error: "剧本节点已不存在" };

    const parsed = buildFilmParseGraph(selectedEpisodes, scriptNode, nodes, connections, selection.mode);
    const parseSnapshot = parsed.scriptPatch.parseSnapshots?.at(-1);
    if (!parseSnapshot) return { error: "本次分析没有生成解析快照" };

    const derivedEdges = parseSnapshot.nodes
        .filter((node) => node.type === CanvasNodeType.FilmScene)
        .map((scene) => canvasConnection(scriptNode.id, scene.id, { kind: "derived", data: { source: "script-analysis" } }));
    let nextNodes = parsed.nodes;
    let nextConnections = derivedEdges.length ? [...parsed.connections, ...derivedEdges] : parsed.connections;
    const assetKeys = new Set(selection.assetKeys);
    const projectAssets = proposal.assets.items.filter((item): item is FilmScriptAssetProposalItem & { kind: FilmAssetProjectKind } => assetKeys.has(item.key) && isFilmAssetProjectKind(item.kind));
    const nodeIdByKey = new Map<string, string>();
    const createdAssetNodes: CanvasNodeData[] = [];
    const assetSize = NODE_DEFAULT_SIZE[CanvasNodeType.FilmCharacter];
    let cursorY = scriptNode.position.y;
    for (const item of projectAssets) {
        const existing = findFilmScriptAssetNode(nextNodes, item);
        if (existing) {
            nodeIdByKey.set(item.key, existing.id);
            continue;
        }
        const index = nextNodes.filter((node) => node.type === (item.kind === "character" ? CanvasNodeType.FilmCharacter : item.kind === "location" ? CanvasNodeType.FilmLocation : CanvasNodeType.FilmProp)).length + 1;
        const node = createFilmScriptAssetNode(item.kind, item, { x: scriptNode.position.x - ASSET_COLUMN_GAP - assetSize.width, y: cursorY }, index);
        cursorY += assetSize.height + ASSET_ROW_GAP;
        nextNodes = [...nextNodes, node];
        createdAssetNodes.push(node);
        nodeIdByKey.set(item.key, node.id);
    }

    let boundCount = 0;
    const contextEdges: CanvasConnection[] = [];
    if (selection.bindMentions) {
        const mentions = finalShotMentions(nextNodes, nextConnections);
        for (const item of projectAssets) {
            const nodeId = nodeIdByKey.get(item.key);
            if (!nodeId) continue;
            const terms = [item.name, ...item.aliases].map(normalizeFilmAssetSuggestionName).filter(Boolean);
            for (const mention of mentions) {
                const shotMatched = terms.some((term) => mention.text.includes(term));
                const sceneMatched = item.kind === "location" && terms.some((term) => mention.sceneText.includes(term));
                if (!shotMatched && !sceneMatched) continue;
                const linked = addFilmContextEdge(nextNodes, nextConnections, nodeId, mention.id, { role: item.kind, source: "ai" });
                if ("error" in linked) continue;
                nextConnections = linked.connections;
                contextEdges.push(nextConnections[nextConnections.length - 1]);
                boundCount += 1;
            }
        }
    }

    const snapshot: FilmParseSnapshot = {
        ...parseSnapshot,
        nodes: [...parseSnapshot.nodes, ...createdAssetNodes],
        connections: [...parseSnapshot.connections, ...derivedEdges, ...contextEdges],
    };
    const snapshots = [...(parsed.scriptPatch.parseSnapshots ?? []).slice(0, -1), snapshot].slice(-3);
    nextNodes = nextNodes.map((node) => node.id === scriptNode.id ? patchFilmScriptNode(node, { parseSnapshots: snapshots }) : node);
    return {
        nodes: nextNodes,
        connections: nextConnections,
        nodeId: scriptNode.id,
        createdNodes: snapshot.nodes,
        createdAssetNodes,
        sceneCount: parsed.sceneCount,
        shotCount: parsed.shotCount,
        boundCount,
    };
}

type FilmMentionTarget = { id: string; text: string; sceneText: string };

/** 以应用后的最终镜头文本重新计算提及，不复用提案或旧 shot ID。 */
function finalShotMentions(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmMentionTarget[] {
    const sceneTextById = new Map<string, string>();
    nodes.forEach((node) => {
        if (node.type !== CanvasNodeType.FilmScene) return;
        const meta = node.metadata?.filmScene;
        if (!meta) return;
        sceneTextById.set(node.id, normalizeFilmAssetSuggestionName([meta.episodeTitle, meta.name, meta.location, meta.notes].filter(Boolean).join(" ")));
    });
    const sceneIdByShot = new Map<string, string>();
    connections.forEach((edge) => {
        if (edge.kind === "composition" && !sceneIdByShot.has(edge.toNodeId)) sceneIdByShot.set(edge.toNodeId, edge.fromNodeId);
    });
    return nodes.filter((node) => node.type === CanvasNodeType.FilmShot).map((node) => {
        const shot = node.metadata?.filmShot;
        return {
            id: node.id,
            text: normalizeFilmAssetSuggestionName([node.title, shot?.shotNo, shot?.description, shot?.dialogue, shot?.prompt].filter(Boolean).join(" ")),
            sceneText: sceneTextById.get(sceneIdByShot.get(node.id) ?? "") ?? "",
        };
    });
}
