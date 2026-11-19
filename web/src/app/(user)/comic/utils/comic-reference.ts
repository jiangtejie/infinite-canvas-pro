import type { InsertAssetPayload } from "@/lib/asset-picker";
import { uploadImage } from "@/services/image-storage";
import type { ComicImageRef } from "../types";

/** 把素材选择器的图片载荷转成漫画图片引用；本地 data URL 先升级到存储。 */
export async function comicImageFromPickedAsset(payload: InsertAssetPayload): Promise<ComicImageRef> {
    if (payload.kind !== "image") throw new Error("请选择图片素材");
    if (payload.storageKey || payload.source === "library") return { url: payload.dataUrl, storageKey: payload.storageKey, width: payload.width, height: payload.height };
    const uploaded = await uploadImage(payload.dataUrl);
    return { url: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height };
}
