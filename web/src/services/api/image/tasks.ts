import axios from "axios";
import { findParameterTranslation, translationBody, translationHeaders } from "../channel-parameter-translation";
import { isMiniMaxChannel, miniMaxModels } from "@/lib/minimax-video";
import { dataUrlToFile } from "@/lib/image-utils";
import { isKIESeedreamLayerDecompositionModel } from "@/lib/kie-models";
import { isMimoChannel, mimoModels } from "@/lib/mimo-tts";
import { modelChannelAttributionHeaders } from "@/lib/model-channel";
import { geminiErrorMessage, isGeminiConfig, isTeamorouterBaseUrl, normalizeGeminiBaseUrl } from "@/lib/gemini";
import { autoSyncImage, imageToDataUrl, resolveImageUrl } from "@/services/image-storage";
import { buildApiUrl, channelIdForActiveModel, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { aiHeaders, refreshRemoteUser, usesAccountProxy } from "../ai-request";
import { fetchAutoDLWorkflows } from "../autodl";
import { ReferenceImage } from "@/types/image";
import { nanoid } from "nanoid";

import { fetchErrorDetail, readAxiosError } from "./client";
import { IMAGE_REQUEST_TIMEOUT_SECONDS, applyAgnesImageSize, applyImageGenerationOptions, applyImageGenerationParams, assertImageReferencesSupported, createChatImageBody, createGeminiImageBody, createGrokImageEditBody, createImageRequestParams, createResponsesImageTool, createResponsesInput, imageTranslationInput, isAgnesImageModel, isGrok2APIImageConfig, isZhipuImageModel, publicHttpUrl, withPromptGuard, withSystemPrompt } from "./payload";
import { requestImages } from "./request";
import { ImageRequestError } from "./types";
import type { CanvasImageTask, CanvasImageTaskOptions, ImageRequestParams, SeedableImageConfig } from "./types";


async function syncCanvasImageTask(task: CanvasImageTask, resultId = task.started_at): Promise<CanvasImageTask> {
    if (!["completed", "complete", "done", "succeeded", "success"].includes((task.status || "").toLowerCase())) return task;
    const urls = [...new Set([...(task.image_urls || []), task.image_url || task.url || ""].map((url) => url.trim()).filter(Boolean))];
    const imageStorage = await Promise.all(urls.map((url, index) => autoSyncImage(url, `${task.id}:${resultId}:${index}`, index === 0 ? task.storageKey : undefined)));
    if (!imageStorage.some(Boolean)) return task;
    const syncedUrls = urls.map((url, index) => imageStorage[index]?.url || url);
    const stored = imageStorage[0];
    return { ...task, ...(stored ? { storageKey: stored.storageKey, bytes: stored.bytes, mimeType: stored.mimeType } : {}), url: syncedUrls[0], image_url: syncedUrls[0], ...(task.image_urls?.length ? { image_urls: syncedUrls } : {}), imageStorage };
}

export async function createCanvasImageTask(config: SeedableImageConfig, prompt: string, references: ReferenceImage[], options: CanvasImageTaskOptions = {}): Promise<CanvasImageTask> {
	const translation = await findParameterTranslation(config);
    if (!usesAccountProxy(config)) {
        const images = await requestImages({ ...config, count: "1" }, prompt, references, options.signal);
        options.signal?.throwIfAborted();
        const [image] = images;
        if (!image) throw new Error("接口没有返回图片");
        return syncCanvasImageTask({
            id: options.clientTaskId || nanoid(),
            source: options.source || "canvas",
            source_id: options.sourceId || "",
            node_id: options.nodeId || "",
            model: config.model,
            prompt,
            status: "completed",
            progress: 100,
            image_url: image.dataUrl,
            ...(translation || isKIESeedreamLayerDecompositionModel(config.model) ? { image_urls: images.map((item) => item.dataUrl) } : {}),
        }, image.id);
    }
    const params = createImageRequestParams({ ...config, count: "1" });
    const request: RequestInit = translation ? {method:"POST",headers:translationHeaders(config,translation),body:JSON.stringify({endpoint:references.length ? "/images/edits" : "/images/generations",nodeId:options.nodeId || "",source:options.source || "canvas",sourceId:options.sourceId || "",clientTaskId:options.clientTaskId || "",prompt,request:translationBody(config,await imageTranslationInput(config,prompt,references,params))})} : await createCanvasImageTaskRequest({ ...config, count: "1" }, prompt, references, params, options);
    options.signal?.throwIfAborted();
    options.onServerTask?.();
    const response = await fetch("/api/v1/canvas/image-tasks", request);
    if (!response.ok) {
        const error = await fetchErrorDetail(response, "图片任务创建失败");
        throw new ImageRequestError(error.message, error.detail);
    }
    const payload = (await response.json()) as { code?: number; msg?: string; data?: CanvasImageTask };
    if (payload.code !== 0 || !payload.data) throw new ImageRequestError(payload.msg || "图片任务创建失败", payload);
    refreshRemoteUser(config);
    return syncCanvasImageTask(payload.data);
}

export async function pollCanvasImageTaskStatus(taskId: string, signal?: AbortSignal): Promise<CanvasImageTask> {
    const token = useUserStore.getState().token;
    if (!token) throw new Error("请先登录后再使用云端渠道");
    const response = await fetch(`/api/v1/canvas/image-tasks/${encodeURIComponent(taskId)}`, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        const error = await fetchErrorDetail(response, "读取图片任务失败");
        throw new ImageRequestError(error.message, error.detail);
    }
    const payload = (await response.json()) as { code?: number; msg?: string; data?: CanvasImageTask };
    if (payload.code !== 0 || !payload.data) throw new ImageRequestError(payload.msg || "读取图片任务失败", payload);
    return syncCanvasImageTask(payload.data);
}

async function createCanvasImageTaskRequest(config: SeedableImageConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams, options: CanvasImageTaskOptions): Promise<RequestInit> {
    assertImageReferencesSupported(config.model, references);
    const taskChannelId = channelIdForActiveModel(config);
    const taskChannelHeader: Record<string, string> = config.channelMode === "remote" && taskChannelId ? { "X-Model-Channel-ID": taskChannelId } : {};
    const tokenHeaders = { ...aiHeaders(config), ...taskChannelHeader };
    const jsonHeaders = { ...aiHeaders(config, "application/json"), ...taskChannelHeader };
    const meta = { nodeId: options.nodeId || "", source: options.source || "canvas", sourceId: options.sourceId || "", clientTaskId: options.clientTaskId || "", prompt, channelId: taskChannelId };
    if (isGeminiConfig(config)) {
        const body = await createGeminiImageBody(config, prompt, references, params);
        return {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ endpoint: references.length ? "/images/edits" : "/images/generations", ...meta, request: body }),
        };
    }
    if (references.length && isAgnesImageModel(config.model)) {
        const imageUrls = await Promise.all(
            references.map(async (ref) => {
                const resolvedUrl = await resolveImageUrl(ref.storageKey, "");
                for (const url of [ref.dataUrl, ref.url, resolvedUrl]) {
                    const publicUrl = publicHttpUrl(url);
                    if (publicUrl) return publicUrl;
                }
                return imageToDataUrl(ref);
            }),
        );
        const body: Record<string, unknown> = {
            model: config.model,
            prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
            extra_body: { image: imageUrls },
        };
        applyAgnesImageSize(body, config, params);
        return {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ endpoint: "/images/generations", ...meta, request: body }),
        };
    }
    if (config.apiMode === "chat" && !isZhipuImageModel(config.model)) {
        const inputImageDataUrls = references.length ? await Promise.all(references.map((image) => imageToDataUrl(image))) : [];
        return {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ endpoint: "/chat/completions", ...meta, request: createChatImageBody(config, prompt, inputImageDataUrls, params) }),
        };
    }
    if (config.apiMode === "responses" && !isZhipuImageModel(config.model)) {
        const inputImageDataUrls = references.length ? await Promise.all(references.map((image) => imageToDataUrl(image))) : [];
        const body: Record<string, unknown> = {
            model: config.model,
            input: createResponsesInput(config, withSystemPrompt(config, prompt), inputImageDataUrls),
            tools: [createResponsesImageTool(config, params, inputImageDataUrls.length > 0)],
            tool_choice: "required",
        };
        if (config.streamImages) body.stream = true;
        return {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ endpoint: "/responses", ...meta, request: body }),
        };
    }
    if (references.length && isGrok2APIImageConfig(config)) {
        const body = await createGrokImageEditBody(config, prompt, references, params);
        return {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ endpoint: "/images/edits", ...meta, request: body }),
        };
    }
    if (references.length) {
        const formData = new FormData();
        formData.set("_canvas_endpoint", "/images/edits");
        formData.set("_canvas_source", meta.source);
        formData.set("_canvas_node_id", meta.nodeId);
        formData.set("_canvas_source_id", meta.sourceId);
        formData.set("_canvas_task_id", meta.clientTaskId);
        formData.set("_canvas_prompt", meta.prompt);
        if (meta.channelId) formData.set("_canvas_channel_id", meta.channelId);
        formData.set("model", config.model);
        formData.set("prompt", withPromptGuard(config, withSystemPrompt(config, prompt)));
        if (params.n > 1) formData.set("n", String(params.n));
        if (params.quality && !config.codexCli) formData.set("quality", params.quality);
        if (config.responseFormatB64Json) formData.set("response_format", "b64_json");
        if (config.streamImages) {
            formData.set("stream", "true");
            formData.set("partial_images", String(params.streamPartialImages));
        }
        if (params.size) formData.set("size", params.size);
        const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
        files.forEach((file) => formData.append("image", file));
        return { method: "POST", headers: tokenHeaders, body: formData };
    }
    if (isAgnesImageModel(config.model)) {
        const body: Record<string, unknown> = {
            model: config.model,
            prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
        };
        applyAgnesImageSize(body, config, params);
        return {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ endpoint: "/images/generations", ...meta, request: body }),
        };
    }
    const body: Record<string, unknown> = {
        model: config.model,
        prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
    };
    applyImageGenerationParams(body, config, params);
    applyImageGenerationOptions(body, config, params);
    return {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ endpoint: "/images/generations", ...meta, request: body }),
    };
}

export async function fetchImageModels(config: AiConfig) {
    if (config.channelMode === "remote") return config.models;
    const channel = localChannelForActiveModel(config);
    if (channel?.protocol === "gemini" && isTeamorouterBaseUrl(channel.baseUrl)) return fetchTeamorouterModels(channel.baseUrl, channel.apiKey);
    if (channel?.protocol === "gemini") return fetchGeminiModels(channel.baseUrl, channel.apiKey);
    if (channel?.protocol === "autodl") return (await fetchAutoDLWorkflows(channel.baseUrl)).map((workflow) => workflow.uuid);
    if (isMiniMaxChannel(channel)) return [...miniMaxModels];
    if (isMimoChannel(channel || { baseUrl: config.baseUrl })) return [...mimoModels];
    if (channel?.protocol === "ark" && buildApiUrl(channel.baseUrl, "").toLowerCase().endsWith("/api/plan/v3")) return [
        "doubao-seed-2.0-mini",
        "doubao-seed-2.0-lite",
        "deepseek-v4-flash",
        "glm-5.3-flash",
        "doubao-seed-2.1-turbo",
        "doubao-seed-evolving",
        "minimax-m3",
        "glm-5.3",
        "kimi-k2.7-code",
        "deepseek-v4-pro",
        "kimi-k3",
        "deepseek-v4.1-flash",
        "doubao-seedance-2.5",
        "doubao-seedance-2.0",
        "doubao-seedance-2.0-fast",
        "doubao-seedance-2.0-mini",
        "doubao-seedance-1.5-pro",
    ];
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(config.baseUrl, "/models"), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                ...modelChannelAttributionHeaders(channel?.protocol || ""),
            },
            timeout: IMAGE_REQUEST_TIMEOUT_SECONDS * 1000,
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}

async function fetchTeamorouterModels(baseUrl: string, apiKey: string) {
    const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(baseUrl, "/models"), {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: IMAGE_REQUEST_TIMEOUT_SECONDS * 1000,
    });
    const models = (response.data.data || [])
        .map((item) => item.id || "")
        .filter((name) => name && !/embed|embedding/i.test(name))
        .sort((a, b) => a.localeCompare(b));
    if (!models.length) throw new Error("TeamoRouter 模型列表为空");
    return models;
}

async function fetchGeminiModels(baseUrl: string, apiKey: string) {
    const result: string[] = [];
    let pageToken = "";
    do {
        const url = new URL(`${normalizeGeminiBaseUrl(baseUrl)}/v1beta/models`);
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
        if (!response.ok) throw new Error(geminiErrorMessage(await response.json().catch(() => ({})), `读取模型失败（${response.status}）`));
        const payload = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>; nextPageToken?: string };
        for (const item of payload.models || []) {
            const name = item.name?.replace(/^models\//, "") || "";
            const methods = item.supportedGenerationMethods || [];
            if (name && !/embed|embedding/i.test(name) && (methods.includes("generateContent") || methods.includes("predictLongRunning") || /^(veo-|imagen-)/i.test(name))) result.push(name);
        }
        pageToken = payload.nextPageToken || "";
    } while (pageToken);
    if (!result.length) throw new Error("Gemini 模型列表为空");
    return Array.from(new Set(result)).sort((a, b) => a.localeCompare(b));
}

export async function listCanvasImageTasks(config: AiConfig, sources: Array<"image-workbench" | "workflow" | "canvas"> = []) {
    if (!usesAccountProxy(config)) return [];
    const query = sources.length ? `?${sources.map((source) => `source=${encodeURIComponent(source)}`).join("&")}` : "";
    const response = await fetch(`/api/v1/canvas/image-tasks${query}`, {
        headers: aiHeaders(config),
    });
    if (!response.ok) {
        const error = await fetchErrorDetail(response, "读取图片任务失败");
        throw new ImageRequestError(error.message, error.detail);
    }
    const payload = (await response.json()) as { code?: number; msg?: string; data?: CanvasImageTask[] };
    if (payload.code !== 0 || !Array.isArray(payload.data)) throw new ImageRequestError(payload.msg || "读取图片任务失败", payload);
    return payload.data;
}

export async function batchCanvasImageTaskStatus(config: AiConfig, ids: string[]) {
    const taskIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (!usesAccountProxy(config) || !taskIds.length) return [];
    const response = await fetch("/api/v1/canvas/image-tasks/status", {
        method: "POST",
        headers: aiHeaders(config, "application/json"),
        body: JSON.stringify({ ids: taskIds }),
    });
    if (!response.ok) {
        const error = await fetchErrorDetail(response, "读取图片任务失败");
        throw new ImageRequestError(error.message, error.detail);
    }
    const payload = (await response.json()) as { code?: number; msg?: string; data?: CanvasImageTask[] };
    if (payload.code !== 0 || !Array.isArray(payload.data)) throw new ImageRequestError(payload.msg || "读取图片任务失败", payload);
    return Promise.all(payload.data.map((task) => syncCanvasImageTask(task)));
}

export async function deleteCanvasImageTask(config: AiConfig, task?: CanvasImageTask | null) {
    if (!usesAccountProxy(config) || !task?.id) return;
    const response = await fetch(`/api/v1/canvas/image-tasks/${encodeURIComponent(task.id)}`, {
        method: "DELETE",
        headers: aiHeaders(config),
    });
    if (!response.ok) {
        const error = await fetchErrorDetail(response, "删除图片任务失败");
        throw new ImageRequestError(error.message, error.detail);
    }
    const payload = (await response.json()) as { code?: number; msg?: string };
    if (payload.code !== 0) throw new ImageRequestError(payload.msg || "删除图片任务失败", payload);
}
