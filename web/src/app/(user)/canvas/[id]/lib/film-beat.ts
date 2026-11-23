import { appendSlotImage, createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";
import { extractAiJsonBlock, cleanAiJsonText } from "@/lib/ai-json";
import type { FilmImageRef } from "@/lib/film/types";
import { FILM_CONTEXT_ROLE_LABELS } from "./film-studio-types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmBeatNodeData, type FilmContextRole, type Position } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";
import { orderFilmShots } from "./film-layout";

export const FILM_BEAT_DEFAULT_TITLE = "动作节拍";

type FilmBeatContextRole = Exclude<FilmContextRole, "beat">;

export type FilmBeatShotReference = {
    shotId: string;
    shotNo: string;
    title: string;
    description: string;
    sceneLabel: string;
};

export type FilmBeatContextReference = {
    nodeId: string;
    role: FilmBeatContextRole;
    name: string;
};

/** 节拍卡与定位动作使用的只读投影：关联镜头 + 这些镜头的非 beat 上下文。 */
export type FilmBeatContextSummary = {
    shots: FilmBeatShotReference[];
    contexts: FilmBeatContextReference[];
};

export function filmBeatFrameCount(mode: FilmBeatNodeData["mode"]) {
    return mode === "grid9" ? 9 : mode === "grid4" ? 4 : 0;
}

export function createFilmBeatNode(position: Position, mode: FilmBeatNodeData["mode"] = "grid9", nodeId?: string): CanvasNodeData {
    return createCanvasNode(CanvasNodeType.FilmBeat, position, {
        filmBeat: {
            title: FILM_BEAT_DEFAULT_TITLE,
            mode,
            prompt: "",
            frames: Array.from({ length: filmBeatFrameCount(mode) }, () => ""),
            status: "idle",
            progress: 0,
        },
    }, nodeId);
}

function withBeat(node: CanvasNodeData, updater: (beat: FilmBeatNodeData) => FilmBeatNodeData): CanvasNodeData {
    const beat = node.metadata?.filmBeat;
    if (!beat) return node;
    const next = updater(beat);
    return next === beat ? node : { ...node, metadata: { ...node.metadata, filmBeat: next } };
}

/** 忙碌状态只认节点 metadata；刷新复位后残留的 filmBeat.status 不阻塞重试。 */
export function filmBeatIsBusy(node?: CanvasNodeData) {
    const status = node?.metadata?.status;
    return status === "loading" || status === "stopping";
}

/** 只写一个格位；grid9 始终保持 9 帧，越界或同值返回原节点。 */
export function updateFilmBeatFrame(node: CanvasNodeData, index: number, value: string): CanvasNodeData {
    return withBeat(node, (beat) => {
        const count = filmBeatFrameCount(beat.mode);
        if (index < 0 || index >= count) return beat;
        const frames = Array.from({ length: count }, (_, position) => beat.frames[position] ?? "");
        if (frames[index] === value) return beat;
        frames[index] = value;
        return { ...beat, frames };
    });
}

export function updateFilmBeatFrames(node: CanvasNodeData, frames: string[]): CanvasNodeData {
    return withBeat(node, (beat) => {
        const count = filmBeatFrameCount(beat.mode);
        const next = Array.from({ length: count }, (_, index) => (frames[index] ?? "").trim());
        return next.every((frame, index) => frame === beat.frames[index]) && beat.frames.length === count ? beat : { ...beat, frames: next };
    });
}

/** 节点标题是唯一真源，同时写回 filmBeat.title，卡片、检查器与 AI 读同一份值。 */
export function updateFilmBeatTitle(node: CanvasNodeData, value: string): CanvasNodeData {
    const beat = node.metadata?.filmBeat;
    if (!beat || (node.title === value && beat.title === value)) return node;
    return {
        ...node,
        title: value,
        metadata: { ...node.metadata, filmBeat: beat.title === value ? beat : { ...beat, title: value } },
    };
}

export function updateFilmBeatPrompt(node: CanvasNodeData, value: string): CanvasNodeData {
    return withBeat(node, (beat) => beat.prompt === value ? beat : { ...beat, prompt: value });
}

/** 任务状态同时写回 filmBeat 与节点 metadata，卡片状态标签与摘要复用同一份状态。 */
export function updateFilmBeatTask(node: CanvasNodeData, patch: Partial<Pick<FilmBeatNodeData, "status" | "progress" | "errorMessage">>): CanvasNodeData {
    const beat = node.metadata?.filmBeat;
    if (!beat) return node;
    const status = patch.status ?? beat.status;
    const progress = patch.progress ?? beat.progress;
    const errorMessage = patch.errorMessage ?? (status === "error" ? beat.errorMessage : undefined);
    if (status === beat.status && progress === beat.progress && errorMessage === beat.errorMessage && node.metadata?.status === status) return node;
    return {
        ...node,
        metadata: {
            ...node.metadata,
            status,
            progress,
            errorDetails: status === "error" ? errorMessage : undefined,
            filmBeat: { ...beat, status, progress, errorMessage },
        },
    };
}

/** 预览成功同时写回节点 metadata，卡片状态标签、进度与禁用逻辑统一读 metadata。 */
export function updateFilmBeatPreview(node: CanvasNodeData, image: FilmImageRef): CanvasNodeData {
    const withPreview = withBeat(node, (beat) => ({ ...beat, preview: appendSlotImage(beat.preview ?? createFilmImageSlot(), image) }));
    return updateFilmBeatTask(withPreview, { status: "success", progress: 100, errorMessage: undefined });
}

export function filmBeatFramesComplete(beat?: FilmBeatNodeData) {
    if (!beat) return false;
    const count = filmBeatFrameCount(beat.mode);
    return count > 0 && Array.from({ length: count }, (_, index) => (beat.frames[index] || "").trim()).every(Boolean);
}

/** 有自定义标题、动作说明或任一格内容时才值得请求 AI 拆解。 */
export function filmBeatHasContent(beat?: FilmBeatNodeData) {
    return Boolean(beat && (beat.prompt.trim() || beat.title.trim() !== FILM_BEAT_DEFAULT_TITLE || beat.frames.some((frame) => frame.trim())));
}

/**
 * 把标题、总说明与非空帧按格位顺序合成镜头编译器可消费的文本。
 * 没有说明也没有帧时返回空串，未编辑的默认标题不产生噪音。
 */
export function filmBeatPrompt(beat?: FilmBeatNodeData): string {
    if (!beat) return "";
    const prompt = beat.prompt.trim();
    const frames = beat.frames.flatMap((frame, index) => frame.trim() ? [`节拍 ${index + 1}：${frame.trim()}`] : []);
    if (!prompt && !frames.length) return "";
    const title = beat.title.trim();
    return [
        title && title !== FILM_BEAT_DEFAULT_TITLE ? `动作节拍「${title}」` : "",
        prompt ? `动作过程：${prompt}` : "",
        ...frames,
    ].filter(Boolean).join("\n");
}

function contextRoleForNode(node: CanvasNodeData | undefined): FilmBeatContextRole | null {
    if (node?.type === CanvasNodeType.FilmCharacter && node.metadata?.filmCharacter) return "character";
    if (node?.type === CanvasNodeType.FilmLocation && node.metadata?.filmLocation) return "location";
    if (node?.type === CanvasNodeType.FilmProp && node.metadata?.filmProp) return "prop";
    if (node?.type === CanvasNodeType.FilmStyle && node.metadata?.filmStyle) return "style";
    return null;
}

export function selectFilmBeatContexts(nodes: CanvasNodeData[], connections: CanvasConnection[], beatId: string): FilmBeatContextSummary {
    const shotIds = new Set(connections.flatMap((edge) =>
        edge.kind === "context" && edge.data.role === "beat" && edge.fromNodeId === beatId
            && nodes.some((node) => node.id === edge.toNodeId && node.type === CanvasNodeType.FilmShot)
            ? [edge.toNodeId]
            : []));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const shots = orderFilmShots(nodes.filter((node) => shotIds.has(node.id)), connections).map((node): FilmBeatShotReference => {
        const shot = node.metadata?.filmShot;
        const composition = connections.find((edge) => edge.kind === "composition" && edge.toNodeId === node.id);
        const scene = composition ? byId.get(composition.fromNodeId)?.metadata?.filmScene : undefined;
        return {
            shotId: node.id,
            shotNo: shot?.shotNo || node.title,
            title: node.title,
            description: shot?.description || shot?.prompt || "",
            sceneLabel: scene ? [scene.episodeTitle, scene.name].filter(Boolean).join(" · ") || "未命名场次" : "未分场",
        };
    });
    const seen = new Set<string>();
    const contexts: FilmBeatContextReference[] = [];
    for (const shot of shots) {
        for (const edge of connections) {
            if (edge.kind !== "context" || edge.toNodeId !== shot.shotId || edge.data.role === "beat") continue;
            const source = byId.get(edge.fromNodeId);
            const role = contextRoleForNode(source);
            if (!source || !role || role !== edge.data.role || seen.has(source.id)) continue;
            seen.add(source.id);
            const asset = source.metadata?.filmCharacter?.asset ?? source.metadata?.filmLocation?.asset ?? source.metadata?.filmProp?.asset ?? source.metadata?.filmStyle?.asset;
            contexts.push({ nodeId: source.id, role, name: asset?.name || source.metadata?.filmBeat?.title || source.title });
        }
    }
    return { shots, contexts };
}

/** 九宫格预览取第一个关联镜头（按全片顺序）的生成上下文作为参考图来源。 */
export function selectFilmBeatPreviewShotId(nodes: CanvasNodeData[], connections: CanvasConnection[], beatId: string) {
    return selectFilmBeatContexts(nodes, connections, beatId).shots[0]?.shotId;
}

export function buildFilmBeatDecompositionPrompt(beat: FilmBeatNodeData, context?: FilmBeatContextSummary): string {
    const frames = beat.frames.flatMap((frame, index) => frame.trim() ? [`第 ${index + 1} 格：${frame.trim()}`] : []);
    const shots = context?.shots.length
        ? context.shots.map((shot) => `${shot.shotNo}${shot.title ? ` ${shot.title}` : ""}（${shot.description || "无描述"}）`).join("；")
        : "未关联镜头";
    const contexts = context?.contexts.length
        ? context.contexts.map((item) => `${FILM_CONTEXT_ROLE_LABELS[item.role]}：${item.name}`).join("；")
        : "无";
    return `你是一名动作指导。请把一个动作节拍拆成 3x3 九宫格动作分镜。
只输出 JSON 数组，固定 9 个字符串元素，按第 1 格到第 9 格顺序描述同一个连续动作；每格一句中文，写清肢体动作、视线与节奏变化；不要 Markdown，不要解释。
【节拍标题】${beat.title || FILM_BEAT_DEFAULT_TITLE}
【动作说明】${beat.prompt.trim() || "未填写"}
【已有格位】${frames.length ? frames.join("\n") : "无"}
【关联镜头】${shots}
【镜头上下文】${contexts}
要求：第 1 格是起始姿态，第 9 格是结束姿态，中间格保持同一角色、同一场景、动作连续。`;
}

export function buildFilmBeatPreviewPrompt(beat: FilmBeatNodeData): string {
    const frames = beat.frames.flatMap((frame, index) => frame.trim() ? [`第 ${index + 1} 格：${frame.trim()}`] : []);
    return `一张 3x3 九宫格分镜预览图，9 个等大画格从左到右、从上到下表现同一个连续动作。保持角色、服装、场景、光线和画风一致，不要文字、编号、说明或水印。
【动作节拍】${beat.title || FILM_BEAT_DEFAULT_TITLE}${beat.prompt.trim() ? `：${beat.prompt.trim()}` : ""}
${frames.join("\n")}`;
}

/** 解析模型返回的 9 格文本；兼容字符串数组、对象内的数组与格位对象。 */
export function parseFilmBeatFrames(content: string, count = 9): string[] {
    const text = cleanAiJsonText(content);
    let parsed: unknown;
    try {
        parsed = JSON.parse(extractAiJsonBlock(text, "array") ?? text);
    } catch {
        const objectBody = extractAiJsonBlock(text, "object");
        if (!objectBody) return [];
        try {
            parsed = JSON.parse(objectBody);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        parsed = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
    }
    if (!Array.isArray(parsed) || !parsed.length) return [];
    return Array.from({ length: count }, (_, index) => {
        const item = parsed[index];
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            const value = ["text", "frame", "action", "description"].map((key) => record[key]).find((candidate) => typeof candidate === "string");
            return typeof value === "string" ? value.trim() : "";
        }
        return "";
    });
}
