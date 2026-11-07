import { executeParameterTranslation, findParameterTranslation } from "../channel-parameter-translation";
import { dataUrlToFile } from "@/lib/image-utils";
import { dataUrlToGeminiInlineData, geminiActionUrl, geminiDirectHeaders, isGeminiConfig } from "@/lib/gemini";
import { autoSyncImage, imageToDataUrl, resolveImageUrl } from "@/services/image-storage";
import { channelProtocolForConfig, directAIProviderForConfig, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { aiApiUrl, aiHeaders, refreshRemoteUser, usesAccountProxy } from "../ai-request";
import { tokenDanceRecoveryMessage } from "../protocols/tokendance";
import { ReferenceImage } from "@/types/image";
import { nanoid } from "nanoid";

import { fetchErrorDetail, readAxiosError, requestWithTransientRetry, stringifyLogPayload, summarizeFormData, summarizeGeneratedImages, withSystemMessage, withTimeout, writeLocalAICallLog } from "./client";
import { IMAGE_MIME, IMAGE_REQUEST_TIMEOUT_SECONDS, applyAgnesImageSize, applyImageGenerationOptions, applyImageGenerationParams, assertImageReferencesSupported, createChatImageBody, createGeminiImageBody, createGrokImageEditBody, createImageRequestParams, createResponsesImageTool, createResponsesInput, imageTranslationInput, isAgnesImageModel, isGrok2APIImageConfig, isZhipuImageModel, publicHttpUrl, withPromptGuard, withSystemPrompt } from "./payload";
import { isEventStreamResponse, parseChatImagesPayload, parseGeminiImages, parseImagePayload, parseImagesStreamResponse, parseResponsesPayload, parseResponsesStreamResponse, readJsonServerSentEvents } from "./stream";
import { ImageRequestError } from "./types";
import type { ChatCompletionMessage, ChatImagesApiResponse, GeneratedImage, ImageApiResponse, ImageRequestParams, ParsedImageResponse, ResponsesApiResponse, SeedableImageConfig } from "./types";


async function requestImageGenerationSingle(config: SeedableImageConfig, prompt: string, params: ImageRequestParams): Promise<GeneratedImage[]> {
    const mime = IMAGE_MIME;

    if (isGeminiConfig(config)) return requestGeminiImageSingle(config, prompt, [], params);

    // 针对 Agnes 渠道文生图模型定制精简 Payload，避免传入官方文档未声明的 seed 参数。
    if (isAgnesImageModel(config.model)) {
        const body: Record<string, unknown> = {
            model: config.model,
            prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
        };
        applyAgnesImageSize(body, config, params);

        return requestAndParseImages(
            config,
            "/images/generations",
            body,
            params.timeoutSeconds,
            () =>
                requestWithTransientRetry(() =>
                    withTimeout(params.timeoutSeconds, params.signal, (signal) =>
                        fetch(aiApiUrl(config, "/images/generations"), {
                            method: "POST",
                            headers: aiHeaders(config, "application/json"),
                            body: JSON.stringify(body),
                            signal,
                        }),
                    ),
                ),
            async (response) => {
                if (config.streamImages && isEventStreamResponse(response)) {
                    const images = await parseImagesStreamResponse(response, mime, params.signal);
                    return { images, responseBody: summarizeGeneratedImages(images, "event-stream") };
                }
                const payload = (await response.json()) as ImageApiResponse;
                const images = parseImagePayload(payload, mime);
                return { images, responseBody: stringifyLogPayload(payload) };
            },
        );
    }

    const body: Record<string, unknown> = {
        model: config.model,
        prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
    };
    applyImageGenerationParams(body, config, params);
    applyImageGenerationOptions(body, config, params);

    const directProvider = !usesAccountProxy(config) ? directAIProviderForConfig(config) : null;
    if (directProvider) {
        const { requestDirectImages } = await import("@/services/api/direct-ai");
        return parseImagePayload(await requestDirectImages(config, directProvider, "/images/generations", body, params.timeoutSeconds, params.signal), mime);
    }

    return requestAndParseImages(
        config,
        "/images/generations",
        body,
        params.timeoutSeconds,
        () =>
            requestWithTransientRetry(() =>
                withTimeout(params.timeoutSeconds, params.signal, (signal) =>
                    fetch(aiApiUrl(config, "/images/generations"), {
                        method: "POST",
                        headers: aiHeaders(config, "application/json"),
                        body: JSON.stringify(body),
                        signal,
                    }),
                ),
            ),
        async (response) => {
            if (config.streamImages && isEventStreamResponse(response)) {
                const images = await parseImagesStreamResponse(response, mime, params.signal);
                return { images, responseBody: summarizeGeneratedImages(images, "event-stream") };
            }
            const payload = (await response.json()) as ImageApiResponse;
            return { images: parseImagePayload(payload, mime), responseBody: stringifyLogPayload(payload) };
        },
    );
}

async function requestGrokImageEditSingle(config: AiConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams): Promise<GeneratedImage[]> {
    const mime = IMAGE_MIME;
    const body = await createGrokImageEditBody(config, prompt, references, params);
    return requestAndParseImages(
        config,
        "/images/edits",
        body,
        params.timeoutSeconds,
        () =>
            requestWithTransientRetry(() =>
                withTimeout(params.timeoutSeconds, params.signal, (signal) =>
                    fetch(aiApiUrl(config, "/images/edits"), {
                        method: "POST",
                        headers: aiHeaders(config, "application/json"),
                        body: JSON.stringify(body),
                        signal,
                    }),
                ),
            ),
        async (response) => {
            if (config.streamImages && isEventStreamResponse(response)) {
                const images = await parseImagesStreamResponse(response, mime, params.signal);
                return { images, responseBody: summarizeGeneratedImages(images, "event-stream") };
            }
            const payload = (await response.json()) as ImageApiResponse;
            return { images: parseImagePayload(payload, mime), responseBody: stringifyLogPayload(payload) };
        },
    );
}

/** 云端渠道的编辑接口要求标准尺寸，按项目画幅折算，避免发送 1280x720 等非标准值。 */
function normalizeCloudEditSize(config: AiConfig) {
    const value = (config.size || "").trim();
    if (/^\d+x\d+$/.test(value)) return value;
    const [width, height] = value.split(":").map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
    const ratio = width / height;
    if (ratio > 1.1) return "1536x1024";
    if (ratio < 0.9) return "1024x1536";
    return "1024x1024";
}

async function requestImageEditSingle(config: AiConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams): Promise<GeneratedImage[]> {
    if (isGeminiConfig(config)) return requestGeminiImageSingle(config, prompt, references, params);
    if (isGrok2APIImageConfig(config)) return requestGrokImageEditSingle(config, prompt, references, params);

    const mime = IMAGE_MIME;
    const cloudOpenAI = config.channelMode === "remote" && channelProtocolForConfig(config) === "openai";
    const formData = new FormData();
    formData.set("model", config.model);
    formData.set("prompt", withPromptGuard(config, withSystemPrompt(config, prompt)));
    if (params.n > 1) formData.set("n", String(params.n));
    const cloudSize = cloudOpenAI ? normalizeCloudEditSize(config) : undefined;
    if (cloudSize) formData.set("size", cloudSize);
    else if (params.size) formData.set("size", params.size);
    if (params.quality && !config.codexCli) formData.set("quality", params.quality);
    if (!cloudOpenAI && config.responseFormatB64Json) formData.set("response_format", "b64_json");
    if (!cloudOpenAI && config.streamImages) {
        formData.set("stream", "true");
        formData.set("partial_images", String(params.streamPartialImages));
    }
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append(cloudOpenAI ? "image[]" : "image", file));
    if (cloudOpenAI && typeof window !== "undefined") {
        console.info("[image] 云端编辑请求", {
            model: config.model,
            size: cloudSize || params.size,
            quality: params.quality,
            imageCount: files.length,
            totalKb: Math.round(files.reduce((total, file) => total + file.size, 0) / 1024),
        });
    }

    const directProvider = !usesAccountProxy(config) ? directAIProviderForConfig(config) : null;
    if (directProvider) {
        const { requestDirectImages } = await import("@/services/api/direct-ai");
        return parseImagePayload(await requestDirectImages(config, directProvider, "/images/edits", formData, params.timeoutSeconds, params.signal), mime);
    }

    return requestAndParseImages(
        config,
        "/images/edits",
        summarizeFormData(formData),
        params.timeoutSeconds,
        () =>
            requestWithTransientRetry(() =>
                withTimeout(params.timeoutSeconds, params.signal, (signal) =>
                    fetch(aiApiUrl(config, "/images/edits"), {
                        method: "POST",
                        headers: aiHeaders(config),
                        body: formData,
                        signal,
                    }),
                ),
            ),
        async (response) => {
            if (config.streamImages && isEventStreamResponse(response)) {
                const images = await parseImagesStreamResponse(response, mime, params.signal);
                return { images, responseBody: summarizeGeneratedImages(images, "event-stream") };
            }
            const payload = (await response.json()) as ImageApiResponse;
            return { images: parseImagePayload(payload, mime), responseBody: stringifyLogPayload(payload) };
        },
    );
}

async function requestResponsesSingle(config: AiConfig, prompt: string, inputImageDataUrls: string[], params: ImageRequestParams): Promise<GeneratedImage[]> {
    const mime = IMAGE_MIME;
    const body: Record<string, unknown> = {
        model: config.model,
        input: createResponsesInput(config, withSystemPrompt(config, prompt), inputImageDataUrls),
        tools: [createResponsesImageTool(config, params, inputImageDataUrls.length > 0)],
        tool_choice: "required",
    };
    if (config.streamImages) body.stream = true;

    return requestAndParseImages(
        config,
        "/responses",
        body,
        params.timeoutSeconds,
        () =>
            requestWithTransientRetry(() =>
                withTimeout(params.timeoutSeconds, params.signal, (signal) =>
                    fetch(aiApiUrl(config, "/responses"), {
                        method: "POST",
                        headers: aiHeaders(config, "application/json"),
                        body: JSON.stringify(body),
                        signal,
                    }),
                ),
            ),
        async (response) => {
            if (config.streamImages && isEventStreamResponse(response)) {
                const images = await parseResponsesStreamResponse(response, mime, params.signal);
                return { images, responseBody: summarizeGeneratedImages(images, "event-stream") };
            }
            const payload = (await response.json()) as ResponsesApiResponse;
            return { images: parseResponsesPayload(payload, mime), responseBody: stringifyLogPayload(payload) };
        },
    );
}

async function requestChatImagesSingle(config: AiConfig, prompt: string, inputImageDataUrls: string[], params: ImageRequestParams): Promise<GeneratedImage[]> {
    const body = createChatImageBody(config, prompt, inputImageDataUrls, params);
    return requestAndParseImages(
        config,
        "/chat/completions",
        body,
        params.timeoutSeconds,
        () => requestWithTransientRetry(() => withTimeout(params.timeoutSeconds, params.signal, (signal) => fetch(aiApiUrl(config, "/chat/completions"), {
            method: "POST",
            headers: aiHeaders(config, "application/json"),
            body: JSON.stringify(body),
            signal,
        }))),
        async (response) => {
            const payload = await response.json() as ChatImagesApiResponse;
            return { images: parseChatImagesPayload(payload), responseBody: stringifyLogPayload(payload) };
        },
    );
}

async function requestAndParseImages(config: AiConfig, endpoint: string, requestBody: unknown, _timeoutSeconds: number, fetchResponse: () => Promise<Response>, parseResponse: (response: Response) => Promise<ParsedImageResponse>) {
    const startedAt = Date.now();
    let logged = false;
    try {
        const response = await fetchResponse();
        if (!response.ok) {
            const error = await fetchErrorDetail(response, "请求失败");
            logged = true;
            void writeLocalAICallLog(config, endpoint, startedAt, response.status, stringifyLogPayload(requestBody), stringifyLogPayload(error.detail || error.message), error.message);
            throw new ImageRequestError(error.message, error.detail);
        }
        const parsed = await parseResponse(response);
        logged = true;
        void writeLocalAICallLog(config, endpoint, startedAt, response.status, stringifyLogPayload(requestBody), parsed.responseBody, "");
        return parsed.images;
    } catch (error) {
        if (!logged) {
            void writeLocalAICallLog(config, endpoint, startedAt, 0, stringifyLogPayload(requestBody), "", error instanceof ImageRequestError ? error.detail || error.message : error instanceof Error ? error.message : "请求失败");
        }
        throw error;
    }
}

export async function requestImages(config: SeedableImageConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal): Promise<GeneratedImage[]> {
	const translation = await findParameterTranslation(config);
	if (translation) {
		const input = await imageTranslationInput(config,prompt,references,createImageRequestParams(config));
		const result = await executeParameterTranslation(config,translation,input,signal);
		return result.urls.map((dataUrl) => ({id:nanoid(),dataUrl}));
	}
    assertImageReferencesSupported(config.model, references);
    const params = { ...createImageRequestParams(config), signal };
    const inputImageDataUrls = references.length ? await Promise.all(references.map((image) => imageToDataUrl(image))) : [];
    const useConcurrentSingleRequests = isGeminiConfig(config) || config.apiMode === "responses" || config.apiMode === "chat" || config.codexCli || config.streamImages || isZhipuImageModel(config.model);
    if (params.n > 1 && useConcurrentSingleRequests) {
        const results = await Promise.allSettled(Array.from({ length: params.n }, () => requestImages({ ...config, count: "1" }, prompt, references, signal)));
        const images = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
        if (images.length) return images;
        const firstError = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        throw firstError?.reason || new Error("所有并发请求均失败");
    }
    if (references.length && isAgnesImageModel(config.model)) {
        return requestAgnesImageEdit(config, prompt, references, params);
    }
    if (config.apiMode === "chat" && !isGeminiConfig(config) && !isZhipuImageModel(config.model)) return requestChatImagesSingle(config, prompt, inputImageDataUrls, params);
    if (config.apiMode === "responses" && !isGeminiConfig(config) && !isZhipuImageModel(config.model)) return requestResponsesSingle(config, prompt, inputImageDataUrls, params);
    return references.length ? requestImageEditSingle(config, prompt, references, params) : requestImageGenerationSingle(config, prompt, params);
}

async function syncGeneratedImages(images: GeneratedImage[]) {
    return Promise.all(images.map(async (image) => {
        const stored = await autoSyncImage(image.dataUrl, image.id, image.storageKey);
        return stored ? { id: image.id, dataUrl: stored.url, seed: image.seed, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType } : image;
    }));
}

export async function requestGeneration(config: SeedableImageConfig, prompt: string, signal?: AbortSignal) {
    try {
        const images = await requestImages(config, prompt, [], signal);
        refreshRemoteUser(config);
        return syncGeneratedImages(images);
    } catch (error) {
        if (error instanceof ImageRequestError) throw error;
        throw new Error(error instanceof Error ? error.message : "请求失败");
    }
}

export async function requestEdit(config: SeedableImageConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal) {
    try {
        const images = await requestImages(config, prompt, references, signal);
        refreshRemoteUser(config);
        return syncGeneratedImages(images);
    } catch (error) {
        if (error instanceof ImageRequestError) throw error;
        throw new Error(error instanceof Error ? error.message : "请求失败");
    }
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void, signal?: AbortSignal) {
    if (isGeminiConfig(config)) return requestGeminiText(config, messages, onDelta, signal);
    let answer = "";

    try {
        await withTimeout(IMAGE_REQUEST_TIMEOUT_SECONDS, signal, async (requestSignal) => {
            const response = await fetch(aiApiUrl(config, "/chat/completions"), {
                method: "POST",
                headers: { ...aiHeaders(config, "application/json"), ...(signal && usesAccountProxy(config) ? { "X-Canvas-Node-Request": "true" } : {}) },
                body: JSON.stringify({ model: config.model, messages: withSystemMessage(config, messages), stream: true }),
                signal: requestSignal,
            });
            if (!response.ok) {
                const error = await fetchErrorDetail(response, "请求失败");
                throw new ImageRequestError(
                    tokenDanceRecoveryMessage(channelProtocolForConfig(config) === "tokendance" ? response.headers.get("TokenDance-Recovery-Action") : null)
                        || error.message,
                    error.detail,
                );
            }
            if (isEventStreamResponse(response)) {
                await readJsonServerSentEvents(response, (event) => {
                    const delta = (event.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content || "";
                    if (!delta) return;
                    answer += delta;
                    onDelta(answer);
                }, requestSignal);
                return;
            }
            const payload = (await response.json()) as {
                code?: number;
                msg?: string;
                error?: { message?: string };
                choices?: Array<{ message?: { content?: string | null } }>;
                data?: { choices?: Array<{ message?: { content?: string | null } }> };
            };
            if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "请求失败");
            const content = payload.choices?.[0]?.message?.content || payload.data?.choices?.[0]?.message?.content || "";
            if (!content && payload.error?.message) throw new Error(payload.error.message);
            if (content) {
                answer = content;
                onDelta(answer);
            }
        });
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
    refreshRemoteUser(config);
    return answer || "没有返回内容";
}

async function requestGeminiImageSingle(config: AiConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams): Promise<GeneratedImage[]> {
    const body = await createGeminiImageBody(config, prompt, references, params);
    const proxy = usesAccountProxy(config);
    const channel = localChannelForActiveModel(config);
    const nativeBody = proxy ? body : withoutModel(body);
    return requestAndParseImages(
        config,
        references.length ? "/images/edits" : "/images/generations",
        body,
        params.timeoutSeconds,
        () => requestWithTransientRetry(() => withTimeout(params.timeoutSeconds, params.signal, (signal) => fetch(
            proxy ? `/api/v1${references.length ? "/images/edits" : "/images/generations"}` : geminiActionUrl(channel?.baseUrl || config.baseUrl, config.model, "generateContent"),
            { method: "POST", headers: proxy ? aiHeaders(config, "application/json") : geminiDirectHeaders(config), body: JSON.stringify(nativeBody), signal },
        ))),
        async (response) => {
            const payload = await response.json() as Record<string, unknown>;
            const images = parseGeminiImages(payload);
            return { images, responseBody: stringifyLogPayload(payload) };
        },
    );
}

async function requestGeminiText(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void, signal?: AbortSignal) {
    const body = await createGeminiTextBody(config, withSystemMessage(config, messages));
    const proxy = usesAccountProxy(config);
    const channel = localChannelForActiveModel(config);
    const response = await fetch(proxy ? "/api/v1/chat/completions" : geminiActionUrl(channel?.baseUrl || config.baseUrl, config.model, "streamGenerateContent"), {
        method: "POST",
        headers: proxy ? { ...aiHeaders(config, "application/json"), ...(signal ? { "X-Canvas-Node-Request": "true" } : {}) } : geminiDirectHeaders(config),
        body: JSON.stringify(proxy ? body : withoutModel(body)),
        signal,
    });
    if (!response.ok) {
        const error = await fetchErrorDetail(response, "请求失败");
        throw new ImageRequestError(error.message, error.detail);
    }
    let answer = "";
    await readJsonServerSentEvents(response, (event) => {
        const candidates = Array.isArray(event.candidates) ? event.candidates as Array<Record<string, unknown>> : [];
        const delta = candidates.flatMap((candidate) => {
            const content = candidate.content && typeof candidate.content === "object" ? candidate.content as Record<string, unknown> : {};
            return Array.isArray(content.parts) ? content.parts as Array<Record<string, unknown>> : [];
        }).map((part) => typeof part.text === "string" ? part.text : "").join("");
        if (delta) {
            answer += delta;
            onDelta(answer);
        }
    }, signal);
    refreshRemoteUser(config);
    return answer || "没有返回内容";
}

async function createGeminiTextBody(config: AiConfig, messages: ChatCompletionMessage[]) {
    const systemParts: Array<{ text: string }> = [];
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
    for (const message of messages) {
        if (message.role === "system") {
            const text = typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n");
            if (text.trim()) systemParts.push({ text });
            continue;
        }
        const parts: Array<Record<string, unknown>> = [];
        for (const part of typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content) {
            if (part.type === "text") parts.push({ text: part.text });
            else parts.push(dataUrlToGeminiInlineData(await imageToDataUrl({ dataUrl: part.image_url.url, url: part.image_url.url })));
        }
        contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
    }
    return { model: config.model, stream: true, ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}), contents };
}

function withoutModel<T extends { model: string; stream?: boolean }>(body: T) {
    const { model: _model, stream: _stream, ...nativeBody } = body;
    return nativeBody;
}

async function requestAgnesImageEdit(config: SeedableImageConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams): Promise<GeneratedImage[]> {
    const mime = IMAGE_MIME;

    // 获取所有参考图的公共 HTTP 链接或降级为 base64 数组，完美对齐 extra_body.image
    const imageUrls = await Promise.all(
        references.map(async (ref) => {
            const resolvedUrl = await resolveImageUrl(ref.storageKey, "");
            for (const url of [ref.dataUrl, ref.url, resolvedUrl]) {
                const publicUrl = publicHttpUrl(url);
                if (publicUrl) return publicUrl;
            }
            return imageToDataUrl(ref);
        })
    );

    const body: Record<string, unknown> = {
        model: config.model,
        prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
        extra_body: {
            image: imageUrls, // 👈 核心对齐：官方文档参考图参数 extra_body.image 数组
        },
    };
    applyAgnesImageSize(body, config, params);

    return requestAndParseImages(
        config,
        "/images/generations", // 核心对齐：官方图生图同样使用 /images/generations 接口
        body,
        params.timeoutSeconds,
        () =>
            requestWithTransientRetry(() =>
                withTimeout(params.timeoutSeconds, params.signal, (signal) =>
                    fetch(aiApiUrl(config, "/images/generations"), {
                        method: "POST",
                        headers: aiHeaders(config, "application/json"),
                        body: JSON.stringify(body),
                        signal,
                    }),
                ),
            ),
        async (response) => {
            if (config.streamImages && isEventStreamResponse(response)) {
                const images = await parseImagesStreamResponse(response, mime, params.signal);
                return { images, responseBody: summarizeGeneratedImages(images, "event-stream") };
            }
            const payload = (await response.json()) as ImageApiResponse;
            const images = parseImagePayload(payload, mime);
            return { images, responseBody: stringifyLogPayload(payload) };
        },
    );
}
