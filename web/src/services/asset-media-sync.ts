import type { Asset } from "@/stores/use-asset-store";
import { applyMediaPromotions, collectMediaPromotions, mediaNeedsPromotion, type MediaPromotionRef, type MediaPromotionReplacement } from "@/services/media-promotion";

function collectAssetRefs(asset: Asset) {
    const refs: MediaPromotionRef[] = [];
    if (asset.kind === "image") refs.push({ storageKey: asset.data.storageKey, url: asset.data.dataUrl, kind: "image" });
    else if (asset.kind !== "text") refs.push({ storageKey: asset.data.storageKey, url: asset.data.url, kind: "media" });
    if (asset.coverUrl) refs.push({ url: asset.coverUrl, kind: "image" });
    return refs;
}

export function assetMediaNeedsPromotion(assets: Asset[]) {
    return mediaNeedsPromotion(assets.flatMap(collectAssetRefs));
}

/** 收集并上传我的素材中仍在本地的图片/视频/音频与封面，返回替换表。 */
export async function collectAssetMediaPromotions(assets: Asset[], token: string, concurrency?: number) {
    return collectMediaPromotions(assets.flatMap(collectAssetRefs), token, concurrency);
}

export function applyAssetMediaPromotions(assets: Asset[], replacements: Map<string, MediaPromotionReplacement>) {
    let changed = false;
    const next = assets.map((asset) => {
        const applied = applyMediaPromotions(asset, replacements);
        if (!applied.changed) return asset;
        changed = true;
        return { ...applied.value, updatedAt: new Date().toISOString() } as Asset;
    });
    return { assets: changed ? next : assets, changed };
}
