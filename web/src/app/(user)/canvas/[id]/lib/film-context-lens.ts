import type { FilmGenerationReferenceRole, FilmVideoMode } from "@/lib/film/types";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { orderFilmShots } from "./film-layout";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";
import { selectFilmShotContexts, selectFilmStyleName } from "./film-selectors";
import type { FilmShotContextChip } from "./film-studio-types";

export type FilmContextIssue = {
    level: "warning" | "error";
    message: string;
};

export type FilmContextLens = {
    medium: "image" | "video";
    scene: { label: string; location: string; time: string; mood: string; notes?: string } | null;
    styleName: string | null;
    previousShot: { id: string; shotNo: string } | null;
    contexts: FilmShotContextChip[];
    references: { role: FilmGenerationReferenceRole; label: string }[];
    prompt: string;
    compilerVersion: string | null;
    issues: FilmContextIssue[];
    ready: boolean;
    compileError: string | null;
};

export type FilmContextLensOptions = {
    medium: "image" | "video";
    maxReferences: number;
    videoMode?: FilmVideoMode;
    stylePresetId?: string;
    directorStyleId?: string;
};

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

/** 生成前上下文透镜：只做派生，不加载媒体、不提交任务。 */
export function selectFilmShotContextLens(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotId: string,
    options: FilmContextLensOptions,
): FilmContextLens | null {
    const shotNode = nodes.find((node) => node.id === shotId && node.type === CanvasNodeType.FilmShot);
    const payload = shotNode?.metadata?.filmShot;
    if (!shotNode || !payload) return null;
    const composition = connections.find((edge) => edge.kind === "composition" && edge.toNodeId === shotId);
    const sceneNode = composition ? nodes.find((node) => node.id === composition.fromNodeId && node.type === CanvasNodeType.FilmScene) : undefined;
    const sceneMeta = sceneNode?.metadata?.filmScene;
    const scene = sceneMeta
        ? {
            label: [sceneMeta.episodeTitle, sceneMeta.name].filter(Boolean).join(" · ") || "未命名场次",
            location: sceneMeta.location,
            time: sceneMeta.time,
            mood: sceneMeta.mood,
            notes: sceneMeta.notes,
        }
        : null;
    const ordered = orderFilmShots(nodes.filter((node) => node.type === CanvasNodeType.FilmShot), connections);
    const shotIndex = ordered.findIndex((node) => node.id === shotId);
    const previous = shotIndex > 0 ? ordered[shotIndex - 1] : undefined;
    const previousPayload = previous?.metadata?.filmShot;
    const styleName = selectFilmStyleName(nodes);
    const styleAsset = nodes.find((node) => node.type === CanvasNodeType.FilmStyle)?.metadata?.filmStyle?.asset;
    const styleText = resolveFilmStyleText({ stylePreset: options.stylePresetId, style: styleAsset });
    const issues: FilmContextIssue[] = [];
    if (!(payload.prompt || payload.description || "").trim()) issues.push({ level: "error", message: "缺少画面描述或提示词" });
    if (!scene) issues.push({ level: "warning", message: "镜头未归属场次，生成时不会带入场次地点/时间/氛围" });
    if (!styleText) issues.push({ level: "warning", message: styleAsset ? "风格圣经为空且未选择风格预设，生成只会使用导演风格" : "项目缺少风格圣经且未选择风格预设，生成只会使用导演风格" });
    const videoMode = options.videoMode ?? "reference";
    let compileError: string | null = null;
    let prompt = "";
    let compilerVersion: string | null = null;
    let references: FilmContextLens["references"] = [];
    try {
        const context = buildFilmShotGenerationFromGraph(nodes, connections, shotId, {
            medium: options.medium,
            maxReferences: options.maxReferences,
            ...(options.medium === "video" ? { videoMode } : {}),
            includeStoryboard: options.medium === "video" && videoMode === "reference",
            includePreviousShot: options.medium === "image" || videoMode === "reference",
            stylePresetId: options.stylePresetId,
            directorStyleId: options.directorStyleId,
        });
        if (!context) {
            compileError = "无法编译镜头上下文";
        } else {
            prompt = context.prompt;
            compilerVersion = context.compilerVersion;
            references = context.references.map((ref) => ({ role: ref.role, label: ref.label }));
            context.warnings.forEach((warning) => issues.push({ level: "warning", message: warning }));
        }
    } catch (error) {
        compileError = errorMessage(error);
    }
    if (compileError) issues.push({ level: "error", message: compileError });
    return {
        medium: options.medium,
        scene,
        styleName,
        previousShot: previous && previousPayload ? { id: previous.id, shotNo: previousPayload.shotNo || previous.title || previous.id } : null,
        contexts: selectFilmShotContexts(nodes, connections, shotId),
        references,
        prompt,
        compilerVersion,
        issues,
        ready: issues.every((issue) => issue.level !== "error"),
        compileError,
    };
}
