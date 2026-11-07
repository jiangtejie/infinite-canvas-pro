import { boolConfig, normalizeSeedanceDuration, normalizeSeedanceRatio } from "@/lib/seedance-video";
import { modelKey } from "@/lib/video-model-capabilities";
import { type AiConfig } from "@/stores/use-config-store";
import { VideoReferenceInput } from "../types";

import { imageToAgnesReference, normalizeVideoResolution } from "./shared";


export async function createArkSeedanceVideoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    const [images, firstFrame, lastFrame] = await Promise.all([
        Promise.all(input.references.map(imageToAgnesReference)),
        input.firstFrame ? imageToAgnesReference(input.firstFrame) : "",
        input.lastFrame ? imageToAgnesReference(input.lastFrame) : "",
    ]);
    const videos = input.videoReferences.map((item) => item.url).filter(Boolean);
    const audios = input.audioReferences.map((item) => item.url).filter(Boolean);
    return {
        model,
        prompt,
        seconds: normalizeSeedanceDuration(config.videoSeconds, (modelKey(model).includes("seedance-2-5") || modelKey(model).includes("seedance2-5") || modelKey(model).includes("sd2-5")) ? 30 : 15),
        size: normalizeSeedanceRatio(config.size),
        resolution_name: normalizeVideoResolution(config.vquality),
        video_generate_audio: boolConfig(config.videoGenerateAudio, false),
        video_watermark: boolConfig(config.videoWatermark, false),
        ...(images.length ? { "input_reference[]": images } : {}),
        ...(firstFrame ? { first_frame_url: firstFrame } : {}),
        ...(lastFrame ? { last_frame_url: lastFrame } : {}),
        ...(videos.length ? { "video_reference[]": videos } : {}),
        ...(audios.length ? { "audio_reference[]": audios } : {}),
    };
}
