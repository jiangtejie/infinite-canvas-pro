import type { FilmAssetKind, FilmProject, FilmShot } from "@/lib/film/types";
import { characterIdentitySlot, findFilmCharacterState } from "./film-character";
import { activeSlotImage } from "./film-image-slot";
import { flattenFilmShots } from "./parse-script";

export type FilmReadinessMissing = {
    key: string;
    kind: FilmAssetKind;
    assetId?: string;
    variantId?: string;
    name: string;
    reason: string;
    shotNos: string[];
};

export type FilmReadinessUnlocked = {
    key: string;
    kind: FilmAssetKind;
    assetId: string;
    variantId?: string;
    name: string;
    shotNos: string[];
};

export type FilmAssetReadinessReport = {
    checked: number;
    ready: number;
    missing: FilmReadinessMissing[];
    unlocked: FilmReadinessUnlocked[];
};

const KIND_ORDER: Record<FilmAssetKind, number> = { character: 0, location: 1, prop: 2, costume: 3, style: 4 };

/** 统计镜头实际绑定的资产是否具备 active 参考；未绑定资产不检查，未锁定只提示。 */
export function filmAssetReadiness(project: FilmProject, shots?: FilmShot[]): FilmAssetReadinessReport {
    const targets = shots ?? flattenFilmShots(project.episodes || []);
    const missing = new Map<string, FilmReadinessMissing>();
    const unlocked = new Map<string, FilmReadinessUnlocked>();
    const ready = new Set<string>();
    const checkedKeys = new Set<string>();

    const touchMissing = (key: string, base: Omit<FilmReadinessMissing, "shotNos">, shotNo: string) => {
        checkedKeys.add(key);
        const current = missing.get(key);
        if (current) {
            if (!current.shotNos.includes(shotNo)) current.shotNos.push(shotNo);
            return;
        }
        missing.set(key, { ...base, shotNos: [shotNo] });
    };
    const touchUnlocked = (key: string, base: Omit<FilmReadinessUnlocked, "shotNos">, shotNo: string) => {
        const current = unlocked.get(key);
        if (current) {
            if (!current.shotNos.includes(shotNo)) current.shotNos.push(shotNo);
            return;
        }
        unlocked.set(key, { ...base, shotNos: [shotNo] });
    };
    const check = (key: string, kind: FilmAssetKind, name: string, hasReference: boolean, locked: boolean, reason: string, shotNo: string, assetId?: string, variantId?: string) => {
        checkedKeys.add(key);
        if (!hasReference) {
            touchMissing(key, { key, kind, assetId, variantId, name, reason }, shotNo);
            return;
        }
        ready.add(key);
        if (!locked) touchUnlocked(key, { key, kind, assetId: assetId || "", variantId, name }, shotNo);
    };

    for (const shot of targets) {
        for (const binding of shot.characterBindings) {
            const asset = (project.characters || []).find((item) => item.id === binding.characterId);
            if (!asset) {
                touchMissing(`character:${binding.characterId}`, { key: `character:${binding.characterId}`, kind: "character", name: binding.characterNameSnapshot, reason: "角色已删除，无法取参考图" }, shot.shotNo);
                continue;
            }
            const identity = characterIdentitySlot(asset);
            check(`character:${asset.id}`, "character", asset.name, Boolean(identity.image), identity.locked, "缺少身份包参考（角色卡或全身合成图）", shot.shotNo, asset.id);

            const state = binding.stateId ? findFilmCharacterState(asset, binding.stateId) : undefined;
            const costume = state?.costumeId ? (project.costumes || []).find((item) => item.id === state.costumeId) : undefined;
            if (state?.costumeId) {
                if (!costume) {
                    touchMissing(`costume:${state.costumeId}`, { key: `costume:${state.costumeId}`, kind: "costume", name: `${asset.name} · ${state.name} 服装`, reason: "造型引用的服装已删除" }, shot.shotNo);
                } else {
                    check(`costume:${costume.id}`, "costume", costume.name, Boolean(activeSlotImage(costume.concept)), costume.concept.locked, "缺少服装概念图", shot.shotNo, costume.id);
                }
            }
        }

        for (const binding of shot.propBindings || []) {
            const prop = (project.props || []).find((item) => item.id === binding.propId);
            if (!prop) {
                touchMissing(`prop:${binding.propId}`, { key: `prop:${binding.propId}`, kind: "prop", name: binding.propNameSnapshot, reason: "道具已删除" }, shot.shotNo);
                continue;
            }
            check(`prop:${prop.id}`, "prop", prop.name, Boolean(activeSlotImage(prop.concept)), prop.concept.locked, "缺少道具概念图", shot.shotNo, prop.id);
        }

        const location = (project.locations || []).find((item) => item.id === shot.locationId);
        if (shot.locationId) {
            if (!location) {
                touchMissing(`location:${shot.locationId}`, { key: `location:${shot.locationId}`, kind: "location", name: "场景", reason: "场景已删除" }, shot.shotNo);
            } else if (shot.locationVariantId) {
                const variant = location.location?.variants.find((item) => item.id === shot.locationVariantId);
                if (!variant) {
                    touchMissing(`location-variant:${shot.locationVariantId}`, { key: `location-variant:${shot.locationVariantId}`, kind: "location", assetId: location.id, variantId: shot.locationVariantId, name: location.name, reason: "场景变体已删除" }, shot.shotNo);
                } else {
                    check(`location-variant:${variant.id}`, "location", `${location.name} · ${variant.name}`, Boolean(activeSlotImage(variant.concept)), variant.concept.locked, "缺少变体概念图", shot.shotNo, location.id, variant.id);
                }
            } else {
                check(`location:${location.id}`, "location", location.name, Boolean(activeSlotImage(location.concept)), location.concept.locked, "缺少场景概念图", shot.shotNo, location.id);
            }
        }
    }

    return {
        checked: checkedKeys.size,
        ready: ready.size,
        missing: [...missing.values()].sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || left.name.localeCompare(right.name)),
        unlocked: [...unlocked.values()].sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || left.name.localeCompare(right.name)),
    };
}
