import { readFileAsDataUrl } from "@/lib/image-utils";
import { normalizeMiniMaxH3Duration, normalizeMiniMaxH3Ratio, normalizeMiniMaxH3Resolution } from "@/lib/minimax-video";
import { localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { ReferenceImage } from "@/types/image";
import { VideoRequestError } from "../types";
import { VideoReferenceInput } from "../types";

import { imageReferenceToFormValue, mediaReferenceToFormValue } from "./shared";


export function miniMaxApiUrl(config: AiConfig, path: string) {
    const channel = localChannelForActiveModel(config);
    return `${(channel?.baseUrl || config.baseUrl).trim().replace(/\/+$/, "")}${path}`;
}

export async function createMiniMaxH3VideoRequestBody(config: AiConfig, model: string, prompt: string, input: Required<VideoReferenceInput>) {
    const hasFrames = Boolean(input.firstFrame || input.lastFrame);
    const hasReferences = Boolean(input.references.length || input.videoReferences.length || input.audioReferences.length);
    if (hasFrames && hasReferences) throw new VideoRequestError("MiniMax-H3 首尾帧不能与参考图片、视频或音频同时使用");
    if (input.audioReferences.length && !input.references.length && !input.videoReferences.length) {
        throw new VideoRequestError("MiniMax-H3 参考音频需要同时提供参考图片或参考视频");
    }

    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    if (hasFrames) {
        const frames = [
            { reference: input.firstFrame, role: "first_frame" },
            { reference: input.lastFrame, role: "last_frame" },
        ].filter((item): item is { reference: ReferenceImage; role: string } => Boolean(item.reference));
        const urls = await Promise.all(frames.map((item) => miniMaxReferenceValue(imageReferenceToFormValue(item.reference))));
        frames.forEach((item, index) => content.push({ type: "image_url", image_url: { url: urls[index] }, role: item.role }));
    } else if (hasReferences) {
        const [images, videos, audios] = await Promise.all([
            Promise.all(input.references.map((reference) => miniMaxReferenceValue(imageReferenceToFormValue(reference)))),
            Promise.all(input.videoReferences.map((reference) => miniMaxReferenceValue(mediaReferenceToFormValue(reference)))),
            Promise.all(input.audioReferences.map((reference) => miniMaxReferenceValue(mediaReferenceToFormValue(reference)))),
        ]);
        images.forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
        videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
        audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
    }

    const selectedRatio = normalizeMiniMaxH3Ratio(config.size);
    return {
        model,
        content,
        resolution: normalizeMiniMaxH3Resolution(config.vquality),
        duration: normalizeMiniMaxH3Duration(config.videoSeconds),
        ratio: hasFrames ? "adaptive" : !hasReferences && selectedRatio === "adaptive" ? "16:9" : selectedRatio,
    };
}

async function miniMaxReferenceValue(value: Promise<string | File>) {
    const reference = await value;
    return typeof reference === "string" ? reference : readFileAsDataUrl(reference);
}
