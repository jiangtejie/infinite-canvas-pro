import type { CanvasAudioTask } from "@/services/api/audio";
import type { CanvasImageTask } from "@/services/api/image";
import type { VideoResponse } from "@/services/api/video";
import { comfyOutputStorageKey, submitWorkflowTask, workflowMediaSource, type WorkflowGenerationTask } from "@/services/api/workflow-generation";
import { downloadRemoteMedia, uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import type { WorkflowRef } from "@/lib/workflow-channel";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export async function submitCanvasWorkflowTask(ref: WorkflowRef, config: AiConfig, mode: "image" | "video" | "audio", prompt: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[], nodeId: string, projectId: string, clientTaskId: string, onServerTask?: () => void, signal?: AbortSignal) {
    const token = useUserStore.getState().token;
    if (!token) throw new Error("工作流生成需要先登录");
    const [referenceImages, referenceVideos, referenceAudios] = await Promise.all([
        Promise.all(images.map((image) => workflowMediaSource(image.dataUrl))),
        Promise.all(videos.map((video) => workflowMediaSource(video.url, ref))),
        Promise.all(audios.map((audio) => workflowMediaSource(audio.url))),
    ]);
    if (useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    signal?.throwIfAborted();
    onServerTask?.();
    const task = await submitWorkflowTask(token, {
        ref,
        expectedCapability: mode,
        prompt,
        systemPrompt: config.systemPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        size: config.size,
        quality: config.quality,
        count: mode === "image" ? 1 : undefined,
        videoSeconds: config.videoSeconds,
        videoQuality: config.vquality,
        videoGenerateAudio: config.videoGenerateAudio === "true",
        videoWatermark: config.videoWatermark === "true",
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: Number(config.audioSpeed) || 1,
        audioInstructions: config.audioInstructions,
        source: "canvas", sourceId: projectId, nodeId, clientTaskId,
    });
    if (useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    return task;
}

export async function workflowImageTask(task: WorkflowGenerationTask, token = useUserStore.getState().token): Promise<CanvasImageTask> {
    if (!token || useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    const images = task.status === "succeeded" ? await Promise.all((task.urls || []).map((url) => {
        const storageKey = comfyOutputStorageKey(url);
        return storageKey ? { url, storageKey, width: 0, height: 0, bytes: 0, mimeType: "image/png" } : uploadImage(url, { token });
    })) : [];
    if (useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    return { id: task.id, source: "workflow", status: task.status === "succeeded" ? "completed" : task.status, progress: task.progress, image_url: images[0]?.url, image_urls: images.map((image) => image.url), imageStorage: images, storageKey: images[0]?.storageKey, width: images[0]?.width, height: images[0]?.height, mimeType: images[0]?.mimeType, bytes: images[0]?.bytes, error: task.error ? { message: task.error } : undefined };
}

export async function workflowVideoTask(task: WorkflowGenerationTask, token = useUserStore.getState().token): Promise<VideoResponse> {
    if (!token || useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    const url = task.status === "succeeded" ? task.urls?.[0] || "" : "";
    const storageKey = comfyOutputStorageKey(url);
    const video = url && !storageKey ? await uploadMediaFile(await downloadRemoteMedia(url), "workflow-video", undefined, token) : null;
    if (useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    return { id: task.id, task_id: task.id, status: task.status === "succeeded" ? "completed" : task.status, progress: task.progress, video_url: video?.url || url, url: video?.url || url, storageKey: video?.storageKey || storageKey, error: task.error ? { message: task.error } : undefined };
}

export async function workflowAudioTask(task: WorkflowGenerationTask, token = useUserStore.getState().token): Promise<CanvasAudioTask> {
    if (!token || useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    const url = task.status === "succeeded" ? task.urls?.[0] || "" : "";
    const storageKey = comfyOutputStorageKey(url);
    const audio = url && !storageKey ? await uploadMediaFile(await downloadRemoteMedia(url), "workflow-audio", undefined, token) : null;
    if (useUserStore.getState().token !== token) throw new Error("登录状态已变化");
    return { id: task.id, status: task.status === "succeeded" ? "completed" : task.status, progress: task.progress, audio_url: audio?.url || url, url: audio?.url || url, storageKey: audio?.storageKey || storageKey, mimeType: audio?.mimeType || "audio/mpeg", bytes: audio?.bytes || 0, error: task.error ? { message: task.error } : undefined };
}
