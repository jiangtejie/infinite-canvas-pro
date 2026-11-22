import type { FilmAsset, FilmCharacterProfile, FilmCharacterState, FilmImageRef, FilmImageSlot } from "@/lib/film/types";
import { activeSlotImage, createFilmImageSlot } from "./film-image-slot";

export function createEmptyCharacterProfile(): FilmCharacterProfile {
    return {
        board: createFilmImageSlot(),
        propIds: [],
        states: [],
    };
}

/** 读取角色档案时收敛到参考板模型；旧档案的 parts/表情/角色卡字段不再参与任何逻辑。 */
export function ensureCharacterProfile(asset: FilmAsset): FilmCharacterProfile {
    const character = asset.character;
    if (!character) return createEmptyCharacterProfile();
    return {
        board: character.board ?? createFilmImageSlot(),
        propIds: character.propIds || [],
        states: character.states || [],
    };
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
        board: slotSignature(profile.board),
        propIds,
        states: profile.states.map((state) => ({ ...state, look: slotSignature(state.look) })),
        costumes: costumeIds.map((id) => refs.costumes?.find((costume) => costume.id === id)).map((costume) => costume ? filmAssetSignature(costume) : ""),
        props: propIds.map((id) => refs.props?.find((prop) => prop.id === id)).map((prop) => prop ? filmAssetSignature(prop) : ""),
    });
}

/** 角色身份包 = 当前参考板版本及其锁定状态。 */
export function characterIdentitySlot(asset: FilmAsset): { image?: FilmImageRef; locked: boolean } {
    const profile = ensureCharacterProfile(asset);
    return { image: activeSlotImage(profile.board), locked: profile.board.locked };
}

export function characterPackageImage(asset: FilmAsset): FilmImageRef | undefined {
    return characterIdentitySlot(asset).image;
}
