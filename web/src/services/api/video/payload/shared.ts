import { publicHttpUrl } from "../../public-url";
import { dataUrlToFile } from "@/lib/image-utils";
import { resolveMediaUrl } from "@/services/file-storage";
import { imageToDataUrl, resolveImageUrl } from "@/services/image-storage";
import { ReferenceImage } from "@/types/image";
import { ReferenceAudio, ReferenceVideo } from "@/types/media";

export { videoChannelProtocol } from "@/services/api/protocols/kling-models";

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

export { publicHttpUrl } from "../../public-url";

export function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.trim().replace(/p$/i, "") || "720";
    return /k$/i.test(resolution) ? resolution.toLowerCase() : `${resolution}p`;
}
