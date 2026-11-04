import type { FilmAsset, FilmCharacterPart, FilmCharacterPartKey, FilmCharacterProfile, FilmImageRef, FilmShot } from "../types";

export const CHARACTER_PART_DEFINITIONS: Array<{ key: FilmCharacterPartKey; label: string; hint: string }> = [
    { key: "face", label: "面部", hint: "人脸三视图、妆容" },
    { key: "hair", label: "发型", hint: "发型、发饰" },
    { key: "upper", label: "上身", hint: "肩到腰、服装版型、三视图" },
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

const CLOSEUP_RE = /CU|ECU|MCU|特写|近景|面部|脸/i;
const DETAIL_RE = /手部|拳头|武器|道具|饰品|剑|刀|枪|脚部|鞋子/i;

/** 分镜引用：默认一张角色卡或全身图，特写/手部戏再追加一张部位参考，最多 2 张。 */
export function characterShotReferenceImages(asset: FilmAsset, shot: Pick<FilmShot, "shotType" | "description" | "dialogue">): FilmImageRef[] {
    const profile = asset.character;
    const card = profile?.card;
    const refs: FilmImageRef[] = card ? [card] : characterMasterImages(asset);
    const text = `${shot.shotType || ""} ${shot.description || ""} ${shot.dialogue || ""}`;
    if (CLOSEUP_RE.test(text) && profile?.parts.face.images.length) {
        refs.push(profile.parts.face.images[profile.parts.face.images.length - 1]);
    } else if (DETAIL_RE.test(text) && profile) {
        const detail = [...profile.parts.limbs.images, ...profile.props.flatMap((prop) => prop.images)].slice(-1);
        refs.push(...detail);
    }
    return refs.slice(0, 2);
}

/** 角色卡内容签名，用于判断部位/合成图变化后角色卡是否过期。 */
export function characterCardSignature(asset: FilmAsset): string {
    const profile = ensureCharacterProfile(asset);
    const master = characterMasterImages(asset).map((image) => image.id).join(",");
    const parts = CHARACTER_PART_DEFINITIONS.map((part) => profile.parts[part.key].images.map((image) => image.id).join(",")).join(";");
    const props = profile.props.flatMap((prop) => prop.images.map((image) => image.id)).join(",");
    return [master, parts, props].join("|");
}

export function characterProgress(asset: FilmAsset) {
    const profile = ensureCharacterProfile(asset);
    const total = CHARACTER_PART_DEFINITIONS.length;
    const done = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].images.length > 0).length;
    const locked = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].locked).length;
    return { done, total, locked, master: characterMasterImages(asset).length, masterLocked: profile.masterLocked, card: Boolean(profile.card) };
}
