import { dataUrlToGeminiInlineData } from "@/lib/gemini";
import { isGeminiVeo31Model, normalizeGeminiVideoDuration, normalizeGeminiVideoRatio, normalizeGeminiVideoResolution } from "@/lib/gemini-video";
import { modelKey, videoDurationOptionsForModel } from "@/lib/video-model-capabilities";
import { imageToDataUrl } from "@/services/image-storage";
import { type AiConfig } from "@/stores/use-config-store";
import { VideoRequestError } from "../types";
import { VideoReferenceInput } from "../types";

import { normalizeVideoSeconds } from "./shared";


export function isGeminiOmniFlashVideoModel(model: string) {
    return modelKey(model) === "gemini-omni-flash-preview";
}

export function normalizeVideoSecondsForModel(model: string, value: string) {
    const options = videoDurationOptionsForModel(model);
    if (options?.includes(-1) && value.trim() === "-1") return "-1";
    const seconds = Number(normalizeVideoSeconds(value));
    return options ? closestAllowedSeconds(seconds, options) : String(seconds);
}

function closestAllowedSeconds(seconds: number, allowed: number[]) {
    return String(allowed.reduce((best, item) => Math.abs(item - seconds) < Math.abs(best - seconds) ? item : best, allowed[0]));
}

export async function createGeminiVeoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    if (input.videoReferences.length) throw new VideoRequestError("Gemini Veo 不支持普通参考视频，请移除后重试");
    if (input.audioReferences.length) throw new VideoRequestError("Gemini Veo 不支持参考音频，请移除后重试");
    if (input.lastFrame && !input.firstFrame) throw new VideoRequestError("请先添加首帧图片");
    const hasFrames = Boolean(input.firstFrame || input.lastFrame);
    if (hasFrames && input.references.length) throw new VideoRequestError("首尾帧模式不能与普通参考图同时使用");
    if ((input.lastFrame || input.references.length) && !isGeminiVeo31Model(model)) throw new VideoRequestError("当前 Veo 模型不支持尾帧或普通参考图");
    if (input.references.length > 3) throw new VideoRequestError("Veo 3.1 参考图最多 3 张");

    const instance: Record<string, unknown> = { prompt };
    if (input.firstFrame) instance.image = dataUrlToGeminiInlineData(await imageToDataUrl(input.firstFrame));
    if (input.lastFrame) instance.lastFrame = dataUrlToGeminiInlineData(await imageToDataUrl(input.lastFrame));
    if (input.references.length) {
        const images = await Promise.all(input.references.map(imageToDataUrl));
        instance.referenceImages = images.map((image) => ({ image: dataUrlToGeminiInlineData(image), referenceType: "asset" }));
    }
    const resolution = normalizeGeminiVideoResolution(config.vquality);
    const forceEightSeconds = resolution !== "720p" || hasFrames || input.references.length > 0;
    const aspectRatio = normalizeGeminiVideoRatio(config.size);
    return {
        model,
        instances: [instance],
        parameters: {
            ...(aspectRatio ? { aspectRatio } : {}),
            durationSeconds: normalizeGeminiVideoDuration(config.videoSeconds, forceEightSeconds),
            resolution,
        },
    };
}
