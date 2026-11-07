import { normalizeSeedanceRatio } from "@/lib/seedance-video";
import { imageToDataUrl } from "@/services/image-storage";
import { type AiConfig } from "@/stores/use-config-store";
import { VideoReferenceInput } from "../types";

import { normalizeVideoResolution, normalizeVideoSeconds, videoChannelProtocol } from "./shared";


export function isGrok2APIVideoConfig(config: AiConfig, model: string) {
    const normalizedModel = model.trim().toLowerCase();
    return (normalizedModel === "grok-imagine-video" || normalizedModel === "grok-imagine-video-1.5") && videoChannelProtocol(config, model) === "grok2api";
}

export async function createGrok2APIVideoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    const body: Record<string, unknown> = {
        model,
        prompt,
        duration: Number(normalizeVideoSeconds(config.videoSeconds)),
        resolution: normalizeVideoResolution(config.vquality),
    };
    const aspectRatio = normalizeSeedanceRatio(config.size);
    if (aspectRatio !== "adaptive") body.aspect_ratio = aspectRatio;

    const urls = await Promise.all(input.references.map((reference) => imageToDataUrl(reference)));
    if (urls.length === 1) body.image = { url: urls[0] };
    else if (urls.length > 1) body.reference_images = urls.map((url) => ({ url }));

    return body;
}

export function normalizeGrokVideoMode(value: string) {
    return value === "fun" || value === "spicy" ? value : "normal";
}
