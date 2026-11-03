import type { VideoResponse } from "@/services/api/video";

import type { CanvasNodeMetadata } from "../../types";

/**
 * 画布任务状态与元数据解析：全部为纯函数，供画布主组件和单元测试共用。
 */

export function canvasTaskCompleted(status?: string) {
    return ["completed", "complete", "done", "succeeded", "success"].includes((status || "").toLowerCase());
}

export function canvasTaskFailed(status?: string) {
    return ["failed", "fail", "error", "cancelled", "canceled"].includes((status || "").toLowerCase());
}

export function parseCanvasTaskTime(value: unknown) {
    if (typeof value === "number") return value > 100000000000 ? value : value * 1000;
    if (typeof value !== "string" || !value.trim()) return 0;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 100000000000 ? numeric : numeric * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function parseCanvasVideoTaskTime(value: unknown) {
    return parseCanvasTaskTime(value);
}

export function parseCanvasVideoTaskSize(value: unknown, fallback: { width: number; height: number }) {
    const match = typeof value === "string" ? value.match(/^(\d+)x(\d+)$/) : null;
    return { width: match ? Number(match[1]) : fallback.width, height: match ? Number(match[2]) : fallback.height };
}

export function canvasVideoTaskId(metadata?: CanvasNodeMetadata) {
    return metadata?.videoTaskVideoId || metadata?.videoTaskId || "";
}

export function canvasVideoTaskCompleted(task: { video_url?: string; url?: string; status?: string }) {
    return Boolean(task.video_url || task.url) || canvasTaskCompleted(task.status);
}

export function canvasVideoTaskFailed(task: { status?: string }) {
    return canvasTaskFailed(task.status);
}

export function canvasVideoTaskFromMetadata(metadata?: CanvasNodeMetadata): VideoResponse {
    return {
        id: canvasVideoTaskId(metadata),
        task_id: metadata?.videoTaskId,
        video_id: metadata?.videoTaskVideoId,
        model: metadata?.model,
        status: metadata?.status,
        progress: metadata?.progress,
        ...(metadata?.videoTaskTranslation ? { parameter_translation: true, translationSnapshot: metadata.videoTaskTranslation } : {}),
    };
}

export function canvasImageTaskURLs(task: { image_urls?: string[]; image_url?: string; url?: string }) {
    return [...new Set([...(task.image_urls || []), task.image_url || task.url || ""].map((url) => url.trim()).filter(Boolean))];
}

export function canvasImageTaskChildIds(nodeId: string, task: { image_urls?: string[]; image_url?: string; url?: string }) {
    return canvasImageTaskURLs(task).map((_, index) => `${nodeId}-result-${index}`);
}

export function canvasTaskMediaURL(task: { video_url?: string; url?: string; image_url?: string; image_urls?: string[] }) {
    if ("video_url" in task) return task.video_url || task.url;
    if ("image_url" in task || "image_urls" in task) return canvasImageTaskURLs(task)[0];
    return task.url;
}