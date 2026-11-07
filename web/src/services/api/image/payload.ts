import { normalizeTranslationAspectRatio, type TranslationInput } from "../channel-parameter-translation";
import { dataUrlToGeminiInlineData } from "@/lib/gemini";
import { imageToDataUrl } from "@/services/image-storage";
import { channelProtocolForConfig, type AiConfig } from "@/stores/use-config-store";
import { ReferenceImage } from "@/types/image";

import { ImageRequestError } from "./types";
import type { ImageRequestParams } from "./types";


const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
export const IMAGE_MIME = "image/png";
export const IMAGE_REQUEST_TIMEOUT_SECONDS = 600;
const PROMPT_REWRITE_GUARD_PREFIX = "Use the following text as the complete prompt. Do not rewrite it:";

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    if (!value || value === "auto") return "auto";
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : "auto";
}

function normalizeBoundedInteger(value: string | number, fallback: number, min: number, max: number) {
    const number = Math.floor(Math.abs(Number(value)));
    if (!Number.isFinite(number) || number < min) return fallback;
    return Math.max(min, Math.min(max, number));
}

function greatestCommonDivisor(a: number, b: number) {
    a = Math.round(a);
    b = Math.round(b);
    while (b) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

function resolveSize(quality: string, ratio: string): string | undefined {
    const basePixels = QUALITY_BASE[quality];
    if (!basePixels || ratio === "auto" || !ratio) return undefined;

    const parts = ratio.split(":");
    if (parts.length !== 2) return undefined;
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!w || !h) return undefined;

    const a = greatestCommonDivisor(w, h);

    const unit = Math.round(Math.sqrt((basePixels * basePixels) / ((w / a) * (h / a))) / 16) * 16;
    return `${(w / a) * unit}x${(h / a) * unit}`;
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value === "auto") return undefined;
    if (/^\d+x\d+$/.test(value)) return value;
    // 用户只选了宽高比时,即使 quality=auto 也要折算成具体像素尺寸,避免 "1:1" 这种非法值发到 API。
    return resolveSize(quality && QUALITY_BASE[quality] ? quality : "low", value);
}

export function createImageRequestParams(config: AiConfig): ImageRequestParams {
    const normalizedQuality = normalizeQuality(config.quality);
    const zhipu = isZhipuImageModel(config.model);
    const quality = zhipu ? normalizeZhipuImageQuality(config.model, normalizedQuality) : normalizedQuality;
    return {
        n: normalizeBoundedInteger(config.count, 1, 1, 15),
        quality,
        size: resolveRequestSize(quality, config.size),
        timeoutSeconds: IMAGE_REQUEST_TIMEOUT_SECONDS,
        streamPartialImages: normalizeBoundedInteger(config.streamPartialImages, 1, 0, 3),
    };
}

function isGrokImageModel(model: string) {
    return model.trim().toLowerCase().startsWith("grok-imagine-image");
}

export function isGrok2APIImageConfig(config: AiConfig) {
    return channelProtocolForConfig(config) === "grok2api" && isGrokImageModel(config.model);
}

export function isZhipuImageModel(model: string) {
    const value = model.trim().toLowerCase();
    return value === "glm-image" || value.startsWith("cogview-");
}

function normalizeZhipuImageQuality(model: string, quality: string) {
    if (model.trim().toLowerCase() === "glm-image") return "hd";
    if (quality === "auto") return quality;
    return quality === "high" || quality === "hd" ? "hd" : "standard";
}

export function applyImageGenerationParams(body: Record<string, unknown>, config: AiConfig, params: ImageRequestParams, operation: "generation" | "edit" = "generation") {
    const model = config.model.trim().toLowerCase();
    const zhipu = isZhipuImageModel(model);
    if (zhipu) {
        if (params.size) body.size = params.size;
        if (params.quality !== "auto") body.quality = params.quality;
        return;
    }

    const grok = isGrok2APIImageConfig(config) && (operation === "edit" || !model.includes("edit"));
    if (grok) {
        const size = config.size.trim().toLowerCase();
        if (size && size !== "auto") {
            const match = size.match(/^(\d+)x(\d+)$/);
            if (match) {
                const width = Number(match[1]);
                const height = Number(match[2]);
                const divisor = greatestCommonDivisor(width, height);
                body.aspect_ratio = `${width / divisor}:${height / divisor}`;
            } else {
                body.aspect_ratio = size;
            }
        }
        if (params.quality !== "auto") {
            body.resolution = operation === "edit" && model.includes("edit") ? "1k" : QUALITY_BASE[params.quality] > 1024 ? "2k" : "1k";
        }
        return;
    }

    if (params.size) body.size = params.size;
    if (params.quality && !config.codexCli) body.quality = params.quality;
}

export function applyImageGenerationOptions(body: Record<string, unknown>, config: AiConfig, params: ImageRequestParams) {
    if (isZhipuImageModel(config.model)) return;
    if (params.n > 1) body.n = params.n;
    if (config.responseFormatB64Json) body.response_format = "b64_json";
    if (config.streamImages) {
        body.stream = true;
        body.partial_images = params.streamPartialImages;
    }
}

export function assertImageReferencesSupported(model: string, references: ReferenceImage[]) {
    if (references.length && isZhipuImageModel(model)) throw new ImageRequestError("智谱 GLM-Image 和 CogView 仅支持文生图");
}

export function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = (config.systemPrompts.image || config.systemPrompt).trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

export function withPromptGuard(config: AiConfig, prompt: string) {
    return config.codexCli ? `${PROMPT_REWRITE_GUARD_PREFIX}\n${prompt}` : prompt;
}

export async function createGrokImageEditBody(config: AiConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams) {
    const body: Record<string, unknown> = {
        model: config.model,
        prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
        images: await Promise.all(references.map(async (image) => ({ url: await imageToDataUrl(image) }))),
    };
    if (params.n > 1) body.n = params.n;
    applyImageGenerationParams(body, config, params, "edit");
    if (config.responseFormatB64Json) body.response_format = "b64_json";
    if (config.streamImages) {
        body.stream = true;
        body.partial_images = params.streamPartialImages;
    }
    return body;
}

export function createResponsesImageTool(config: AiConfig, params: ImageRequestParams, isEdit: boolean) {
    const tool: Record<string, unknown> = {
        type: "image_generation",
        action: isEdit ? "edit" : "generate",
        size: params.size || "auto",
    };
    if (params.quality && !config.codexCli) tool.quality = params.quality;
    if (config.streamImages) tool.partial_images = params.streamPartialImages;
    return tool;
}

export function createResponsesInput(config: AiConfig, prompt: string, inputImageDataUrls: string[]) {
    const text = config.codexCli ? `${PROMPT_REWRITE_GUARD_PREFIX}\n${prompt}` : prompt;
    if (!inputImageDataUrls.length) return text;
    return [
        {
            role: "user",
            content: [
                { type: "input_text", text },
                ...inputImageDataUrls.map((dataUrl) => ({
                    type: "input_image",
                    image_url: dataUrl,
                })),
            ],
        },
    ];
}

export function createChatImageBody(config: AiConfig, prompt: string, inputImageDataUrls: string[], params: ImageRequestParams) {
    const image = geminiImageSettings(config.model, config.quality, config.size, params.size);
    const imageConfig = {
        ...(image.aspectRatio ? { aspect_ratio: image.aspectRatio } : {}),
        ...(image.imageSize ? { image_size: image.imageSize } : {}),
    };
    const text = withPromptGuard(config, withSystemPrompt(config, prompt));
    return {
        model: config.model,
        messages: [{
            role: "user",
            content: inputImageDataUrls.length
                ? [{ type: "text", text }, ...inputImageDataUrls.map((url) => ({ type: "image_url", image_url: { url } }))]
                : text,
        }],
        modalities: ["image", "text"],
        ...(Object.keys(imageConfig).length ? { image_config: imageConfig } : {}),
        stream: false,
    };
}

export async function imageTranslationInput(config: AiConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams): Promise<TranslationInput> {
    return {
        kind: "image",
        variables: {
            model: config.model,
            prompt: withPromptGuard(config, withSystemPrompt(config, prompt)),
            size: params.size,
            aspectRatio: normalizeTranslationAspectRatio(config.size),
            quality: config.quality,
            count: params.n,
            images: await Promise.all(references.map(async (ref) => publicHttpUrl(ref.url) || publicHttpUrl(ref.dataUrl) || imageToDataUrl(ref))),
        },
    };
}

export async function createGeminiImageBody(config: AiConfig, prompt: string, references: ReferenceImage[], params: ImageRequestParams) {
    const image = geminiImageSettings(config.model, config.quality, config.size, params.size);
    const parts: Array<Record<string, unknown>> = [{ text: withPromptGuard(config, prompt) }];
    const dataUrls = await Promise.all(references.map(imageToDataUrl));
    parts.push(...dataUrls.map(dataUrlToGeminiInlineData));
    const systemPrompt = (config.systemPrompts.image || config.systemPrompt).trim();
    return {
        model: config.model,
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: image },
    };
}

function geminiImageSettings(model: string, quality: string, size: string, resolvedSize?: string) {
    const aspectRatio = normalizeGeminiImageRatio(size);
    const normalizedQuality = quality.trim().toLowerCase();
    const preset = `${size} ${resolvedSize || ""}`.toLowerCase();
    const imageSize = normalizedQuality === "low" ? "1K" : normalizedQuality === "medium" ? "2K" : normalizedQuality === "high" ? "4K" : preset.includes("6272x2688") || preset.includes("3840x2160") || preset.includes("2160x3840") ? "4K" : preset.includes("2048x") || preset.includes("3136x1344") ? "2K" : "";
    return {
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(!model.toLowerCase().includes("2.5") && imageSize ? { imageSize } : {}),
    };
}

function normalizeGeminiImageRatio(value: string) {
    const normalized = value.trim().toLowerCase();
    const exact: Record<string, string> = {
        "1:1": "1:1", "2048x2048": "1:1", "3:2": "3:2", "2:3": "2:3", "4:3": "4:3", "3:4": "3:4",
        "16:9": "16:9", "2048x1152": "16:9", "3840x2160": "16:9", "9:16": "9:16", "1152x2048": "9:16", "2160x3840": "9:16",
        "21:9": "21:9", "3136x1344": "21:9", "6272x2688": "21:9",
    };
    if (exact[normalized]) return exact[normalized];
    if (normalized === "auto") return "";
    const dimensions = normalized.match(/^(\d+)x(\d+)$/);
    if (!dimensions) return "1:1";
    const ratio = Number(dimensions[1]) / Number(dimensions[2]);
    const ratios: Array<[string, number]> = [["1:1", 1], ["3:2", 1.5], ["2:3", 2 / 3], ["4:3", 4 / 3], ["3:4", 3 / 4], ["16:9", 16 / 9], ["9:16", 9 / 16], ["21:9", 21 / 9]];
    return ratios.reduce((best, current) => Math.abs(current[1] - ratio) < Math.abs(best[1] - ratio) ? current : best)[0];
}
export function isAgnesImageModel(model: string) {
    const m = model.toLowerCase().replace(/[\s_]+/g, "-");
    return m.startsWith("agnes-image") || m.startsWith("agens-image");
}

function isAgnesImage21Model(model: string) {
    const m = model.toLowerCase().replace(/[\s_]+/g, "-");
    return m.startsWith("agnes-image-2.1") || m.startsWith("agnes-image-2.5");
}

function normalizeAgnesImage21Ratio(value: string) {
    const ratio = value.trim().toLowerCase();
    if (["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"].includes(ratio)) {
        return ratio;
    }
    if (ratio === "2048x2048") return "1:1";
    if (ratio === "2048x1152" || ratio === "3840x2160") return "16:9";
    if (ratio === "1152x2048" || ratio === "2160x3840") return "9:16";
    if (ratio === "3136x1344" || ratio === "6272x2688") return "21:9";
    return "1:1";
}

export function applyAgnesImageSize(
    body: Record<string, unknown>,
    config: AiConfig,
    params: ImageRequestParams,
) {
    if (!isAgnesImage21Model(config.model)) {
        if (params.size) body.size = params.size;
        return;
    }
    body.size = ({
        auto: "1K",
        low: "2K",
        medium: "3K",
        high: "4K",
    } as Record<string, string>)[params.quality] || "1K";
    body.ratio = normalizeAgnesImage21Ratio(config.size);
}

export function publicHttpUrl(value?: string) {
    if (!value || value.startsWith("blob:") || value.startsWith("data:")) return "";
    try {
        const url = new URL(value, typeof window === "undefined" ? undefined : window.location.origin);
        if (!["http:", "https:"].includes(url.protocol)) return "";
        if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return "";
        return url.href;
    } catch {
        return "";
    }
}
