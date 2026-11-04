import type { FilmAsset, FilmCharacterPart, FilmCharacterPartKey, FilmCharacterProfile, FilmImageRef } from "../types";

export const CHARACTER_PART_DEFINITIONS: Array<{ key: FilmCharacterPartKey; label: string; hint: string }> = [
    { key: "face", label: "面部", hint: "人脸三视图、妆容" },
    { key: "hair", label: "发型", hint: "发型、发饰" },
    { key: "upper", label: "上身", hint: "肩部以上服装、三视图" },
    { key: "middle", label: "中段", hint: "肩到腰、服装版型" },
    { key: "lower", label: "下身", hint: "腰到脚、腿型、鞋子" },
    { key: "limbs", label: "四肢", hint: "手、脚、肢体特写" },
];

export function createEmptyCharacterPart(): FilmCharacterPart {
    return { images: [], prompt: "", notes: "", locked: false };
}

export function createEmptyCharacterProfile(): FilmCharacterProfile {
    return {
        parts: {
            face: createEmptyCharacterPart(),
            hair: createEmptyCharacterPart(),
            upper: createEmptyCharacterPart(),
            middle: createEmptyCharacterPart(),
            lower: createEmptyCharacterPart(),
            limbs: createEmptyCharacterPart(),
        },
        props: [],
        masterViews: [],
        masterLocked: false,
    };
}

export function ensureCharacterProfile(asset: FilmAsset): FilmCharacterProfile {
    return asset.character ?? createEmptyCharacterProfile();
}

export function characterPartLabel(key: FilmCharacterPartKey) {
    return CHARACTER_PART_DEFINITIONS.find((part) => part.key === key)?.label || key;
}

/** 全身合成图，旧角色没有档案时回退到主设定图。 */
export function characterMasterImages(asset: FilmAsset): FilmImageRef[] {
    const profile = asset.character;
    if (profile?.masterViews.length) return profile.masterViews;
    if (asset.imageUrl) return [{ id: `${asset.id}-cover`, url: asset.imageUrl, storageKey: asset.storageKey, source: "generated" }];
    return [];
}

export function characterPartImages(profile: FilmCharacterProfile | undefined, key: FilmCharacterPartKey): FilmImageRef[] {
    return profile?.parts[key]?.images || [];
}

/** 全参考顺序：面部优先，然后是全身、上身等，道具最后。 */
export function characterReferenceImages(asset: FilmAsset, options: { includeMaster?: boolean; excludePart?: FilmCharacterPartKey } = {}): FilmImageRef[] {
    const profile = asset.character;
    const refs: FilmImageRef[] = [];
    if (profile) {
        for (const part of CHARACTER_PART_DEFINITIONS) {
            if (options.excludePart === part.key) continue;
            refs.push(...profile.parts[part.key].images);
        }
    }
    if (options.includeMaster) refs.unshift(...characterMasterImages(asset));
    return refs;
}

export function characterProgress(asset: FilmAsset) {
    const profile = ensureCharacterProfile(asset);
    const total = CHARACTER_PART_DEFINITIONS.length;
    const done = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].images.length > 0).length;
    const locked = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].locked).length;
    return { done, total, locked, master: characterMasterImages(asset).length, masterLocked: profile.masterLocked };
}
