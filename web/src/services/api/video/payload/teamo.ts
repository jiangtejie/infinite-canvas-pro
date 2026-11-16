import { isTeamorouterBaseUrl } from "@/lib/gemini";
import { normalizeSeedanceRatio } from "@/lib/seedance-video";
import { imageToDataUrl } from "@/services/image-storage";
import { channelIdForActiveModel, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import type { VideoReferenceInput } from "../types";
import { normalizeVideoResolution, publicHttpUrl } from "./shared";

/** TeamoRouter 视频走 OpenAI-Videos 契约（/v1/videos），而非其 Gemini 原生图片接口。 */
export function isTeamoVideoConfig(config: AiConfig) {
    const channelId = channelIdForActiveModel(config);
    const channel = config.channelMode === "remote"
        ? config.publicChannels.find((item) => item.id === channelId)
        : localChannelForActiveModel(config);
    return isTeamorouterBaseUrl(channel?.baseUrl || config.baseUrl || "");
}

export function teamoVideoSeconds(config: AiConfig) {
    return String(Math.max(4, Math.min(30, Math.round(Number(config.videoSeconds) || 4))));
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

function isMiniMaxModel(model: string) {
    return model.toLowerCase().includes("minimax-h3");
}

/** MiniMax 分辨率标签大小写敏感（H3 为 768P/2k，Max 仅 768p）。默认省略 resolution 用目录默认值，仅非 Max 选 2k/4k 时发 2k。 */
function miniMaxResolution(config: AiConfig, model: string) {
    if (model.toLowerCase().includes("-max")) return "";
    const normalized = normalizeVideoResolution(config.vquality);
    return normalized === "2k" || normalized === "4k" ? "2k" : "";
}

function miniMaxSeconds(config: AiConfig) {
    return String(Math.max(4, Math.min(15, Math.round(Number(config.videoSeconds) || 5))));
}

function miniMaxAspectRatio(config: AiConfig) {
    const ratio = normalizeSeedanceRatio(config.size);
    return ratio === "adaptive" ? "16:9" : ratio;
}

export async function createTeamoVideoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    const body: Record<string, unknown> = isMiniMaxModel(model)
        ? { model, prompt, seconds: miniMaxSeconds(config), aspect_ratio: miniMaxAspectRatio(config) }
        : { model, prompt, seconds: teamoVideoSeconds(config), size: teamoVideoSize(config) };
    if (isMiniMaxModel(model)) {
        const resolution = miniMaxResolution(config, model);
        if (resolution) body.resolution = resolution;
    }
    const reference = input.firstFrame || input.references[0];
    if (reference) {
        // 上游只收 base64 data URL 或公网 HTTPS；blob/本地地址必须转成 base64。
        const direct = reference.dataUrl?.startsWith("data:") ? reference.dataUrl : publicHttpUrl(reference.url) || publicHttpUrl(reference.dataUrl);
        const imageUrl = direct || (await imageToDataUrl(reference));
        if (imageUrl) body.input_reference = { image_url: imageUrl };
    }
    return body;
}