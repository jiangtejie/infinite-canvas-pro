import { boolConfig, normalizeSeedanceDuration, normalizeSeedanceRatio } from "@/lib/seedance-video";
import { modelKey } from "@/lib/video-model-capabilities";
import { imageToDataUrl } from "@/services/image-storage";
import { type AiConfig } from "@/stores/use-config-store";
import { ReferenceImage } from "@/types/image";
import { VideoReferenceInput } from "../types";

import { normalizeVideoResolution } from "./shared";


export async function createOpenAICloudVideoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    const pushImage = async (image: ReferenceImage, role: string) => {
        try {
            const dataUrl = image.dataUrl || await imageToDataUrl(image);
            if (dataUrl) content.push({ type: "image_url", image_url: { url: dataUrl }, role });
        } catch {
            // 单张参考图读取失败时跳过
        }
    };
    for (const image of input.references) await pushImage(image, "reference_image");
    if (input.firstFrame) await pushImage(input.firstFrame, "first_frame");
    if (input.lastFrame) await pushImage(input.lastFrame, "last_frame");
    for (const video of input.videoReferences) {
        if (video.url) content.push({ type: "video_url", video_url: { url: video.url }, role: "reference_video" });
    }
    for (const audio of input.audioReferences) {
        if (audio.url) content.push({ type: "audio_url", audio_url: { url: audio.url }, role: "reference_audio" });
    }
    const seconds = normalizeSeedanceDuration(config.videoSeconds, (modelKey(model).includes("seedance-2-5") || modelKey(model).includes("seedance2-5")) ? 30 : 15);
    const ratio = normalizeSeedanceRatio(config.size);
    return {
        model,
        prompt,
        content,
        seconds: String(seconds),
        duration: seconds,
        resolution: normalizeVideoResolution(config.vquality),
        ...(ratio !== "adaptive" ? { ratio, aspect_ratio: ratio } : {}),
        generate_audio: boolConfig(config.videoGenerateAudio, false),
        watermark: boolConfig(config.videoWatermark, false),
    };
}
