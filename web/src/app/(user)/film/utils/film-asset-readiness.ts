import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import type { FilmGraphReviewInput, FilmGraphReviewShot } from "@/app/(user)/canvas/[id]/lib/film-review-input";
import { characterIdentitySlot, findFilmCharacterState } from "./film-character";
import { activeSlotImage } from "./film-image-slot";

export type FilmReadinessMissing = {
    key: string;
    kind: FilmAssetKind;
    assetId?: string;
    variantId?: string;
    contextNodeId?: string;
    name: string;
    reason: string;
    shotIds: string[];
    shotNos: string[];
};

export type FilmReadinessUnlocked = {
    key: string;
    kind: FilmAssetKind;
    assetId: string;
    variantId?: string;
    name: string;
    shotIds: string[];
    shotNos: string[];
};

export type FilmAssetReadinessReport = {
    checked: number;
    ready: number;
    missing: FilmReadinessMissing[];
    unlocked: FilmReadinessUnlocked[];
};

const KIND_ORDER: Record<FilmAssetKind, number> = { character: 0, location: 1, prop: 2, costume: 3, style: 4 };

/** 统计镜头实际引用的资产是否具备 active 参考；未引用资产不检查，未锁定只提示。 */
export function filmAssetReadiness(input: FilmGraphReviewInput, shotIds: string[]): FilmAssetReadinessReport {
    const targets = input.shots.filter((shot) => shotIds.includes(shot.id));
    const assetFor = (shot: FilmGraphReviewShot, role: "character" | "location" | "prop", id: string): FilmAsset | undefined =>
        shot.contexts.find((context) => context.role === role && context.asset?.id === id)?.asset;
    const costumes = input.assets.costumes;
    const missing = new Map<string, FilmReadinessMissing>();
    const unlocked = new Map<string, FilmReadinessUnlocked>();
    const ready = new Set<string>();
    const checkedKeys = new Set<string>();

    const touchMissing = (key: string, base: Omit<FilmReadinessMissing, "shotIds" | "shotNos">, shotId: string, shotNo: string) => {
        checkedKeys.add(key);
        const current = missing.get(key);
        if (current) {
            if (!current.shotIds.includes(shotId)) current.shotIds.push(shotId);
            if (!current.shotNos.includes(shotNo)) current.shotNos.push(shotNo);
            return;
        }
        missing.set(key, { ...base, shotIds: [shotId], shotNos: [shotNo] });
    };
    const touchUnlocked = (key: string, base: Omit<FilmReadinessUnlocked, "shotIds" | "shotNos">, shotId: string, shotNo: string) => {
        const current = unlocked.get(key);
        if (current) {
            if (!current.shotIds.includes(shotId)) current.shotIds.push(shotId);
            if (!current.shotNos.includes(shotNo)) current.shotNos.push(shotNo);
            return;
        }
        unlocked.set(key, { ...base, shotIds: [shotId], shotNos: [shotNo] });
    };
    const check = (key: string, kind: FilmAssetKind, name: string, hasReference: boolean, locked: boolean, reason: string, shotId: string, shotNo: string, assetId?: string, variantId?: string) => {
        checkedKeys.add(key);
        if (!hasReference) {
            touchMissing(key, { key, kind, assetId, variantId, name, reason }, shotId, shotNo);
            return;
        }
        ready.add(key);
        if (!locked) touchUnlocked(key, { key, kind, assetId: assetId || "", variantId, name }, shotId, shotNo);
    };

    for (const shot of targets) {
        for (const context of shot.contexts) {
            const assetId = context.asset?.id || context.nodeId;
            if (context.role === "character") {
                const asset = assetFor(shot, "character", assetId);
                if (!asset) {
                    touchMissing(`character:${assetId}`, { key: `character:${assetId}`, kind: "character", name: context.name, reason: "角色已删除，无法取参考图" }, shot.id, shot.shot.shotNo);
                    continue;
                }
                const identity = characterIdentitySlot(asset);
                check(`character:${asset.id}`, "character", asset.name, Boolean(identity.image), identity.locked, "缺少角色参考板", shot.id, shot.shot.shotNo, asset.id);
                const state = context.stateId ? findFilmCharacterState(asset, context.stateId) : undefined;
                const costume = state?.costumeId ? costumes.find((item) => item.id === state.costumeId) : undefined;
                if (state?.costumeId) {
                    if (!costume) {
                        touchMissing(`costume:${state.costumeId}`, { key: `costume:${state.costumeId}`, kind: "costume", assetId: state.costumeId, name: `${asset.name} · ${state.name} 服装`, reason: "造型引用的服装已删除" }, shot.id, shot.shot.shotNo);
                    } else {
                        check(`costume:${costume.id}`, "costume", costume.name, Boolean(activeSlotImage(costume.concept)), costume.concept.locked, "缺少服装概念图", shot.id, shot.shot.shotNo, costume.id);
                    }
                }
            } else if (context.role === "prop") {
                const prop = assetFor(shot, "prop", assetId);
                if (!prop) {
                    touchMissing(`prop:${assetId}`, { key: `prop:${assetId}`, kind: "prop", name: context.name, reason: "道具已删除" }, shot.id, shot.shot.shotNo);
                    continue;
                }
                check(`prop:${prop.id}`, "prop", prop.name, Boolean(activeSlotImage(prop.concept)), prop.concept.locked, "缺少道具概念图", shot.id, shot.shot.shotNo, prop.id);
            } else if (context.role === "location") {
                const location = assetFor(shot, "location", assetId);
                if (!location) {
                    touchMissing(`location:${assetId}`, { key: `location:${assetId}`, kind: "location", name: context.name, reason: "场景已删除" }, shot.id, shot.shot.shotNo);
                    continue;
                }
                if (context.variantId) {
                    const variant = location.location?.variants.find((item) => item.id === context.variantId);
                    if (!variant) {
                        touchMissing(`location-variant:${context.variantId}`, { key: `location-variant:${context.variantId}`, kind: "location", assetId: location.id, variantId: context.variantId, name: location.name, reason: "场景变体已删除" }, shot.id, shot.shot.shotNo);
                    } else {
                        check(`location-variant:${variant.id}`, "location", `${location.name} · ${variant.name}`, Boolean(activeSlotImage(variant.concept)), variant.concept.locked, "缺少变体概念图", shot.id, shot.shot.shotNo, location.id, variant.id);
                    }
                } else {
                    check(`location:${location.id}`, "location", location.name, Boolean(activeSlotImage(location.concept)), location.concept.locked, "缺少场景概念图", shot.id, shot.shot.shotNo, location.id);
                }
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
