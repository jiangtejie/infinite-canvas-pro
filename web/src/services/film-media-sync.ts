import type { FilmAsset, FilmImageSlot } from "@/lib/film/types";
import { applyMediaPromotions, collectMediaPromotions, mediaNeedsPromotion, type MediaPromotionRef, type MediaPromotionReplacement } from "@/services/media-promotion";

export type FilmMediaReplacement = MediaPromotionReplacement;

function collectSlot(slot: FilmImageSlot | undefined, refs: MediaPromotionRef[]) {
    for (const image of slot?.images || []) refs.push({ storageKey: image.storageKey, url: image.url, kind: "image" });
}

function collectAssetMedia(asset: FilmAsset, refs: MediaPromotionRef[]) {
    collectSlot(asset.concept, refs);
    collectSlot(asset.views, refs);
    const profile = asset.character;
    if (profile) {
        collectSlot(profile.board, refs);
        for (const state of profile.states) collectSlot(state.look, refs);
    }
    for (const variant of asset.location?.variants || []) collectSlot(variant.concept, refs);
}

function collectRefs(library: FilmAsset[]) {
    const refs: MediaPromotionRef[] = [];
    library.forEach((asset) => collectAssetMedia(asset, refs));
    return refs;
}

/** 是否还有未升级到云存储的本地媒体。 */
export function filmMediaNeedsPromotion(library: FilmAsset[]) {
    return mediaNeedsPromotion(collectRefs(library));
}

/** 收集并上传母版库中仍在本地的图片/视频，返回旧键到云存储键的替换表。 */
export async function collectFilmMediaPromotions(library: FilmAsset[], token: string, concurrency?: number) {
    return collectMediaPromotions(collectRefs(library), token, concurrency);
}

export type FilmLibraryMediaSnapshot = {
    characters: FilmAsset[];
    locations: FilmAsset[];
    props: FilmAsset[];
    costumes: FilmAsset[];
    styles: FilmAsset[];
};

export function applyFilmMediaPromotionsToLibrary(library: FilmLibraryMediaSnapshot, replacements: Map<string, FilmMediaReplacement>) {
    let changed = false;
    const applyList = (assets: FilmAsset[]) => assets.map((asset) => {
        const applied = applyMediaPromotions(asset, replacements);
        if (!applied.changed) return asset;
        changed = true;
        return { ...applied.value, updatedAt: new Date().toISOString() };
    });
    const next = {
        characters: applyList(library.characters),
        locations: applyList(library.locations),
        props: applyList(library.props),
        costumes: applyList(library.costumes),
        styles: applyList(library.styles),
    };
    return { library: changed ? next : library, changed };
}
