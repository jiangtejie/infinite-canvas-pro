import type { FilmAssetSuggestion, FilmAssetSuggestionKind } from "@/lib/film/film-asset-suggestions";
import { normalizeFilmAssetSuggestionName } from "@/lib/film/film-asset-suggestions";
import { scriptTextHash } from "@/lib/film/film-script-import";
import { errorMessage } from "@/lib/utils";
import type { FilmEpisode, FilmStructurePlan } from "@/lib/film/types";
import type { AiConfig } from "@/stores/use-config-store";
import { requestFilmAiAssetExtraction } from "@/app/(user)/film/utils/film-ai-assets";
import type { FilmParseOptions } from "@/app/(user)/film/utils/film-ai-parse";
import { episodesFromSceneStoryboards, requestFilmSceneStoryboard, runFilmSceneStoryboards } from "@/app/(user)/film/utils/film-ai-scenes";
import { requestFilmAiStructure, scriptSceneExcerpt } from "@/app/(user)/film/utils/film-ai-structure";
import { CanvasNodeType, type CanvasConnection, type CanvasFilmMeta, type CanvasNodeData, type FilmParseSnapshot } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { addFilmContextEdge } from "./film-context-edges";
import { arrangeFilmDirectorBoard } from "./film-layout";
import { buildFilmAnalysisLandingGraph, type FilmAnalysisLandingPlan } from "./film-landing-plan";
import { filmMentionIncludes, filmMentionTerms, normalizeFilmMentionText } from "./film-mentions";
import type { FilmCommandResult } from "./film-node-registry";
import { patchFilmScriptNode } from "./film-node-patch";
import type { FilmAssetProjectKind, FilmAssetLibrary, FilmScriptAssetProposal, FilmScriptAssetProposalItem } from "./film-script-assets";
import { buildFilmScriptAssetProposal, createFilmScriptAssetNode, createFilmScriptAssetNodeFromLibrary, findFilmScriptAssetNode, isFilmAssetProjectKind } from "./film-script-assets";
import { buildFilmParseGraph, type FilmParseGraphResult } from "./film-script-parse";
import { buildFilmStructureProposal, filterFilmProposalEpisodes, type FilmProposalIssue, type FilmProposalMode, type FilmStructureProposal } from "./film-structure-proposal";

export type FilmDirectorAnalysisStage = "structure" | "shots" | "assets";

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
    structurePlan?: FilmStructurePlan;
    sceneErrors?: Record<string, string>;
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
    library?: FilmAssetLibrary;
    extractAssets?: boolean;
    /** 已确认的资产名/别名，要求 AI 归并到已知名称。 */
    knownAssets?: Array<{ kind: FilmAssetSuggestionKind; name: string; aliases: string[] }>;
    /** 来自剧本工作台的人物，优先于 AI 角色提取。 */
    seedCharacters?: Array<{ name: string; aliases?: string[]; description?: string }>;
    onStructure?: (plan: FilmStructurePlan) => void;
    onProgress?: (stage: FilmDirectorAnalysisStage, done: number, total: number) => void;
};

type FilmDirectorAnalysisSuccess = Extract<FilmCommandResult, { nodes: CanvasNodeData[] }> & {
    createdNodes: CanvasNodeData[];
    createdAssetNodes: CanvasNodeData[];
    sceneCount: number;
    shotCount: number;
    boundCount: number;
    landing?: FilmAnalysisLandingPlan;
};

export type FilmDirectorAnalysisApplyResult = FilmDirectorAnalysisSuccess | { error: string };

/** 中止时若结构阶段已完成，保留可继续确认的部分提案。 */
export class FilmAnalysisAbortedError extends Error {
    constructor(readonly proposal?: FilmDirectorAnalysisProposal) {
        super("导演分析已中止");
        this.name = "FilmAnalysisAbortedError";
    }
}

/** 分阶段导演分析：结构 → 逐场分镜（有限并发）→ 资产；结构完成即可保留部分结果。 */
export async function requestFilmDirectorAnalysis(
    config: AiConfig,
    scriptNode: CanvasNodeData,
    options: FilmDirectorAnalysisOptions = {},
): Promise<FilmDirectorAnalysisProposal> {
    const text = scriptNode.metadata?.filmScript?.text || "";
    if (!text.trim()) throw new Error("先在剧本节点填写正文");
    const structure = await requestFilmAiStructure(config, text, options, (done, total) => options.onProgress?.("structure", done, total));
    options.onStructure?.(structure);
    const assetTask = options.extractAssets === false
        ? Promise.resolve({ ok: true as const, value: [] as FilmAssetSuggestion[] })
        : requestFilmAiAssetExtraction(config, text, (done, total) => options.onProgress?.("assets", done, total), options.signal, {
            knownAssets: options.knownAssets,
            seedCharacters: options.seedCharacters,
        }).then(
            (value) => ({ ok: true as const, value }),
            (reason: unknown) => ({ ok: false as const, reason }),
        );
    const run = await runFilmSceneStoryboards(
        structure,
        (scene) => requestFilmSceneStoryboard(config, scene, scriptSceneExcerpt(text, scene), options),
        {
            concurrency: 3,
            signal: options.signal,
            onProgress: (done, total) => options.onProgress?.("shots", done, total),
        },
    );
    const asset = await assetTask;
    const suggestions = asset.ok ? asset.value : [];
    const episodes = episodesFromSceneStoryboards(structure, run.scenes);
    const buildProposal = (items: FilmAssetSuggestion[]) => {
        const proposal = buildFilmDirectorAnalysis(episodes, mergeSeedCharacters(items, options.seedCharacters), scriptNode, options.nodes ?? [], options.connections ?? [], options.film, options.library, structure);
        if (Object.keys(run.errors).length) proposal.sceneErrors = run.errors;
        return proposal;
    };
    if (options.signal?.aborted || run.aborted) {
        if (!episodes.length) throw new FilmAnalysisAbortedError();
        const partial = buildProposal(suggestions);
        partial.conflicts.push({
            level: "warning",
            message: run.scenes.some(Boolean) ? `分镜已中止，已完成 ${episodes.reduce((total, item) => total + item.scenes.length, 0)}/${structure.scenes.length} 场可继续确认。` : "资产提取已中止，继续确认后可单独重新分析。",
        });
        throw new FilmAnalysisAbortedError(partial);
    }
    if (!episodes.length) throw new Error("所有场次分镜均失败，请检查模型或剧本");
    const proposal = buildProposal(suggestions);
    const failedScenes = Object.values(run.errors);
    if (failedScenes.length) proposal.conflicts.push({ level: "warning", message: `${failedScenes.length} 场分镜失败，可在提案中单独重做：${failedScenes.slice(0, 2).join("；")}` });
    if (!asset.ok) proposal.conflicts.push({ level: "warning", message: `资产提取失败：${errorMessage(asset.reason, "可稍后重新分析")}` });
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
    library?: FilmAssetLibrary,
    structurePlan?: FilmStructurePlan,
): FilmDirectorAnalysisProposal {
    const structure = buildFilmStructureProposal(episodes, nodes, connections, film);
    const assets = buildFilmScriptAssetProposal(suggestions, nodes, episodes, library);
    const conflicts: FilmProposalIssue[] = [...structure.issues];
    if (assets.totals.byKind.costume) conflicts.push({ level: "info", message: `${assets.totals.byKind.costume} 项服装保留在母版库，不创建项目一级节点，也不会自动绑定镜头。` });
    if (assets.totals.existing) conflicts.push({ level: "info", message: `${assets.totals.existing} 项资产画布已有，应用时复用并按最终镜头文本重新关联。` });
    if (assets.totals.library) conflicts.push({ level: "info", message: `${assets.totals.library} 项资产命中母版库，应用时导入独立副本并复用参考图与变体。` });
    assets.items.filter((item) => item.categoryConflict).forEach((item) => conflicts.push({ level: "warning", message: item.categoryConflict! }));
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
        structurePlan,
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

    const parsed = selection.mode === "append"
        ? buildFilmParseGraph(selectedEpisodes, scriptNode, nodes, connections, "append")
        : buildFilmAnalysisLandingGraph(selectedEpisodes, scriptNode, nodes, connections, selection.mode);
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
    for (const item of projectAssets) {
        const existing = findFilmScriptAssetNode(nextNodes, item);
        if (existing) {
            nodeIdByKey.set(item.key, existing.id);
            continue;
        }
        const index = nextNodes.filter((node) => node.type === (item.kind === "character" ? CanvasNodeType.FilmCharacter : item.kind === "location" ? CanvasNodeType.FilmLocation : CanvasNodeType.FilmProp)).length + 1;
        const node = item.libraryAsset
            ? createFilmScriptAssetNodeFromLibrary(item.kind, item, item.libraryAsset, scriptNode.position)
            : createFilmScriptAssetNode(item.kind, item, scriptNode.position, index);
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
            const terms = filmMentionTerms(item.name, item.aliases);
            for (const mention of mentions) {
                const shotMatched = terms.some((term) => filmMentionIncludes(mention.text, term));
                const sceneMatched = item.kind === "location" && terms.some((term) => filmMentionIncludes(mention.sceneText, term));
                if (!shotMatched && !sceneMatched) continue;
                const linked = addFilmContextEdge(nextNodes, nextConnections, nodeId, mention.id, { role: item.kind, source: "ai" });
                if ("error" in linked) continue;
                nextConnections = linked.connections;
                contextEdges.push(nextConnections[nextConnections.length - 1]);
                boundCount += 1;
            }
        }
    }

    const arrangedNodes = arrangeFilmDirectorBoard(nextNodes, nextConnections);
    const beforeById = new Map(nodes.map((node) => [node.id, node]));
    const createdIds = new Set([...parseSnapshot.nodes, ...createdAssetNodes].map((node) => node.id));
    const movedNodes = arrangedNodes.flatMap((node) => {
        if (createdIds.has(node.id)) return [];
        const before = beforeById.get(node.id);
        return before && (before.position.x !== node.position.x || before.position.y !== node.position.y) ? [before] : [];
    });
    const arrangedById = new Map(arrangedNodes.map((node) => [node.id, node]));
    const createdNodes = [...parseSnapshot.nodes, ...createdAssetNodes].map((node) => arrangedById.get(node.id) ?? node);
    const updatedById = new Map([...(parseSnapshot.updatedNodes ?? []), ...movedNodes].map((node) => [node.id, node]));
    const snapshot: FilmParseSnapshot = {
        ...parseSnapshot,
        nodes: createdNodes,
        connections: [...parseSnapshot.connections, ...derivedEdges, ...contextEdges],
        ...(updatedById.size ? { updatedNodes: [...updatedById.values()] } : {}),
    };
    const snapshots = [...(parsed.scriptPatch.parseSnapshots ?? []).slice(0, -1), snapshot].slice(-3);
    nextNodes = arrangedNodes.map((node) => node.id === scriptNode.id ? patchFilmScriptNode(node, { parseSnapshots: snapshots }) : node);
    return {
        nodes: nextNodes,
        connections: nextConnections,
        nodeId: scriptNode.id,
        createdNodes,
        createdAssetNodes: createdAssetNodes.map((node) => arrangedById.get(node.id) ?? node),
        sceneCount: parsed.sceneCount,
        shotCount: parsed.shotCount,
        boundCount,
        landing: (parsed as FilmParseGraphResult & { plan?: FilmAnalysisLandingPlan }).plan,
    };
}

type FilmMentionTarget = { id: string; text: string; sceneText: string };

/** 剧本工作台人物优先：AI 结果里同名/同别名的人物只补别名与描述，不重复新建。 */
function mergeSeedCharacters(suggestions: FilmAssetSuggestion[], seeds: Array<{ name: string; aliases?: string[]; description?: string }> = []) {
    if (!seeds.length) return suggestions;
    const result = suggestions.map((suggestion) => ({ ...suggestion, aliases: [...suggestion.aliases] }));
    seeds.forEach((seed) => {
        const names = new Set([seed.name, ...(seed.aliases ?? [])].map(normalizeFilmAssetSuggestionName).filter(Boolean));
        const existing = result.find((suggestion) => suggestion.kind === "character" && [suggestion.name, ...suggestion.aliases].some((name) => names.has(normalizeFilmAssetSuggestionName(name))));
        if (existing) {
            existing.aliases = [...new Set([...existing.aliases, seed.name, ...(seed.aliases ?? [])].filter((name) => name && normalizeFilmAssetSuggestionName(name) !== normalizeFilmAssetSuggestionName(existing.name)))];
            if (!existing.description && seed.description) existing.description = seed.description;
            return;
        }
        result.push({ key: `character:${normalizeFilmAssetSuggestionName(seed.name)}`, kind: "character", name: seed.name, aliases: seed.aliases ?? [], description: seed.description ?? "", visualPrompt: "" });
    });
    return result;
}

/** 以应用后的最终镜头文本重新计算提及，不复用提案或旧 shot ID。 */
function finalShotMentions(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmMentionTarget[] {
    const sceneTextById = new Map<string, string>();
    nodes.forEach((node) => {
        if (node.type !== CanvasNodeType.FilmScene) return;
        const meta = node.metadata?.filmScene;
        if (!meta) return;
        sceneTextById.set(node.id, normalizeFilmMentionText([meta.episodeTitle, meta.name, meta.location, meta.notes].filter(Boolean).join(" ")));
    });
    const sceneIdByShot = new Map<string, string>();
    connections.forEach((edge) => {
        if (edge.kind === "composition" && !sceneIdByShot.has(edge.toNodeId)) sceneIdByShot.set(edge.toNodeId, edge.fromNodeId);
    });
    return nodes.filter((node) => node.type === CanvasNodeType.FilmShot).map((node) => {
        const shot = node.metadata?.filmShot;
        return {
            id: node.id,
            text: normalizeFilmMentionText([node.title, shot?.shotNo, shot?.description, shot?.dialogue, shot?.prompt].filter(Boolean).join(" ")),
            sceneText: sceneTextById.get(sceneIdByShot.get(node.id) ?? "") ?? "",
        };
    });
}
