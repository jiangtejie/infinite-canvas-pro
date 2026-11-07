import { normalizeSeedanceRatio } from "@/lib/seedance-video";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import { type AiConfig } from "@/stores/use-config-store";
import { ReferenceImage } from "@/types/image";
import { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { VideoRequestError } from "../types";
import { VideoReferenceInput } from "../types";

import { normalizeVideoSeconds, publicHttpUrl } from "./shared";


export function agnesBaseUrl(baseUrl: string) {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    return normalized.toLowerCase().endsWith("/v1") ? normalized.slice(0, -3).replace(/\/+$/, "") : normalized;
}

export async function createAgnesVideoV25RequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    const hasFrames = Boolean(input.firstFrame || input.lastFrame);
    const hasReferences = Boolean(input.references.length || input.videoReferences.length || input.audioReferences.length);
    if (hasFrames && hasReferences) throw new VideoRequestError("Agnes Video 2.5 的首尾帧不能和普通参考素材同时使用");

    const ratio = normalizeSeedanceRatio(config.size);
    const body: Record<string, unknown> = {
        model,
        prompt,
        mode: hasFrames ? "keyframe" : hasReferences ? "reference" : "text",
        seconds: String(Math.min(12, Math.max(4, Math.floor(Number(config.videoSeconds) || 5)))),
        size: "720P",
        aspect_ratio: ratio === "adaptive" ? "16:9" : ratio,
    };
    if (input.firstFrame) body.first_frame = await agnesVideoV25ReferenceUrl(input.firstFrame);
    if (input.lastFrame) body.last_frame = await agnesVideoV25ReferenceUrl(input.lastFrame);
    if (input.references.length) body.images = await Promise.all(input.references.map(agnesVideoV25ReferenceUrl));
    if (input.audioReferences.length) body.audios = await Promise.all(input.audioReferences.map(agnesVideoV25ReferenceUrl));
    if (input.videoReferences.length) {
        const urls = await Promise.all(input.videoReferences.map(agnesVideoV25ReferenceUrl));
        body.videos = urls.map((url) => ({ url }));
    }
    return body;
}

async function agnesVideoV25ReferenceUrl(reference: ReferenceImage | ReferenceVideo | ReferenceAudio) {
    const resolvedUrl = "dataUrl" in reference
        ? await resolveImageUrl(reference.storageKey, reference.url || "")
        : await resolveMediaUrl(reference.storageKey, reference.url);
    const url = publicHttpUrl(reference.url) || ("dataUrl" in reference ? publicHttpUrl(reference.dataUrl) : "") || publicHttpUrl(resolvedUrl);
    if (!url) throw new VideoRequestError("Agnes Video 2.5 的参考素材必须具有公网访问地址");
    return url;
}

export function agnesFrameRate(secondsValue: string) {
    const seconds = Number(normalizeVideoSeconds(secondsValue));
    return seconds > 18 ? Math.max(1, Math.floor(440 / seconds)) : 24;
}

export function agnesNumFrames(secondsValue: string, frameRate: number) {
    const target = Math.round(Number(normalizeVideoSeconds(secondsValue)) * frameRate) + 1;
    const capped = Math.min(441, Math.max(9, target));
    return capped - ((capped - 1) % 8);
}

export function isAgnesVideoModel(model: string) {
    return model.toLowerCase().includes("agnes-video");
}
