import type { FilmAsset, FilmMediaVersion } from "@/lib/film/types";
import { parseFilmScriptDocument, scriptTextHash } from "@/lib/film/film-script-import";
import { FILM_IMAGE_REFERENCE_LIMIT } from "@/app/(user)/film/utils/film-shot-generation";
import { filmVideoMode } from "./film-shot-video-frames";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";
import { FILM_CONTEXT_ROLE_LABELS } from "./film-studio-types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmAnalysisSession } from "../../types";
import type { FilmNodeType } from "./film-graph-types";
import { FILM_NODE_REGISTRY, FILM_NODE_TYPE_BY_CANVAS_TYPE } from "./film-node-registry";

export type FilmNodeRefreshState = "current" | "pending" | "stale" | "unrecorded";
export type FilmNodeMedia = "none" | "image" | "video" | "image+video";

export type FilmNodeSummaryOptions = {
    costumes?: FilmAsset[];
    videoMaxReferences?: number;
    aspect?: import("@/lib/film/types").FilmAspect;
    stylePresetId?: string;
    directorStyleId?: string;
};

export type FilmNodeSummary = {
    type: FilmNodeType;
    label: string;
    title: string;
    description: string;
    shotNo?: string;
    sceneLabel?: string;
    contextLabels?: string[];
    previousShotNo?: string;
    referenceCount?: number;
    media?: FilmNodeMedia;
    versionCount?: number;
    imageVersionCount?: number;
    videoVersionCount?: number;
    pendingGeneration?: "image" | "video" | null;
    refreshState?: FilmNodeRefreshState;
    stale?: boolean;
    needsRefresh?: boolean;
    status?: NonNullable<CanvasNodeData["metadata"]>["status"];
    progress?: number;
    pendingContextCount?: number;
    script?: {
        words: number;
        episodes: number;
        scenes: number;
        hasSource: boolean;
        analysisStatus?: FilmAnalysisSession["status"];
        analysisExpired: boolean;
        analysisError?: string;
        analysisProgress?: FilmAnalysisSession["progress"];
        hasDraft: boolean;
        canUndo: boolean;
    };
};

function assetFor(node: CanvasNodeData): FilmAsset | undefined {
    return node.metadata?.filmCharacter?.asset
        ?? node.metadata?.filmLocation?.asset
        ?? node.metadata?.filmProp?.asset
        ?? node.metadata?.filmStyle?.asset;
}

function sceneForShot(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const edge = connections.find((connection) => connection.kind === "composition" && connection.toNodeId === node.id);
    if (!edge) return undefined;
    const scene = nodes.find((item) => item.id === edge.fromNodeId && item.type === CanvasNodeType.FilmScene)?.metadata?.filmScene;
    return scene ? [scene.episodeTitle, scene.name].filter(Boolean).join(" · ") || "未命名场次" : undefined;
}

function contextsForShot(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const seen = new Set<string>();
    return connections.flatMap((edge) => {
        if (edge.kind !== "context" || edge.toNodeId !== node.id || seen.has(edge.fromNodeId)) return [];
        seen.add(edge.fromNodeId);
        const source = nodes.find((item) => item.id === edge.fromNodeId);
        if (!source) return [];
        const payloadRole = source.type === CanvasNodeType.FilmCharacter ? "character"
            : source.type === CanvasNodeType.FilmLocation ? "location"
                : source.type === CanvasNodeType.FilmProp ? "prop"
                    : source.type === CanvasNodeType.FilmStyle ? "style"
                        : source.type === CanvasNodeType.FilmBeat ? "beat"
                            : null;
        if (payloadRole !== edge.data.role) return [];
        const payload = source.metadata?.filmBeat;
        const asset = assetFor(source);
        const name = asset?.name || payload?.title || source.title;
        return [`${FILM_CONTEXT_ROLE_LABELS[edge.data.role]} · ${name}`];
    });
}

function versionIsStale(version: FilmMediaVersion, currentSignature: string | undefined) {
    return Boolean(version.generationContext && currentSignature && version.generationContext.inputSignature !== currentSignature);
}

function summarizeShot(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], options: FilmNodeSummaryOptions): FilmNodeSummary {
    const shot = node.metadata?.filmShot;
    const imageVersions = shot?.imageVersions ?? [];
    const videoVersions = shot?.videoVersions ?? [];
    // 图像编译器同时提供当前签名、参考数量与上一镜，一次编译同时供状态与卡片使用。
    let imageContext: ReturnType<typeof buildFilmShotGenerationFromGraph> = null;
    try {
        imageContext = buildFilmShotGenerationFromGraph(nodes, connections, node.id, { medium: "image", maxReferences: FILM_IMAGE_REFERENCE_LIMIT, costumes: options.costumes, stylePresetId: options.stylePresetId, directorStyleId: options.directorStyleId });
    } catch {
        imageContext = null;
    }
    const imageSignature = imageContext?.inputSignature;
    let videoSignature: string | undefined;
    try {
        if (videoVersions.some((version) => version.generationContext)) {
            videoSignature = buildFilmShotGenerationFromGraph(nodes, connections, node.id, {
                medium: "video",
                maxReferences: options.videoMaxReferences ?? 8,
                videoMode: filmVideoMode(shot),
                includeStoryboard: filmVideoMode(shot) === "reference",
                includePreviousShot: filmVideoMode(shot) === "reference",
                costumes: options.costumes,
                stylePresetId: options.stylePresetId,
                directorStyleId: options.directorStyleId,
            })?.inputSignature;
        }
    } catch {
        videoSignature = undefined;
    }
    const previousShotId = imageContext?.previousShotId;
    const previousShot = previousShotId ? nodes.find((item) => item.id === previousShotId) : undefined;
    const previousShotNo = previousShot ? previousShot.metadata?.filmShot?.shotNo || previousShot.title : undefined;
    const pendingGeneration = shot?.pendingTask?.kind ?? (node.metadata?.status === "loading" ? node.metadata.filmShotTaskKind ?? null : null);
    const stale = imageVersions.some((version) => versionIsStale(version, imageSignature)) || videoVersions.some((version) => versionIsStale(version, videoSignature));
    const versions = [...imageVersions, ...videoVersions];
    const hasImage = Boolean(shot?.imageUrl || shot?.storageKey || imageVersions.length);
    const hasVideo = Boolean(shot?.videoUrl || shot?.videoStorageKey || videoVersions.length);
    const media: FilmNodeMedia = hasImage && hasVideo ? "image+video" : hasImage ? "image" : hasVideo ? "video" : "none";
    const unrecorded = versions.some((version) => !version.generationContext);
    const refreshState: FilmNodeRefreshState = pendingGeneration ? "pending" : stale ? "stale" : unrecorded || !versions.length ? "unrecorded" : "current";
    const pendingContextCount = connections.filter((edge) => edge.kind === "context" && edge.toNodeId === node.id && edge.data.source === "ai").length;
    return {
        type: "filmShot",
        label: FILM_NODE_REGISTRY.filmShot.label,
        title: node.title,
        description: shot?.description || shot?.prompt || "",
        shotNo: shot?.shotNo || "",
        sceneLabel: sceneForShot(node, nodes, connections) || "未分场",
        contextLabels: contextsForShot(node, nodes, connections),
        previousShotNo,
        referenceCount: imageContext?.references.length,
        media,
        versionCount: imageVersions.length + videoVersions.length,
        imageVersionCount: imageVersions.length,
        videoVersionCount: videoVersions.length,
        pendingGeneration,
        refreshState,
        stale,
        needsRefresh: stale,
        status: node.metadata?.status,
        progress: node.metadata?.progress,
        ...(pendingContextCount ? { pendingContextCount } : {}),
    };
}

export function summarizeFilmNode(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], options: FilmNodeSummaryOptions = {}): FilmNodeSummary {
    const type = FILM_NODE_TYPE_BY_CANVAS_TYPE[node.type];
    if (!type) throw new Error(`Unsupported film node type: ${node.type}`);
    if (type === "filmShot") return summarizeShot(node, nodes, connections, options);

    const metadata = node.metadata;
    let description = "";
    let scriptSummary: FilmNodeSummary["script"];
    switch (type) {
        case "filmScript": {
            const script = metadata?.filmScript;
            const text = script?.text || "";
            const document = parseFilmScriptDocument(text);
            const analysis = script?.analysis;
            description = text.trim().replace(/\s+/g, " ");
            scriptSummary = {
                words: text.replace(/\s+/g, "").length,
                episodes: document.episodes.length,
                scenes: document.episodes.reduce((total, episode) => total + episode.scenes.length, 0),
                hasSource: Boolean(script?.source),
                analysisStatus: analysis?.status,
                analysisExpired: Boolean(analysis?.draft && analysis.sourceHash !== scriptTextHash(text)),
                analysisError: analysis?.error,
                analysisProgress: analysis?.progress,
                hasDraft: Boolean(analysis?.draft),
                canUndo: Boolean(script?.parseSnapshots?.length),
            };
            break;
        }
        case "filmScene": {
            const scene = metadata?.filmScene;
            description = [scene?.location, scene?.time, scene?.mood].filter(Boolean).join(" / ");
            break;
        }
        case "filmCharacter":
        case "filmLocation":
        case "filmProp":
        case "filmStyle": {
            const asset = assetFor(node);
            description = asset?.description || asset?.visualPrompt || "";
            break;
        }
        case "filmBeat":
            description = metadata?.filmBeat?.prompt || "";
            break;
    }
    return {
        type,
        label: FILM_NODE_REGISTRY[type].label,
        title: node.title,
        description,
        status: metadata?.status,
        progress: metadata?.progress,
        ...(scriptSummary ? { script: scriptSummary } : {}),
    };
}
