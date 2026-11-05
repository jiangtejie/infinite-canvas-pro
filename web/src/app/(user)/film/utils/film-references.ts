import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import { compressFilmReference } from "./film-image-compress";
import type { FilmAsset, FilmImageRef, FilmProject, FilmShot } from "../types";
import { characterShotReferenceImages } from "./film-character";

const MAX_SHOT_REFERENCES = 6;

/** 收集镜头参考：角色默认只带一张角色卡（特写/手部戏追加一张），场景带主概念图。 */
export async function collectFilmShotReferences(project: FilmProject, shot: FilmShot, options: { includeStoryboard?: boolean } = {}) {
    const characters = project.characters || [];
    const locations = project.locations || [];
    const characterAssets = (shot.characterIds || []).map((id) => characters.find((asset) => asset.id === id)).filter((asset): asset is FilmAsset => Boolean(asset));
    const locationAsset = shot.locationId ? locations.find((asset) => asset.id === shot.locationId) : undefined;
    const hints = [
        ...characterAssets.map((asset) => `${asset.name}${asset.description ? `（${asset.description}）` : ""}`),
        ...(locationAsset ? [`${locationAsset.name}${locationAsset.description ? `（${locationAsset.description}）` : ""}`] : []),
    ].join("；");

    const references: ReferenceImage[] = [];
    const pushReference = async (ref: FilmImageRef, name: string) => {
        if (references.length >= MAX_SHOT_REFERENCES) return;
        try {
            const dataUrl = await imageToDataUrl({ url: ref.url, storageKey: ref.storageKey });
            if (dataUrl) {
                const compressed = await compressFilmReference(dataUrl);
                references.push({ id: ref.id, name: `${name}.jpg`, type: compressed.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png", dataUrl: compressed, storageKey: ref.storageKey });
            }
        } catch {
            // 单张参考图读取失败时跳过
        }
    };

    for (const asset of characterAssets) {
        for (const ref of characterShotReferenceImages(asset, shot)) {
            await pushReference(ref, asset.name);
        }
    }
    if (locationAsset && (locationAsset.imageUrl || locationAsset.storageKey)) {
        await pushReference({ id: locationAsset.id, url: locationAsset.imageUrl || "", storageKey: locationAsset.storageKey }, locationAsset.name);
    }
    if (options.includeStoryboard && references.length < MAX_SHOT_REFERENCES && (shot.imageUrl || shot.storageKey)) {
        try {
            const dataUrl = await imageToDataUrl({ url: shot.imageUrl, storageKey: shot.storageKey });
            if (dataUrl) references.push({ id: `${shot.id}-storyboard`, name: `shot-${shot.shotNo}.png`, type: "image/png", dataUrl, storageKey: shot.storageKey });
        } catch {
            // 分镜图读取失败时只用角色与场景参考
        }
    }

    if (typeof window !== "undefined" && references.length) {
        console.info("[film-image] 分镜参考图", {
            count: references.length,
            totalKb: Math.round(references.reduce((total, item) => total + item.dataUrl.length, 0) / 1024),
            sizesKb: references.map((item) => Math.round(item.dataUrl.length / 1024)),
        });
    }
    return { references, hints };
}
