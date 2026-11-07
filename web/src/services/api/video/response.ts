import { isMiniMaxH3Config } from "@/lib/minimax-video";
import { geminiErrorMessage, isGeminiConfig, isGeminiVideoModel } from "@/lib/gemini";
import { type AiConfig } from "@/stores/use-config-store";

import { firstString } from "./client";
import { VideoRequestError } from "./types";
import type { ApiVideoEnvelope, ApiVideoResponse, VideoResponse } from "./types";


export function unwrapVideoResponse(payload: ApiVideoResponse): VideoResponse {
    if (!payload) throw new Error("接口没有返回视频任务");
    if (isVideoEnvelope(payload)) {
        if (payload.code !== 0) throw new VideoRequestError(payload.msg || payload.message || "请求失败", payload);
        if (!payload.data || Array.isArray(payload.data)) throw new Error("接口没有返回视频任务");
        return normalizeVideoResponse(payload.data);
    }
    const error = videoPayloadErrorMessage(payload);
    if (error) throw new VideoRequestError(error, payload);
    if (payload.error?.message) throw new VideoRequestError(payload.error.message, payload);
    return normalizeVideoResponse(payload);
}

export function unwrapVideoResponseForConfig(config: AiConfig, model: string, payload: ApiVideoResponse) {
    const data = (payload as ApiVideoEnvelope).data;
    if ((payload as VideoResponse).parameter_translation || data && !Array.isArray(data) && data.parameter_translation) return unwrapVideoResponse(payload);
    if (isGeminiVideoModel(model) && isGeminiConfig(config, model)) return normalizeGeminiVideoResponse(payload);
    if (isMiniMaxH3Config(config, model)) {
        const root = payload as unknown as Record<string, unknown>;
        const task = root.task && typeof root.task === "object" ? root.task as Record<string, unknown> : null;
        if (task) {
            const content = task.content && typeof task.content === "object" ? task.content as Record<string, unknown> : {};
            return normalizeVideoResponse({
                ...task,
                task_id: firstString(task.id),
                video_url: firstString(content.url, task.video_url),
                seconds: task.duration == null ? undefined : String(task.duration),
                size: firstString(task.resolution, task.size),
            });
        }
    }
    return unwrapVideoResponse(payload);
}

function normalizeGeminiVideoResponse(payload: ApiVideoResponse): VideoResponse {
    const root = payload as unknown as Record<string, unknown>;
    if (typeof root.code === "number") return unwrapVideoResponse(payload);
    const name = firstString(root.name);
    const error = root.error && typeof root.error === "object" ? root.error as Record<string, unknown> : {};
    const videoUrl = geminiVideoUri(root);
    const done = root.done === true;
    return normalizeVideoResponse({
        ...root,
        id: name,
        task_id: name,
        status: Object.keys(error).length ? "failed" : done && videoUrl ? "completed" : done ? "failed" : "processing",
        progress: done ? 100 : 0,
        video_url: videoUrl,
        error: Object.keys(error).length ? { message: geminiErrorMessage(root, "视频生成失败") } : done && !videoUrl ? { message: "Gemini Veo 任务完成但没有返回视频地址" } : undefined,
    });
}

function geminiVideoUri(value: unknown, depth = 0): string {
    if (depth > 8 || value == null) return "";
    if (typeof value === "string") return /^https?:\/\//.test(value) ? value : "";
    if (Array.isArray(value)) return value.map((item) => geminiVideoUri(item, depth + 1)).find(Boolean) || "";
    if (typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const direct = firstString(record.uri, record.videoUri, record.video_url, record.url);
    if (/^https?:\/\//.test(direct)) return direct;
    for (const item of Object.values(record)) {
        const found = geminiVideoUri(item, depth + 1);
        if (found) return found;
    }
    return "";
}

function isVideoEnvelope(payload: ApiVideoResponse): payload is ApiVideoEnvelope {
    return "code" in payload && typeof payload.code === "number";
}

export function normalizeVideoResponse(value: unknown): VideoResponse {
    const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    const id = firstString(record.id, record.request_id, record.task_id, record.video_id, firstTaskId(record));
    return {
        ...(record as VideoResponse),
        id,
        task_id: firstString(record.task_id, record.id),
        video_id: firstString(record.video_id),
        source_id: firstString(record.source_id, record.sourceId),
        sourceId: firstString(record.sourceId, record.source_id),
        channelId: firstString(record.channelId, record.channel_id),
        userChannelId: firstString(record.userChannelId, record.user_channel_id),
        channelName: firstString(record.channelName, record.channel_name),
        status: firstString(record.status, record.state, record.task_status),
        video_url: firstString(record.video_url, record.videoUrl, record.remixed_from_video_id, record.output_url, record.download_url, firstVideoUrl(record)),
        progress: typeof record.progress === "number" ? record.progress : (typeof record.progress === "string" ? parseFloat(record.progress) : undefined),
    };
}

export function isCompletedVideoStatus(status?: string) {
    return ["completed", "complete", "done", "succeeded", "success"].includes((status || "").toLowerCase());
}

export function isFailedVideoStatus(status?: string) {
    return ["failed", "fail", "error", "cancelled", "canceled"].includes((status || "").toLowerCase());
}

function videoPayloadErrorMessage(value: unknown): string {
    const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    if (typeof record.code === "number" && record.code !== 0) return firstString(record.msg, record.message, nestedMessage(record.error)) || "视频下载失败";
    if (typeof record.code === "string" && /fail|error/i.test(record.code)) return firstString(nestedMessage(record.error), record.msg, record.message, record.code);
    return firstString(nestedMessage(record.error));
}

function nestedMessage(value: unknown) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    return firstString((value as Record<string, unknown>).message);
}

function firstVideoUrl(value: unknown, depth = 0): string {
    if (depth > 5 || value == null) return "";
    if (typeof value === "string") return /^https?:\/\//.test(value) ? value : "";
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = firstVideoUrl(item, depth + 1);
            if (found) return found;
        }
        return "";
    }
    if (typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const direct = firstString(record.video_url, record.videoUrl, record.url, record.remixed_from_video_id, record.output_url, record.download_url, record.file_url);
    if (/^https?:\/\//.test(direct)) return direct;
    for (const key of ["video_result", "video", "data", "output", "result", "content", "metadata"]) {
        const found = firstVideoUrl(record[key], depth + 1);
        if (found) return found;
    }
    return "";
}

function firstTaskId(value: unknown, depth = 0): string {
    if (depth > 4 || value == null) return "";
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = firstTaskId(item, depth + 1);
            if (found) return found;
        }
        return "";
    }
    if (typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const direct = firstString(record.id, record.request_id, record.task_id, record.video_id);
    if (direct) return direct;
    for (const key of ["data", "result", "output", "video"]) {
        const found = firstTaskId(record[key], depth + 1);
        if (found) return found;
    }
    return "";
}
