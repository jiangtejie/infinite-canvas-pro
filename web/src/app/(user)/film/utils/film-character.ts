import type { FilmAsset, FilmCharacterPart, FilmCharacterPartKey, FilmCharacterProfile, FilmCharacterState, FilmImageRef, FilmShot } from "@/lib/film/types";

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
        states: [],
        masterViews: [],
        masterLocked: false,
    };
}

export function ensureCharacterProfile(asset: FilmAsset): FilmCharacterProfile {
    return asset.character ?? createEmptyCharacterProfile();
}

export function createCharacterState(index = 1): FilmCharacterState {
    return { id: crypto.randomUUID(), name: `状态 ${index}`, description: "", outfit: "", physicalCondition: "", heldProps: [] };
}

export function findFilmCharacterState(asset: FilmAsset, stateId?: string): FilmCharacterState | undefined {
    if (!stateId) return undefined;
    return asset.character?.states.find((state) => state.id === stateId);
}

export function filmCharacterSignature(asset: FilmAsset): string {
    const profile = ensureCharacterProfile(asset);
    return JSON.stringify({
        name: asset.name,
        aliases: asset.aliases,
        description: asset.description,
        visualPrompt: asset.visualPrompt,
        parts: CHARACTER_PART_DEFINITIONS.map(({ key }) => ({
            key,
            prompt: profile.parts[key].prompt,
            notes: profile.parts[key].notes,
            locked: profile.parts[key].locked,
            images: profile.parts[key].images.map((image) => image.id),
        })),
        props: profile.props.map((prop) => ({ id: prop.id, name: prop.name, type: prop.type, description: prop.description, locked: prop.locked, images: prop.images.map((image) => image.id) })),
        states: profile.states.map((state) => ({ ...state, referenceImage: state.referenceImage ? { id: state.referenceImage.id } : undefined })),
        masterLocked: profile.masterLocked,
        masterViews: profile.masterViews.map((image) => image.id),
    });
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

/** 身份包参考：优先角色卡，否则最后一张全身合成图；每个角色在镜头参考里至少占一张。 */
export function characterPackageImage(asset: FilmAsset): FilmImageRef | undefined {
    const card = asset.character?.card;
    if (card) return card;
    return characterMasterImages(asset).slice(-1)[0];
}

/** 景别驱动的细节参考：特写取面部，手部/道具戏取四肢或道具图。 */
export function characterDetailImage(asset: FilmAsset, shot: Pick<FilmShot, "shotType" | "description" | "dialogue">): FilmImageRef | undefined {
    const profile = asset.character;
    if (!profile) return undefined;
    const text = `${shot.shotType || ""} ${shot.description || ""} ${shot.dialogue || ""}`;
    if (CLOSEUP_RE.test(text) && profile.parts.face.images.length) return profile.parts.face.images.slice(-1)[0];
    if (DETAIL_RE.test(text)) return [...profile.parts.limbs.images, ...profile.props.flatMap((prop) => prop.images)].slice(-1)[0];
    return undefined;
}

/** 角色卡是否过期：与角色设定签名同源，文字或图片设定变化都需要重新拼图。 */
export function isCharacterCardStale(asset: FilmAsset): boolean {
    const profile = asset.character;
    return Boolean(profile?.card && profile.cardSignature && profile.cardSignature !== filmCharacterSignature(asset));
}

/** 设定签名的 8 位短摘要（FNV-1a），仅用于 UI 对比版本设定，非安全用途。 */
export function filmSignatureDigest(signature: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < signature.length; index++) {
        hash ^= signature.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

export function characterProgress(asset: FilmAsset) {
    const profile = ensureCharacterProfile(asset);
    const total = CHARACTER_PART_DEFINITIONS.length;
    const done = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].images.length > 0).length;
    const locked = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].locked).length;
    return { done, total, locked, master: characterMasterImages(asset).length, masterLocked: profile.masterLocked, card: Boolean(profile.card) };
}
