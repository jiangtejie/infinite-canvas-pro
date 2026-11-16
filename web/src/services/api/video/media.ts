import { geminiDirectHeaders, isGeminiConfig } from "@/lib/gemini";
import { isTeamoVideoConfig } from "./payload/teamo";
import { uploadMediaFile, uploadRemoteMediaToServer } from "@/services/file-storage";
import { autoSyncToCloud } from "@/services/image-storage";
import { channelIdForActiveModel, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { aiApiUrl, aiHeaders, usesAccountProxy } from "../ai-request";

import { isCompletedVideoStatus, isFailedVideoStatus } from "./response";
import { VideoRequestError } from "./types";
import type { VideoResponse } from "./types";


function videoSyncKey(config: AiConfig, task: VideoResponse) {
    const channelId = config.channelMode === "remote" ? channelIdForActiveModel(config) : localChannelForActiveModel(config)?.id;
    return `${config.channelMode}:${channelId || config.baseUrl}:${task.id}:${task.task_id || ""}:${task.video_id || ""}`;
}

export async function syncGeneratedVideo(task: VideoResponse, config: AiConfig, contentResolved = false): Promise<VideoResponse> {
    const model = config.videoModel || config.model;
    const requestConfig = { ...config, model };
    const url = task.video_url || task.url || "";
    if (task.storageKey || isFailedVideoStatus(task.status) || (!isCompletedVideoStatus(task.status) && !url)) return task;
    if (task.parameter_translation && !url) return cacheProtectedVideo(requestConfig, model, task);
    const media = task.parameter_translation && url.startsWith("data:video/")
        ? await uploadMediaFile(url, "generated-video", `video:${videoSyncKey(requestConfig, task)}`)
        : await autoSyncToCloud(`video:${videoSyncKey(requestConfig, task)}`, async () => {
            const cached = contentResolved ? task : await cacheProtectedGeminiVideo(requestConfig, model, await cacheProtectedVideo(requestConfig, model, task));
            if (cached.storageKey) return { url: cached.video_url || cached.url || url, storageKey: cached.storageKey };
            return url ? uploadRemoteMediaToServer(url, "video") : null;
        });
    return media ? { ...task, url: media.url, video_url: media.url, storageKey: media.storageKey } : task;
}

export async function cacheProtectedVideo(config: AiConfig, model: string, task: VideoResponse, contentRequest?: RequestInit, contentResponse?: Response) {
    const requestConfig = { ...config, model };
    const url = task.video_url || task.url || "";
    const needsTaskContent = !url && ("object" in task && task.object === "video");
    const needsContentURL = /\/videos\/[^/?]+\/content(?:[?#]|$)/.test(contentRequest ? new URL(url).pathname : url);
    if (!isCompletedVideoStatus(task.status) || task.storageKey || (!needsTaskContent && !needsContentURL)) return task;
    const taskId = task.task_id || task.id || task.video_id || "";
    const response = contentResponse ?? await fetch(contentRequest ? url : `${aiApiUrl(requestConfig, `/videos/${encodeURIComponent(taskId)}/content`)}?model=${encodeURIComponent(model)}`, contentRequest || { headers: aiHeaders(requestConfig) });
    if (!response.ok) throw new VideoRequestError(`视频内容下载失败：${response.status}`, task);
    const blob = await response.blob();
    const translatedContent = task.parameter_translation && !url;
    if ((contentRequest || translatedContent) && (!blob.size || /json|^text\//i.test(blob.type))) throw new VideoRequestError("视频内容接口没有返回媒体文件", task);
    const media = await uploadMediaFile((contentRequest || translatedContent) && !blob.type.startsWith("video/") ? new Blob([blob], { type: "video/mp4" }) : blob, "generated-video", `video-content:${videoSyncKey(config, task)}`);
    return { ...task, url: media.url, video_url: media.url, storageKey: media.storageKey };
}

export async function cacheProtectedGeminiVideo(config: AiConfig, model: string, task: VideoResponse) {
    const requestConfig = { ...config, model };
    const url = task.video_url || task.url || "";
    if (isTeamoVideoConfig(requestConfig) || !isGeminiConfig(requestConfig, model) || !isCompletedVideoStatus(task.status) || task.storageKey || !url) return task;
    const localTaskId = task.id || task.task_id || "";
    const response = await fetch(
        usesAccountProxy(requestConfig) ? `${aiApiUrl(requestConfig, `/videos/${encodeURIComponent(localTaskId)}/content`)}?model=${encodeURIComponent(model)}` : url,
        { headers: usesAccountProxy(requestConfig) ? aiHeaders(requestConfig) : geminiDirectHeaders(requestConfig) },
    );
    if (!response.ok) throw new VideoRequestError(`视频内容下载失败：${response.status}`, task);
    const media = await uploadMediaFile(await response.blob(), "generated-video", `video-content:${videoSyncKey(config, task)}`);
    return { ...task, url: media.url, video_url: media.url, storageKey: media.storageKey };
}
