import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { orderFilmShots } from "./film-layout";
import { buildFilmShotGenerationFromGraph } from "./film-shot-generation-context";
import { filmFrameReady, filmVideoMode } from "./film-shot-video-frames";
import type { FilmShotBatchKind } from "./film-studio-types";

export type FilmBatchSkipReason = "missing-shot" | "no-text" | "busy" | "frames-missing-first" | "compile-error";

export type FilmBatchPlanItem = { shotId: string; shotNo: string; title: string };

export type FilmBatchSkip = FilmBatchPlanItem & { reason: FilmBatchSkipReason; message: string };

export type FilmBatchWarningShot = { shotId: string; shotNo: string; warnings: string[] };

export type FilmBatchPlan = {
    kind: FilmShotBatchKind;
    ready: FilmBatchPlanItem[];
    skipped: FilmBatchSkip[];
    warningShots: FilmBatchWarningShot[];
    warnings: number;
};

const SKIP_MESSAGES: Record<FilmBatchSkipReason, string> = {
    "missing-shot": "镜头不存在或不是影视镜头",
    "no-text": "缺少画面描述或提示词",
    busy: "正在生成或停止中",
    "frames-missing-first": "首尾帧模式缺少首帧",
    "compile-error": "上下文编译失败",
};

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

/** 批量执行清单：顺序与全片镜头链一致，跳过原因与单镜生成保持一致。 */
export function planFilmShotBatch(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotIds: Iterable<string>,
    kind: FilmShotBatchKind,
    options: { maxReferences: number; stylePresetId?: string; directorStyleId?: string },
): FilmBatchPlan {
    const shots = nodes.filter((node) => node.type === CanvasNodeType.FilmShot);
    const order = new Map(orderFilmShots(shots, connections).map((node, index) => [node.id, index]));
    const unique = [...new Set(shotIds)].sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
    const ready: FilmBatchPlanItem[] = [];
    const skipped: FilmBatchSkip[] = [];
    const warningShots: FilmBatchWarningShot[] = [];
    for (const shotId of unique) {
        const node = nodes.find((item) => item.id === shotId && item.type === CanvasNodeType.FilmShot);
        const payload = node?.metadata?.filmShot;
        const item = { shotId, shotNo: payload?.shotNo || node?.title || shotId, title: node?.title || shotId };
        const skip = (reason: FilmBatchSkipReason, message = SKIP_MESSAGES[reason]) => skipped.push({ ...item, reason, message });
        if (!node || !payload) {
            skip("missing-shot");
            continue;
        }
        if (!(payload.prompt || payload.description || "").trim()) {
            skip("no-text");
            continue;
        }
        if (node.metadata?.status === "loading" || node.metadata?.status === "stopping") {
            skip("busy");
            continue;
        }
        const videoMode = filmVideoMode(payload);
        if (kind === "video" && videoMode === "frames" && !filmFrameReady(payload.firstFrame)) {
            skip("frames-missing-first");
            continue;
        }
        try {
            const context = buildFilmShotGenerationFromGraph(nodes, connections, shotId, {
                medium: kind,
                maxReferences: options.maxReferences,
                ...(kind === "video" ? { videoMode } : {}),
                includeStoryboard: kind === "video" && videoMode === "reference",
                includePreviousShot: kind === "image" || videoMode === "reference",
                stylePresetId: options.stylePresetId,
                directorStyleId: options.directorStyleId,
            });
            if (!context) {
                skip("compile-error", "无法编译镜头上下文");
                continue;
            }
            if (context.warnings.length) warningShots.push({ shotId, shotNo: item.shotNo, warnings: context.warnings });
            ready.push(item);
        } catch (error) {
            skip("compile-error", errorMessage(error));
        }
    }
    return {
        kind,
        ready,
        skipped,
        warningShots,
        warnings: warningShots.reduce((sum, shot) => sum + shot.warnings.length, 0),
    };
}
