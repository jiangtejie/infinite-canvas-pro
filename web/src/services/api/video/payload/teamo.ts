import { isTeamorouterBaseUrl } from "@/lib/gemini";
import { imageToDataUrl } from "@/services/image-storage";
import { channelIdForActiveModel, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import type { VideoReferenceInput } from "../types";
import { normalizeVideoResolution } from "./shared";

/** TeamoRouter 视频走 OpenAI-Videos 契约（/v1/videos），而非其 Gemini 原生图片接口。 */
export function isTeamoVideoConfig(config: AiConfig) {
    const channelId = channelIdForActiveModel(config);
    const channel = config.channelMode === "remote"
        ? config.publicChannels.find((item) => item.id === channelId)
        : localChannelForActiveModel(config);
    return isTeamorouterBaseUrl(channel?.baseUrl || config.baseUrl || "");
}

export function teamoVideoSeconds(config: AiConfig) {
    return String(Math.max(1, Math.min(30, Math.round(Number(config.videoSeconds) || 4))));
}

/** TeamoRouter size 必须是 WIDTHxHEIGHT；把画幅+清晰度映射为偶数分辨率。 */
export function teamoVideoSize(config: AiConfig) {
    const raw = (config.size || "").trim();
    if (/^\d+x\d+$/.test(raw)) return raw;
    const base = ({ "480p": 480, "720p": 720, "1080p": 1080 } as Record<string, number>)[normalizeVideoResolution(config.vquality)] ?? 720;
    const [w, h] = (raw || "16:9").split(":").map((part) => Number(part) || 0);
    const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
    if (!w || !h) return `${even((base * 16) / 9)}x${base}`;
    return w >= h ? `${even((base * w) / h)}x${base}` : `${base}x${even((base * h) / w)}`;
}

export async function createTeamoVideoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    const body: Record<string, unknown> = { model, prompt, seconds: teamoVideoSeconds(config), size: teamoVideoSize(config) };
    const reference = input.firstFrame || input.references[0];
    if (reference) {
        const dataUrl = reference.dataUrl || (await imageToDataUrl(reference));
        if (dataUrl) body.input_reference = { image_url: dataUrl };
    }
    return body;
}