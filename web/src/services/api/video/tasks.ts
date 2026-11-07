import axios from "axios";
import { nanoid } from "nanoid";
import { WorkflowRequestError } from "../workflow-generation";
import { BrowserParameterTranslation, findParameterTranslation, normalizeTranslationAspectRatio, translationBody, translationHeaders, translationMediaAddress, type MatchedTranslation, type TranslationInput, type TranslationResult } from "../channel-parameter-translation";
import { isMiniMaxH3Config } from "@/lib/minimax-video";
import { geminiActionUrl, isGeminiConfig } from "@/lib/gemini";
import { boolConfig } from "@/lib/seedance-video";
import { isCogVideoX3Model } from "@/lib/video-model-capabilities";
import { resolveMediaUrl } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { directAIProviderForConfig, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { aiApiUrl, aiHeaders, refreshRemoteUser, usesAccountProxy } from "../ai-request";
import { ReferenceImage } from "@/types/image";
import { ReferenceAudio, ReferenceVideo } from "@/types/media";

import { readAxiosError, stringifyLogPayload, summarizeVideoRequestBody, withoutVideoModel, writeVideoAICallLog } from "./client";
import { cacheProtectedGeminiVideo, cacheProtectedVideo, syncGeneratedVideo } from "./media";
import { aiVideoPollUrl, createVideoRequestBody, elementReferenceToInputUrl, isGrok2APIVideoConfig, miniMaxApiUrl, publicHttpUrl, videoChannelProtocol, videoPollId } from "./payload";
import { isCompletedVideoStatus, isFailedVideoStatus, normalizeVideoResponse, unwrapVideoResponse, unwrapVideoResponseForConfig } from "./response";
import { VIDEO_POLL_INTERVAL_MS, VideoRequestError } from "./types";
import type { ApiVideoEnvelope, ApiVideoResponse, CreatedVideoGenerationTask, VideoGenerationResult, VideoProgressHandler, VideoReferenceInput, VideoResponse, VideoTaskCreateOptions } from "./types";


export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] | VideoReferenceInput = [], videoReferencesOrProgress?: ReferenceVideo[] | ((progress: number) => void), audioReferences: ReferenceAudio[] = []) {
    const legacyVideoReferences = Array.isArray(videoReferencesOrProgress) ? videoReferencesOrProgress : undefined;
    const onProgress = typeof videoReferencesOrProgress === "function" ? videoReferencesOrProgress : undefined;
    const input = legacyVideoReferences ? { references: Array.isArray(references) ? references : references.references || [], videoReferences: legacyVideoReferences, audioReferences } : references;
    const created = await createVideoGenerationTask(config, prompt, input, onProgress ? (progress) => onProgress(progress) : undefined);
    return pollCreatedVideoGenerationTask(config, created.task, { startedAt: created.startedAt, requestBody: created.requestBody, onProgress: onProgress ? (progress) => onProgress(progress) : undefined });
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] | VideoReferenceInput = [], onProgress?: VideoProgressHandler, options?: string | VideoTaskCreateOptions): Promise<CreatedVideoGenerationTask> {
    const model = config.model || config.videoModel;
    const systemPrompt = (config.systemPrompts.video || config.systemPrompt).trim();
    const translation = await findParameterTranslation({...config,model});
    if (translation) return createTranslatedVideoTask({...config,model},translation,systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,normalizeVideoReferenceInput(references),normalizeVideoTaskCreateOptions(options),onProgress);
    const body = await createVideoRequestBody(config, model, systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt, normalizeVideoReferenceInput(references));
    const startedAt = Date.now();
    try {
        const createOptions = normalizeVideoTaskCreateOptions(options);
        const accountProxy = usesAccountProxy(config);
        const headers = { ...aiHeaders(config), ...(accountProxy && createOptions.clientTaskId ? { "X-Client-Video-Task-ID": createOptions.clientTaskId } : {}), ...(accountProxy && createOptions.source ? { "X-Video-Task-Source": createOptions.source } : {}), ...(accountProxy && createOptions.sourceId ? { "X-Video-Task-Source-ID": createOptions.sourceId } : {}) };
        const directProvider = !accountProxy ? directAIProviderForConfig(config) : null;
        const channel = localChannelForActiveModel(config);
        const createUrl = !accountProxy && isGeminiConfig(config, model)
            ? geminiActionUrl(channel?.baseUrl || config.baseUrl, model, "predictLongRunning")
            : !accountProxy && isMiniMaxH3Config(config, model)
                ? miniMaxApiUrl(config, "/v2/video_generation")
                : aiApiUrl(config, !accountProxy && (isGrok2APIVideoConfig(config, model) || isCogVideoX3Model(model)) ? "/videos/generations" : "/videos");
        const requestBody = !accountProxy && isGeminiConfig(config, model) ? withoutVideoModel(body) : body;
        if (typeof window !== "undefined") {
            console.info("[video] 发起视频任务", {
                model,
                videoModel: config.videoModel,
                channelMode: config.channelMode,
                accountProxy,
                createUrl,
                protocol: videoChannelProtocol(config, model),
                requestModel: (requestBody as Record<string, unknown>).model,
            });
        }
        createOptions.signal?.throwIfAborted();
        if (accountProxy) createOptions.onServerTask?.();
        const created = directProvider
            ? await (await import("@/services/api/direct-ai")).createDirectVideoTask(config, directProvider, body, createOptions.signal)
            : unwrapVideoResponseForConfig(config, model, (await axios.post<ApiVideoResponse>(createUrl, requestBody, { headers, signal: accountProxy ? undefined : createOptions.signal })).data);
        if (!created.id && !created.video_id) throw new Error("视频接口没有返回任务 ID");
        refreshRemoteUser(config);
        const task = await syncGeneratedVideo(created, config);
        if (typeof task.progress === "number") onProgress?.(task.progress, task);
        return { task, pollId: videoPollId(model, task), startedAt, requestBody: body };
    } catch (error) {
        const { message, detail } = readAxiosError(error, "视频生成失败");
        void writeVideoAICallLog(config, model, "/videos", "POST", startedAt, axios.isAxiosError(error) ? error.response?.status || 0 : 0, stringifyLogPayload(summarizeVideoRequestBody(body)), stringifyLogPayload(detail), message);
        throw new VideoRequestError(message, detail);
    }
}

async function createTranslatedVideoTask(config: AiConfig, match: MatchedTranslation, prompt: string, references: Required<VideoReferenceInput>, options: VideoTaskCreateOptions, onProgress?: VideoProgressHandler): Promise<CreatedVideoGenerationTask> {
    const imageURL = async (image: ReferenceImage) => publicHttpUrl(image.url) || publicHttpUrl(image.dataUrl) || imageToDataUrl(image);
    const mediaURL = async (media: ReferenceAudio) => translationMediaAddress(await resolveMediaUrl(media.storageKey, media.url));
    const input: TranslationInput = {
        kind: "video",
        variables: {
            model: config.model,
            prompt,
            size: config.size,
            aspectRatio: normalizeTranslationAspectRatio(config.size),
            resolution: config.vquality,
            seconds: Number(config.videoSeconds),
            mode: config.videoMode,
            negativePrompt: config.videoNegativePrompt,
            generateAudio: boolConfig(config.videoGenerateAudio, true),
            watermark: boolConfig(config.videoWatermark, false),
            images: await Promise.all(references.references.map(imageURL)),
            videos: await Promise.all(references.videoReferences.map((reference) => elementReferenceToInputUrl({ ...reference, kind: "video" }))),
            audios: await Promise.all(references.audioReferences.map(mediaURL)),
            firstFrame: references.firstFrame ? await imageURL(references.firstFrame) : "",
            lastFrame: references.lastFrame ? await imageURL(references.lastFrame) : "",
        },
    };
    const startedAt = Date.now();
    let task: VideoResponse;
    if (match.accountProxy) {
        options.signal?.throwIfAborted();
        options.onServerTask?.();
        const clientTaskId = options.clientTaskId || `client_video_task_${nanoid()}`;
        const response = await axios.post<Blob>("/api/v1/videos", translationBody(config, input), {
            responseType: "blob",
            headers: {
                ...translationHeaders(config, match),
                "X-Client-Video-Task-ID": clientTaskId,
                ...(options.source ? { "X-Video-Task-Source": options.source } : {}),
                ...(options.sourceId ? { "X-Video-Task-Source-ID": options.sourceId } : {}),
            },
        });
        if (response.data.type.includes("json")) task = unwrapVideoResponseForConfig(config, config.model, JSON.parse(await response.data.text()));
        else task = await cacheProtectedVideo(config, config.model, await pollVideoGenerationTask(clientTaskId), undefined, new Response(response.data));
    } else {
        const translation = await BrowserParameterTranslation.create(config, match, input);
        let result: TranslationResult;
        try {
            result = await translation.send(false, "", options.signal);
        } finally {
            translation.dispose();
        }
        const channel = localChannelForActiveModel(config);
        task = {
            id: options.clientTaskId || `local_video_task_${nanoid()}`,
            model: config.model,
            status: result.status,
            progress: result.progress,
            video_url: result.urls[0],
            storageKey: result.storageKey,
            parameter_translation: true,
            translationSnapshot: { match, input, baseUrl: channel?.baseUrl || config.baseUrl, protocol: channel?.protocol || "openai", taskIds: result.taskIds || [], completed: {} },
        };
    }
    refreshRemoteUser(config);
    task = await syncGeneratedVideo(task, config, true);
    onProgress?.(task.progress || 0, task);
    return { task, pollId: task.id, startedAt, requestBody: translationBody(config, input) };
}

async function pollLocalTranslatedVideo(config: AiConfig, task: VideoResponse, signal?: AbortSignal): Promise<VideoResponse> {
    if (isCompletedVideoStatus(task.status) || isFailedVideoStatus(task.status)) return task;
    const snapshot = task.translationSnapshot!;
    const channel = config.localChannels.find((item) => item.id === snapshot.match.channelId);
    if (!channel) throw new VideoRequestError("视频任务对应的本地渠道已不存在");
    const currentConfig = { ...config, model: task.model || String(snapshot.input.variables.model), activeChannelId: snapshot.match.channelId, localChannels: [{ ...channel, baseUrl: snapshot.baseUrl, protocol: snapshot.protocol }] } satisfies AiConfig;
    const translation = await BrowserParameterTranslation.create(currentConfig, snapshot.match, snapshot.input);
    const completed = { ...snapshot.completed };
    let progress = 0;
    try {
        for (const id of snapshot.taskIds) {
            const result = completed[id] || (await translation.send(true, id, signal));
            progress += result.progress;
            if (result.status === "completed") completed[id] = result;
        }
    } catch (error) {
        if (!(error instanceof WorkflowRequestError && error.retryable)) throw error;
    } finally {
        translation.dispose();
    }
    const done = Object.keys(completed).length === snapshot.taskIds.length;
    return { ...task, status: done ? "completed" : "processing", progress: done ? 100 : progress / snapshot.taskIds.length, video_url: done ? completed[snapshot.taskIds[0]].urls[0] : undefined, storageKey: done ? completed[snapshot.taskIds[0]].storageKey : task.storageKey, translationSnapshot: { ...snapshot, completed } };
}

function normalizeVideoTaskCreateOptions(options?: string | VideoTaskCreateOptions): VideoTaskCreateOptions {
    return typeof options === "string" ? { clientTaskId: options } : options || {};
}

/** 轮询等待可被停止信号打断，避免 abort 后仍等满 5 秒再发下一轮请求。 */
function sleepWithSignal(ms: number, signal?: AbortSignal) {
    if (!signal) return new Promise<void>((resolve) => setTimeout(resolve, ms));
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export async function pollCreatedVideoGenerationTask(config: AiConfig, task: VideoResponse, { startedAt = Date.now(), requestBody, initialDelayMs = 0, onProgress, onPoll, signal }: { startedAt?: number; requestBody?: unknown; initialDelayMs?: number; onProgress?: VideoProgressHandler; onPoll?: (task: VideoResponse) => void; signal?: AbortSignal } = {}) {
    const model = config.model || config.videoModel;
    const pollId = videoPollId(model, task);
    if (!pollId) throw new VideoRequestError("视频接口没有返回任务 ID", task);
    const directProvider = !usesAccountProxy(config) ? directAIProviderForConfig(config) : null;
    const directPoll = directProvider && !task.parameter_translation ? (await import("@/services/api/direct-ai")).pollDirectVideoTask : null;
    let currentTask = task;
    const pollOnce = task.translationSnapshot ? async () => { currentTask = await pollLocalTranslatedVideo(config,currentTask,signal); return currentTask; } : task.parameter_translation && isCompletedVideoStatus(task.status) ? async () => task : directProvider && directPoll
        ? () => directPoll(config, directProvider, pollId, signal)
        : async () => unwrapVideoResponseForConfig(config, model, (await axios.get<ApiVideoResponse>(aiVideoPollUrl(config, model, pollId), { headers: aiHeaders(config), params: usesAccountProxy(config) ? { model } : undefined, signal })).data);
    let completed: VideoResponse | null = null;
    try {
        signal?.throwIfAborted();
        if (initialDelayMs > 0) await sleepWithSignal(initialDelayMs, signal);
        for (; ;) {
            signal?.throwIfAborted();
            const polled: VideoResponse = await pollOnce();
            const video = polled.parameter_translation ? await syncGeneratedVideo(polled, config, true) : await cacheProtectedVideo(config, model, await cacheProtectedGeminiVideo(config, model, polled));
            onPoll?.(video);
            if (isFailedVideoStatus(video.status)) throw new VideoRequestError(video.error?.message || "视频生成失败", video);
            if (typeof video.progress === "number") onProgress?.(video.progress, video);
            if (isCompletedVideoStatus(video.status) || video.video_url || video.url) {
                completed = video;
                break;
            }
            await sleepWithSignal(VIDEO_POLL_INTERVAL_MS, signal);
        }
        const videoUrl = completed?.video_url || completed?.url || "";
        if (!videoUrl) throw new VideoRequestError("视频生成完成但没有返回视频地址", completed);
        const result = buildVideoGenerationResult(completed, videoUrl, Date.now() - startedAt);
        void writeVideoAICallLog(config, model, "/videos", "POST", startedAt, 200, stringifyLogPayload(requestBody ? summarizeVideoRequestBody(requestBody) : { taskId: pollId }), stringifyLogPayload({ task: completed, video: result }), "");
        refreshRemoteUser(config);
        return result;
    } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        const { message, detail } = readAxiosError(error, "视频生成失败");
        void writeVideoAICallLog(config, model, "/videos", "POST", startedAt, axios.isAxiosError(error) ? error.response?.status || 0 : 0, stringifyLogPayload(requestBody ? summarizeVideoRequestBody(requestBody) : { taskId: pollId }), stringifyLogPayload(detail), message);
        throw new VideoRequestError(message, detail);
    }
}

export async function pollVideoGenerationTaskStatus(config: AiConfig, task: VideoResponse, signal?: AbortSignal) {
    if (task.translationSnapshot) return syncGeneratedVideo(await pollLocalTranslatedVideo(config,task,signal),config,true);
    const model = config.model || config.videoModel;
    const pollId = videoPollId(model, task);
    if (!pollId) throw new VideoRequestError("视频接口没有返回任务 ID", task);
    const directProvider = !usesAccountProxy(config) ? directAIProviderForConfig(config) : null;
    const result: VideoResponse = directProvider && !task.parameter_translation
        ? await (await import("@/services/api/direct-ai")).pollDirectVideoTask(config, directProvider, pollId, signal)
        : unwrapVideoResponseForConfig(config, model, (await axios.get<ApiVideoResponse>(aiVideoPollUrl(config, model, pollId), { headers: aiHeaders(config), params: usesAccountProxy(config) ? { model } : undefined, signal })).data);
    return syncGeneratedVideo(result.parameter_translation ? result : await cacheProtectedGeminiVideo(config, model, await cacheProtectedVideo(config, model, result)), config, true);
}

export async function listVideoGenerationTasks(config: AiConfig) {
    if (!usesAccountProxy(config)) return [];
    const payload = (await axios.get<ApiVideoEnvelope>("/api/v1/video-tasks", { headers: aiHeaders(config) })).data;
    if (payload.code !== 0) throw new VideoRequestError(payload.msg || payload.message || "读取视频任务失败", payload);
    return Array.isArray(payload.data) ? payload.data.map(normalizeVideoResponse) : [];
}

export async function deleteVideoGenerationTask(config: AiConfig, task?: VideoResponse | null) {
    if (!usesAccountProxy(config) || !task) return;
    const id = task.id || task.task_id || task.video_id;
    if (!id) return;
    const payload = (await axios.delete<ApiVideoEnvelope>(`/api/v1/video-tasks/${encodeURIComponent(id)}`, { headers: aiHeaders(config) })).data;
    if (payload.code !== 0) throw new VideoRequestError(payload.msg || payload.message || "删除视频任务失败", payload);
}

function normalizeVideoReferenceInput(input: ReferenceImage[] | VideoReferenceInput): Required<VideoReferenceInput> {
    if (Array.isArray(input)) return { references: input, videoReferences: [], audioReferences: [], firstFrame: null, lastFrame: null };
    return { references: input.references || [], videoReferences: input.videoReferences || [], audioReferences: input.audioReferences || [], firstFrame: input.firstFrame || null, lastFrame: input.lastFrame || null };
}

function buildVideoGenerationResult(task: VideoResponse, url: string, durationMs: number): VideoGenerationResult {
    const size = parseVideoSize((task as Record<string, unknown>).size);
    return { id: task.id, url, durationMs, width: size.width, height: size.height, bytes: 0, mimeType: "video/mp4", task };
}

function parseVideoSize(value: unknown) {
    const match = typeof value === "string" ? value.match(/^(\d+)x(\d+)$/) : null;
    return { width: match ? Number(match[1]) : 1280, height: match ? Number(match[2]) : 720 };
}

// 兼容旧版 video/page.tsx 的导出名
export type { VideoGenerationResult as VideoGenerationTask };

export async function pollVideoGenerationTask(taskId: string): Promise<VideoResponse> {
    const config = { channelMode: "remote" as const, model: "", videoModel: "" } as AiConfig;
    const token = useUserStore.getState().token;
    if (!token) throw new Error("请先登录");
    const response = await axios.get<ApiVideoEnvelope>(aiApiUrl(config, `/videos/${encodeURIComponent(taskId)}?model=`), { headers: { Authorization: `Bearer ${token}` } });
    return unwrapVideoResponse(response.data);
}

export function storeGeneratedVideo(result: VideoGenerationResult) {
    return result;
}
