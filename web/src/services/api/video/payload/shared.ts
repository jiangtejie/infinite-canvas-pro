import { dataUrlToFile } from "@/lib/image-utils";
import { resolveMediaUrl } from "@/services/file-storage";
import { imageToDataUrl, resolveImageUrl } from "@/services/image-storage";
import { channelProtocolForConfig, type AiConfig } from "@/stores/use-config-store";
import { ReferenceImage } from "@/types/image";
import { ReferenceAudio, ReferenceVideo } from "@/types/media";


export function videoChannelProtocol(config: AiConfig, model: string) {
    return channelProtocolForConfig({ ...config, model, videoModel: model });
}

async function imageReferenceToFile(image: ReferenceImage) {
    return dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) });
}

export async function imageReferenceToFormValue(image: ReferenceImage) {
    const resolvedUrl = await resolveImageUrl(image.storageKey, "");
    for (const url of [image.url, resolvedUrl, image.dataUrl]) {
        const publicUrl = publicHttpUrl(url);
        if (publicUrl) return publicUrl;
    }
    return imageReferenceToFile(image);
}

async function mediaReferenceToFile(media: ReferenceVideo | ReferenceAudio) {
    const url = await resolveMediaUrl(media.storageKey, media.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`参考素材读取失败：${response.status}`);
    const blob = await response.blob();
    return new File([blob], media.name || "reference", { type: media.type || blob.type || "application/octet-stream" });
}

export async function mediaReferenceToFormValue(media: ReferenceVideo | ReferenceAudio) {
    const resolvedUrl = await resolveMediaUrl(media.storageKey, media.url);
    const publicUrl = publicHttpUrl(resolvedUrl) || publicHttpUrl(media.url);
    if (publicUrl) return publicUrl;
    return mediaReferenceToFile(media);
}

export async function imageToAgnesReference(image: ReferenceImage) {
    const resolvedUrl = await resolveImageUrl(image.storageKey, "");
    for (const url of [image.dataUrl, image.url, resolvedUrl]) {
        const publicUrl = publicHttpUrl(url);
        if (publicUrl) return publicUrl;
    }
    return imageToDataUrl(image);
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

export function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(30, seconds)));
}

export function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

export function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.trim().replace(/p$/i, "") || "720";
    return /k$/i.test(resolution) ? resolution.toLowerCase() : `${resolution}p`;
}
