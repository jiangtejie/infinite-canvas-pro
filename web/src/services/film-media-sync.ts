import type { FilmAsset, FilmImageSlot, FilmProject } from "@/lib/film/types";
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

function collectProjectMedia(project: FilmProject, refs: MediaPromotionRef[]) {
    [...(project.characters || []), ...(project.locations || []), ...(project.props || []), ...(project.costumes || [])].forEach((asset) => collectAssetMedia(asset, refs));
    if (project.style) collectAssetMedia(project.style, refs);
    for (const episode of project.episodes || []) {
        for (const scene of episode.scenes) {
            for (const shot of scene.shots) {
                if (shot.storageKey || shot.imageUrl) refs.push({ storageKey: shot.storageKey, url: shot.imageUrl, kind: "image" });
                if (shot.videoStorageKey || shot.videoUrl) refs.push({ storageKey: shot.videoStorageKey, url: shot.videoUrl, kind: "media" });
                for (const version of shot.imageVersions || []) refs.push({ storageKey: version.storageKey, url: version.url, kind: "image" });
                for (const version of shot.videoVersions || []) refs.push({ storageKey: version.storageKey, url: version.url, kind: "media" });
                for (const frame of [shot.firstFrame, shot.lastFrame]) {
                    if (frame) refs.push({ storageKey: frame.storageKey, url: frame.url, kind: "image" });
                }
            }
        }
    }
}

function collectRefs(projects: FilmProject[], library: FilmAsset[]) {
    const refs: MediaPromotionRef[] = [];
    projects.forEach((project) => collectProjectMedia(project, refs));
    library.forEach((asset) => collectAssetMedia(asset, refs));
    return refs;
}

/** 是否还有未升级到云存储的本地媒体。 */
export function filmMediaNeedsPromotion(projects: FilmProject[], library: FilmAsset[]) {
    return mediaNeedsPromotion(collectRefs(projects, library));
}

/** 收集并上传项目中仍在本地的图片/视频，返回旧键到云存储键的替换表。 */
export async function collectFilmMediaPromotions(projects: FilmProject[], library: FilmAsset[], token: string, concurrency?: number) {
    return collectMediaPromotions(collectRefs(projects, library), token, concurrency);
}

export function applyFilmMediaPromotionsToProjects(projects: FilmProject[], replacements: Map<string, FilmMediaReplacement>) {
    let changed = false;
    const next = projects.map((project) => {
        const applied = applyMediaPromotions(project, replacements);
        if (!applied.changed) return project;
        changed = true;
        return { ...applied.value, updatedAt: new Date().toISOString() };
    });
    return { projects: changed ? next : projects, changed };
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
