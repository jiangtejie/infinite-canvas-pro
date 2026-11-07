import { boolConfig, normalizeSeedanceRatio } from "@/lib/seedance-video";
import { normalizeCogVideoX3Duration } from "@/lib/video-model-capabilities";
import { imageToDataUrl } from "@/services/image-storage";
import { type AiConfig } from "@/stores/use-config-store";
import { ReferenceImage } from "@/types/image";
import { VideoRequestError } from "../types";
import { VideoReferenceInput } from "../types";

import { normalizeVideoResolution, normalizeVideoSize } from "./shared";


export async function createCogVideoX3RequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    if (input.videoReferences.length || input.audioReferences.length) throw new VideoRequestError("CogVideoX-3 不支持参考视频或参考音频");
    const frames = [input.firstFrame, input.lastFrame].filter((frame): frame is ReferenceImage => Boolean(frame));
    const references = (frames.length ? frames : input.references).slice(0, 2);
    const imageUrls = await Promise.all(references.map(imageToDataUrl));
    return {
        model,
        prompt,
        quality: normalizeVideoResolution(config.vquality) === "480p" ? "speed" : "quality",
        size: normalizeCogVideoX3Size(config.vquality, config.size),
        duration: Number(normalizeCogVideoX3Duration(config.videoSeconds)),
        with_audio: boolConfig(config.videoGenerateAudio, false),
        ...(imageUrls.length ? { image_url: imageUrls.length === 1 ? imageUrls[0] : imageUrls } : {}),
    };
}

function normalizeCogVideoX3Size(resolutionValue: string, sizeValue: string) {
    const exactSize = normalizeVideoSize(sizeValue);
    if (exactSize && ["1280x720", "720x1280", "1024x1024", "1920x1080", "1080x1920", "2048x1080", "3840x2160"].includes(exactSize)) return exactSize;
    const resolution = normalizeVideoResolution(resolutionValue);
    const ratio = normalizeSeedanceRatio(sizeValue);
    if (ratio === "1:1") return "1024x1024";
    if (ratio === "9:16" || ratio === "3:4") return resolution === "480p" || resolution === "720p" ? "720x1280" : "1080x1920";
    if (resolution === "4k") return "3840x2160";
    if (resolution === "2k") return "2048x1080";
    return resolution === "1080p" ? "1920x1080" : "1280x720";
}
