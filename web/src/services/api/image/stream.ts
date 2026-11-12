import { geminiErrorMessage } from "@/lib/gemini";
import { nanoid } from "nanoid";

import { IMAGE_MIME } from "./payload";
import { ImageRequestError } from "./types";
import type { ChatImagesApiResponse, GeneratedImage, ImageApiResponse, ResponsesApiResponse } from "./types";
import { errorMessage } from "@/lib/utils";


function normalizeBase64Image(value: string, fallbackMime: string) {
    return value.startsWith("data:") ? value : `data:${fallbackMime};base64,${value}`;
}

function resolveImageDataUrl(item: Record<string, unknown>, mime: string) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return normalizeBase64Image(item.b64_json, mime);
    }
    if (typeof item.url === "string" && item.url) {
        return item.url;
    }
    return null;
}

export function parseImagePayload(payload: ImageApiResponse, mime: string): GeneratedImage[] {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new ImageRequestError(payload.msg || "请求失败", payload);
    }
    const images =
        payload.data
            ?.map((item) => resolveImageDataUrl(item, mime))
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];

    if (images.length === 0) {
        throw new ImageRequestError("接口没有返回图片", payload);
    }

    return images;
}

export function parseChatImagesPayload(payload: ChatImagesApiResponse): GeneratedImage[] {
    if (typeof payload.code === "number" && payload.code !== 0) throw new ImageRequestError(payload.msg || "请求失败", payload);
    if (payload.error?.message) throw new ImageRequestError(payload.error.message, payload);
    const images = payload.choices
        ?.flatMap((choice) => choice.message?.images || [])
        .map((item) => item.image_url?.url || "")
        .filter(Boolean)
        .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];
    if (!images.length) throw new ImageRequestError("Chat Completions 没有返回图片", payload);
    return images;
}

function getStringRecordValue(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function collectResponsesImageStrings(value: unknown, depth = 0): string[] {
    if (depth > 5 || value == null) return [];
    if (typeof value === "string") return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) return value.flatMap((item) => collectResponsesImageStrings(item, depth + 1));
    if (typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    return ["result", "b64_json", "base64", "image", "image_data", "data"].flatMap((key) => collectResponsesImageStrings(record[key], depth + 1));
}

function getResponsesImageResultBase64(result: unknown) {
    return collectResponsesImageStrings(result)[0] || "";
}

function collectResponsesImageBase64(item: Record<string, unknown>) {
    const values: string[] = [];
    const result = getResponsesImageResultBase64(item.result);
    if (result) values.push(result);
    values.push(...collectResponsesImageStrings(item));
    return Array.from(new Set(values));
}

export function parseResponsesPayload(payload: ResponsesApiResponse, mime: string): GeneratedImage[] {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new ImageRequestError(payload.msg || "请求失败", payload);
    }
    const images =
        payload.output
            ?.filter((item) => item.type === "image_generation_call")
            .flatMap((item) => collectResponsesImageBase64(item))
            .filter(Boolean)
            .map((b64) => ({ id: nanoid(), dataUrl: normalizeBase64Image(b64, mime) })) || [];

    if (images.length === 0) {
        throw new ImageRequestError("Responses API 没有返回图片", payload);
    }

    return images;
}

function parseServerSentEventBlock(block: string) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return null;
    return JSON.parse(data) as Record<string, unknown>;
}

export async function readJsonServerSentEvents(response: Response, onEvent: (event: Record<string, unknown>) => void, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!response.body) throw new ImageRequestError("接口未返回可读取的流式响应", `${response.status} ${response.statusText}`);
    const reader = response.body.getReader();
    const onAbort = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const decoder = new TextDecoder();
    let buffer = "";
    const events: Record<string, unknown>[] = [];

    const processBlock = (block: string) => {
        let event: Record<string, unknown> | null = null;
        try {
            event = parseServerSentEventBlock(block);
        } catch (error) {
            throw new ImageRequestError(errorMessage(error, "流式响应解析失败"), block);
        }
        if (!event) return;
        events.push(event);
        const error = event.error;
        if (error && typeof error === "object" && !Array.isArray(error) && typeof (error as { message?: unknown }).message === "string") {
            throw new ImageRequestError((error as { message: string }).message, event);
        }
        onEvent(event);
    };

    while (true) {
        signal?.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.search(/\r?\n\r?\n/);
        while (separatorIndex >= 0) {
            const separator = buffer.match(/\r?\n\r?\n/)?.[0] || "\n\n";
            processBlock(buffer.slice(0, separatorIndex));
            buffer = buffer.slice(separatorIndex + separator.length);
            separatorIndex = buffer.search(/\r?\n\r?\n/);
        }
    }
    signal?.removeEventListener("abort", onAbort);
    buffer += decoder.decode();
    if (buffer.trim()) processBlock(buffer);
    return events;
}

export function isEventStreamResponse(response: Response) {
    return response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream") ?? false;
}

export async function parseImagesStreamResponse(response: Response, mime: string, signal?: AbortSignal): Promise<GeneratedImage[]> {
    const imageItems = new Map<string, Record<string, unknown>>();
    let resultPayload: ImageApiResponse | null = null;
    const events = await readJsonServerSentEvents(response, (event) => {
        const object = typeof event.object === "string" ? event.object : "";
        if (object === "image.generation.result" || object === "image.edit.result") {
            resultPayload = event as ImageApiResponse;
        }
        if (resolveImageDataUrl(event, mime)) {
            const imageIndex =
                typeof event.image_index === "number" || typeof event.image_index === "string" ? String(event.image_index) : `event-${imageItems.size}`;
            imageItems.set(imageIndex, event);
        }
    }, signal);
    if (resultPayload) return parseImagePayload(resultPayload, mime);
    if (imageItems.size) return parseImagePayload({ data: Array.from(imageItems.values()) }, mime);
    throw new ImageRequestError("流式接口未返回最终图片数据", events);
}

export async function parseResponsesStreamResponse(response: Response, mime: string, signal?: AbortSignal): Promise<GeneratedImage[]> {
    let completedPayload: ResponsesApiResponse | null = null;
    const output: Record<string, unknown>[] = [];
    const partialImages: string[] = [];
    const events = await readJsonServerSentEvents(response, (event) => {
        if (event.type === "response.image_generation_call.partial_image") {
            const b64 = getStringRecordValue(event, "partial_image_b64");
            if (b64) partialImages.push(b64);
            return;
        }
        const responsePayload = event.response;
        if (responsePayload && typeof responsePayload === "object" && !Array.isArray(responsePayload)) {
            completedPayload = responsePayload as ResponsesApiResponse;
        }
        const item = event.item;
        if (item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).type === "image_generation_call") {
            output.push(item as Record<string, unknown>);
        }
    }, signal);
    try {
        return parseResponsesPayload(completedPayload || { output }, mime);
    } catch (error) {
        if (!partialImages.length) {
            throw new ImageRequestError(errorMessage(error, "Responses API 没有返回图片"), {
                completedPayload,
                output,
                events,
            });
        }
        const lastPartialImage = partialImages[partialImages.length - 1];
        return [{ id: nanoid(), dataUrl: normalizeBase64Image(lastPartialImage, mime) }];
    }
}

export function parseGeminiImages(payload: Record<string, unknown>) {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates as Array<Record<string, unknown>> : [];
    const images = candidates.flatMap((candidate) => {
        const content = candidate.content && typeof candidate.content === "object" ? candidate.content as Record<string, unknown> : {};
        const parts = Array.isArray(content.parts) ? content.parts as Array<Record<string, unknown>> : [];
        return parts.flatMap((part) => {
            const inlineData = part.inlineData && typeof part.inlineData === "object" ? part.inlineData as Record<string, unknown> : {};
            const data = typeof inlineData.data === "string" ? inlineData.data : "";
            if (!data) return [];
            const mimeType = typeof inlineData.mimeType === "string" ? inlineData.mimeType : IMAGE_MIME;
            return [{ id: nanoid(), dataUrl: `data:${mimeType};base64,${data}` }];
        });
    });
    if (!images.length) throw new ImageRequestError(geminiErrorMessage(payload, "Gemini 接口没有返回图片"), payload);
    return images;
}
