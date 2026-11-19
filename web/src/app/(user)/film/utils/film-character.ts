import type { FilmAsset, FilmCharacterPart, FilmCharacterPartKey, FilmCharacterProfile, FilmCharacterState, FilmImageRef, FilmImageSlot, FilmShot } from "@/lib/film/types";
import { activeSlotImage, createFilmImageSlot } from "./film-image-slot";

export const CHARACTER_PART_DEFINITIONS: Array<{ key: FilmCharacterPartKey; label: string; hint: string }> = [
    { key: "face", label: "面部", hint: "人脸三视图、妆容" },
    { key: "hair", label: "发型", hint: "发型、发饰" },
    { key: "upper", label: "上身", hint: "肩到腰、服装版型、三视图" },
    { key: "lower", label: "下身", hint: "腰到脚、腿型、鞋子" },
    { key: "limbs", label: "四肢", hint: "手、脚、肢体特写" },
];

export function createEmptyCharacterPart(): FilmCharacterPart {
    return { slot: createFilmImageSlot(), prompt: "", notes: "" };
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
        expressions: createFilmImageSlot(),
        master: createFilmImageSlot(),
        card: createFilmImageSlot(),
        propIds: [],
        states: [],
    };
}

export function ensureCharacterProfile(asset: FilmAsset): FilmCharacterProfile {
    return asset.character ?? createEmptyCharacterProfile();
}

export function createCharacterState(index = 1): FilmCharacterState {
    return { id: crypto.randomUUID(), name: `状态 ${index}`, description: "", condition: "", heldPropIds: [], look: createFilmImageSlot() };
}

export function findFilmCharacterState(asset: FilmAsset, stateId?: string): FilmCharacterState | undefined {
    if (!stateId) return undefined;
    return asset.character?.states.find((state) => state.id === stateId);
}

function slotSignature(slot: FilmImageSlot) {
    return { locked: slot.locked, active: slot.activeImageId || "", images: slot.images.map((image) => image.id) };
}

/** 资产母版签名：服装 / 道具被打磨后，引用它的角色签名与镜头媒体状态随之变化。 */
export function filmAssetSignature(asset: FilmAsset): string {
    return JSON.stringify({
        id: asset.id,
        updatedAt: asset.updatedAt,
        concept: slotSignature(asset.concept),
        views: asset.views ? slotSignature(asset.views) : undefined,
    });
}

export type FilmCharacterSignatureRefs = {
    costumes?: FilmAsset[];
    props?: FilmAsset[];
};

export function filmCharacterSignature(asset: FilmAsset, refs: FilmCharacterSignatureRefs = {}): string {
    const profile = ensureCharacterProfile(asset);
    const costumeIds = [...new Set(profile.states.map((state) => state.costumeId).filter((id): id is string => Boolean(id)))];
    const propIds = [...new Set([...profile.propIds, ...profile.states.flatMap((state) => state.heldPropIds)])];
    return JSON.stringify({
        name: asset.name,
        aliases: asset.aliases,
        description: asset.description,
        visualPrompt: asset.visualPrompt,
        parts: CHARACTER_PART_DEFINITIONS.map(({ key }) => ({
            key,
            prompt: profile.parts[key].prompt,
            notes: profile.parts[key].notes,
            ...slotSignature(profile.parts[key].slot),
        })),
        expressions: slotSignature(profile.expressions),
        master: slotSignature(profile.master),
        propIds: profile.propIds,
        states: profile.states.map((state) => ({ ...state, look: slotSignature(state.look) })),
        costumes: costumeIds.map((id) => refs.costumes?.find((costume) => costume.id === id)).map((costume) => costume ? filmAssetSignature(costume) : ""),
        props: propIds.map((id) => refs.props?.find((prop) => prop.id === id)).map((prop) => prop ? filmAssetSignature(prop) : ""),
    });
}

export function characterPartLabel(key: FilmCharacterPartKey) {
    return CHARACTER_PART_DEFINITIONS.find((part) => part.key === key)?.label || key;
}

/** 全身合成图版本池（含当前选定），角色卡三视图拼合时按池内顺序取图。 */
export function characterMasterImages(asset: FilmAsset): FilmImageRef[] {
    return asset.character?.master.images || [];
}

/** 全参考顺序：各部位当前选定图，面部优先。 */
export function characterReferenceImages(asset: FilmAsset, options: { includeMaster?: boolean; excludePart?: FilmCharacterPartKey } = {}): FilmImageRef[] {
    const profile = asset.character;
    const refs: FilmImageRef[] = [];
    if (profile) {
        for (const part of CHARACTER_PART_DEFINITIONS) {
            if (options.excludePart === part.key) continue;
            const image = activeSlotImage(profile.parts[part.key].slot);
            if (image) refs.push(image);
        }
    }
    const master = activeSlotImage(profile?.master);
    if (options.includeMaster && master) refs.unshift(master);
    return refs;
}

const CLOSEUP_RE = /CU|ECU|MCU|特写|近景|面部|脸/i;
const DETAIL_RE = /手部|拳头|武器|道具|饰品|剑|刀|枪|脚部|鞋子/i;

/** 身份包：角色卡当前版本优先，否则全身合成图当前版本；同时返回该槽位锁定状态。 */
export function characterIdentitySlot(asset: FilmAsset): { image?: FilmImageRef; locked: boolean } {
    const profile = ensureCharacterProfile(asset);
    const card = activeSlotImage(profile.card);
    if (card) return { image: card, locked: profile.card.locked };
    return { image: activeSlotImage(profile.master), locked: profile.master.locked };
}

export function characterPackageImage(asset: FilmAsset): FilmImageRef | undefined {
    return characterIdentitySlot(asset).image;
}

/** 景别驱动的细节参考：特写取面部，手部/道具戏取四肢。 */
export function characterDetailImage(asset: FilmAsset, shot: Pick<FilmShot, "shotType" | "description" | "dialogue">): FilmImageRef | undefined {
    const profile = asset.character;
    if (!profile) return undefined;
    const text = `${shot.shotType || ""} ${shot.description || ""} ${shot.dialogue || ""}`;
    if (CLOSEUP_RE.test(text)) return activeSlotImage(profile.parts.face.slot);
    if (DETAIL_RE.test(text)) return activeSlotImage(profile.parts.limbs.slot);
    return undefined;
}

/** 角色卡是否过期：与角色设定签名同源，文字或图片设定变化都需要重新拼图。 */
export function isCharacterCardStale(asset: FilmAsset, refs: FilmCharacterSignatureRefs = {}): boolean {
    const profile = asset.character;
    return Boolean(profile && activeSlotImage(profile.card) && profile.cardSignature && profile.cardSignature !== filmCharacterSignature(asset, refs));
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
    const done = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].slot.images.length > 0).length;
    const locked = CHARACTER_PART_DEFINITIONS.filter((part) => profile.parts[part.key].slot.locked).length;
    return {
        done,
        total,
        locked,
        master: profile.master.images.length,
        masterLocked: profile.master.locked,
        card: Boolean(activeSlotImage(profile.card)),
        expressions: profile.expressions.images.length,
    };
}
