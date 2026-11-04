import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmProject, FilmShot } from "../types";

/** 收集镜头绑定的角色/场景参考图，可选把当前分镜图也作为参考（视频全参考模式）。 */
export async function collectFilmShotReferences(project: FilmProject, shot: FilmShot, options: { includeStoryboard?: boolean } = {}) {
    const characters = project.characters || [];
    const locations = project.locations || [];
    const assets = [
        ...(shot.characterIds || []).map((id) => characters.find((asset) => asset.id === id)),
        shot.locationId ? locations.find((asset) => asset.id === shot.locationId) : undefined,
    ].filter((asset): asset is FilmAsset => Boolean(asset && (asset.imageUrl || asset.storageKey)));

    const references: ReferenceImage[] = [];
    for (const asset of assets) {
        try {
            const dataUrl = await imageToDataUrl({ url: asset.imageUrl, storageKey: asset.storageKey });
            if (dataUrl) references.push({ id: asset.id, name: `${asset.name}.png`, type: "image/png", dataUrl, storageKey: asset.storageKey });
        } catch {
            // 参考图读取失败时继续用纯提示词生成
        }
    }
    if (options.includeStoryboard && (shot.imageUrl || shot.storageKey)) {
        try {
            const dataUrl = await imageToDataUrl({ url: shot.imageUrl, storageKey: shot.storageKey });
            if (dataUrl) references.push({ id: `${shot.id}-storyboard`, name: `shot-${shot.shotNo}.png`, type: "image/png", dataUrl, storageKey: shot.storageKey });
        } catch {
            // 分镜图读取失败时只用角色与场景参考
        }
    }

    const hints = assets.map((asset) => `${asset.name}${asset.description ? `（${asset.description}）` : ""}`).join("；");
    return { references, hints };
}
