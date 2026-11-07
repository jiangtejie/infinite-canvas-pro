import axios from "axios";
import { localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { usesAccountProxy } from "../ai-request";

import { VideoRequestError } from "./types";


export function withoutVideoModel(body: FormData | Record<string, unknown>) {
    if (body instanceof FormData) return body;
    const { model: _model, ...nativeBody } = body;
    return nativeBody;
}

export function readAxiosError(error: unknown, fallback: string) {
    if (error instanceof VideoRequestError) return { message: error.message, detail: error.detail || error.stack || error.message };
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return { message: responseData?.msg || responseData?.error?.message || (error.response?.status ? `${fallback}：${error.response.status}` : fallback), detail: responseData || error.message };
    }
    return { message: error instanceof Error ? error.message : fallback, detail: error instanceof Error ? error.stack || error.message : error };
}

export async function writeVideoAICallLog(config: AiConfig, model: string, endpoint: string, method: "GET" | "POST", startedAt: number, status: number, requestBody: string, responseBody: string, error: string) {
    if (config.channelMode !== "local" || usesAccountProxy(config)) return;
    const token = useUserStore.getState().token;
    if (!token) return;
    const channel = localChannelForActiveModel(config);
    await fetch("/api/v1/ai-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            endpoint,
            method,
            model,
            channelId: channel?.id || config.activeChannelId || "",
            channelName: channel?.name || "本地直连",
            status,
            durationMs: Date.now() - startedAt,
            credits: 0,
            requestBody,
            responseBody,
            error,
        }),
    }).catch(() => { });
}

export function summarizeVideoRequestBody(value: unknown) {
    if (value instanceof FormData) {
        const fields: Record<string, string[]> = {};
        const files: Array<{ field: string; name: string; size: number; type: string }> = [];
        value.forEach((item, key) => {
            if (item instanceof File) {
                files.push({ field: key, name: item.name, size: item.size, type: item.type });
                return;
            }
            fields[key] = [...(fields[key] || []), String(item)];
        });
        return { fields, files };
    }
    return value;
}

export function stringifyLogPayload(value: unknown) {
    if (typeof value === "string") return value;
    try {
        const cloned = JSON.parse(JSON.stringify(value)) as unknown;
        redactLogMedia(cloned);
        return JSON.stringify(cloned, null, 2);
    } catch {
        return String(value || "");
    }
}

function redactLogMedia(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
        value.forEach(redactLogMedia);
        return;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        const item = record[key];
        if (typeof item === "string" && (item.startsWith("data:image/") || item.startsWith("data:video/") || item.startsWith("data:audio/") || item.includes("data:image/") || item.includes("data:video/") || item.includes("data:audio/") || item.length > 2048 && looksLikeBase64(item))) {
            record[key] = `[redacted media/string len=${item.length}]`;
            continue;
        }
        redactLogMedia(item);
    }
}

function looksLikeBase64(value: string) {
    return /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 200));
}

export function firstString(...values: unknown[]) {
    return values.find((value): value is string => typeof value === "string" && !!value.trim())?.trim() || "";
}
