import type { FilmAsset, FilmAssetKind, FilmLocationVariant, FilmProject } from "@/lib/film/types";
import { characterIdentitySlot, findFilmCharacterState } from "./film-character";
import { activeSlotImage } from "./film-image-slot";

export type FilmBreakdownStatus = "ready" | "missing" | "unlocked" | "unbuilt";

export type FilmBreakdownRow = {
    key: string;
    kind: FilmAssetKind;
    name: string;
    assetId?: string;
    variantId?: string;
    status: FilmBreakdownStatus;
    cells: Record<string, FilmBreakdownStatus | "">;
};

export type FilmBreakdownTable = {
    episodes: string[];
    rows: FilmBreakdownRow[];
};

const KIND_ORDER: Record<FilmAssetKind, number> = { character: 0, location: 1, prop: 2, costume: 3, style: 4 };

function normalizeName(value: string) {
    return value.trim().toLowerCase().replace(/[\s·._-]+/g, "");
}

function matchAsset(assets: FilmAsset[], name: string) {
    const key = normalizeName(name);
    if (!key) return undefined;
    return assets.find((asset) => [asset.name, ...asset.aliases].some((item) => normalizeName(item) === key));
}

function matchLocationFromText(assets: FilmAsset[], text: string) {
    const source = normalizeName(text);
    return assets.find((asset) => normalizeName(asset.name) && source.includes(normalizeName(asset.name)));
}

function statusOf(kind: FilmAssetKind, asset: FilmAsset | undefined, variant?: FilmLocationVariant): FilmBreakdownStatus {
    if (!asset) return "unbuilt";
    if (kind === "character") {
        const identity = characterIdentitySlot(asset);
        return identity.image ? (identity.locked ? "ready" : "unlocked") : "missing";
    }
    if (kind === "location" && variant) {
        return activeSlotImage(variant.concept) ? (variant.concept.locked ? "ready" : "unlocked") : "missing";
    }
    return activeSlotImage(asset.concept) ? (asset.concept.locked ? "ready" : "unlocked") : "missing";
}

/** 按集 × 资产出场矩阵：数据源为语义分析场次和镜头实际绑定。 */
export function buildFilmBreakdownTable(project: FilmProject): FilmBreakdownTable {
    const analysis = project.scriptAnalysis;
    const characters = project.characters || [];
    const locations = project.locations || [];
    const props = project.props || [];
    const costumes = project.costumes || [];
    const episodes = [...new Set([
        ...(analysis?.scenes.map((scene) => scene.episode).filter(Boolean) || []),
        ...project.episodes.map((episode) => episode.title),
    ])];
    if (!episodes.length) episodes.push("项目");

    const rows = new Map<string, { row: Omit<FilmBreakdownRow, "cells">; appeared: Set<string> }>();
    const ensureRow = (key: string, kind: FilmAssetKind, name: string, asset: FilmAsset | undefined, variant?: FilmLocationVariant) => {
        if (rows.has(key)) return;
        rows.set(key, {
            row: { key, kind, name, assetId: asset?.id, variantId: variant?.id, status: statusOf(kind, asset, variant) },
            appeared: new Set(),
        });
    };
    const mark = (key: string, episode: string) => {
        rows.get(key)?.appeared.add(episode);
    };

    for (const scene of analysis?.scenes || []) {
        const episode = scene.episode || episodes[0];
        for (const name of scene.characters) {
            const asset = matchAsset(characters, name);
            const key = asset ? `character:${asset.id}` : `character:name:${normalizeName(name)}`;
            ensureRow(key, "character", asset?.name || name, asset);
            mark(key, episode);
        }
        for (const name of scene.props) {
            const asset = matchAsset(props, name);
            const key = asset ? `prop:${asset.id}` : `prop:name:${normalizeName(name)}`;
            ensureRow(key, "prop", asset?.name || name, asset);
            mark(key, episode);
        }
        for (const hint of scene.costumes || []) {
            const asset = matchAsset(costumes, hint.description);
            const key = asset ? `costume:${asset.id}` : `costume:hint:${normalizeName(hint.description)}`;
            ensureRow(key, "costume", asset?.name || `${hint.character} · ${hint.description}`, asset);
            mark(key, episode);
        }
        const location = matchLocationFromText(locations, scene.heading);
        if (location) {
            ensureRow(`location:${location.id}`, "location", location.name, location);
            mark(`location:${location.id}`, episode);
        }
    }

    for (const episode of project.episodes) {
        for (const scene of episode.scenes) {
            const locationName = scene.location?.trim();
            if (locationName) {
                const asset = matchAsset(locations, locationName);
                const key = asset ? `location:${asset.id}` : `location:name:${normalizeName(locationName)}`;
                ensureRow(key, "location", asset?.name || locationName, asset);
                mark(key, episode.title);
            }
            for (const shot of scene.shots) {
                for (const binding of shot.characterBindings) {
                    const asset = characters.find((item) => item.id === binding.characterId);
                    const key = asset ? `character:${asset.id}` : `character:deleted:${binding.characterId}`;
                    ensureRow(key, "character", asset?.name || binding.characterNameSnapshot, asset);
                    mark(key, episode.title);
                    const state = asset ? findFilmCharacterState(asset, binding.stateId) : undefined;
                    if (state?.costumeId) {
                        const costume = costumes.find((item) => item.id === state.costumeId);
                        const costumeKey = costume ? `costume:${costume.id}` : `costume:deleted:${state.costumeId}`;
                        ensureRow(costumeKey, "costume", costume?.name || `${asset?.name || binding.characterNameSnapshot} · ${state.name} 服装`, costume);
                        mark(costumeKey, episode.title);
                    }
                }
                for (const binding of shot.propBindings || []) {
                    const asset = props.find((item) => item.id === binding.propId);
                    const key = asset ? `prop:${asset.id}` : `prop:deleted:${binding.propId}`;
                    ensureRow(key, "prop", asset?.name || binding.propNameSnapshot, asset);
                    mark(key, episode.title);
                }
                if (shot.locationId) {
                    const asset = locations.find((item) => item.id === shot.locationId);
                    if (shot.locationVariantId) {
                        const variant = asset?.location?.variants.find((item) => item.id === shot.locationVariantId);
                        const key = variant ? `location-variant:${variant.id}` : `location-variant:deleted:${shot.locationVariantId}`;
                        ensureRow(key, "location", `${asset?.name || "场景"} · ${variant?.name || "变体"}`, asset, variant);
                        mark(key, episode.title);
                    } else {
                        const key = asset ? `location:${asset.id}` : `location:deleted:${shot.locationId}`;
                        ensureRow(key, "location", asset?.name || "场景", asset);
                        mark(key, episode.title);
                    }
                }
            }
        }
    }

    return {
        episodes,
        rows: [...rows.values()]
            .sort((left, right) => KIND_ORDER[left.row.kind] - KIND_ORDER[right.row.kind] || left.row.name.localeCompare(right.row.name))
            .map(({ row, appeared }) => ({
                ...row,
                cells: Object.fromEntries(episodes.map((episode) => [episode, appeared.has(episode) ? row.status : ""])) as FilmBreakdownRow["cells"],
            })),
    };
}
