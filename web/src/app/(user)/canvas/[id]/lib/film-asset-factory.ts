import { nanoid } from "nanoid";

import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { createEmptyCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { createFilmImageSlot } from "@/app/(user)/film/utils/film-image-slot";

export function createFilmAsset(kind: FilmAssetKind, index: number): FilmAsset {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        name: `${kind === "style" ? "风格圣经" : FILM_ASSET_KIND_LABELS[kind]} ${index}`,
        aliases: [],
        description: "",
        visualPrompt: "",
        status: "idle",
        concept: createFilmImageSlot(),
        ...(kind === "location" || kind === "prop" || kind === "costume" ? { views: createFilmImageSlot() } : {}),
        ...(kind === "character" ? { character: createEmptyCharacterProfile() } : {}),
        ...(kind === "location" ? { location: { variants: [] } } : {}),
        createdAt: now,
        updatedAt: now,
    };
}

export function createFilmStyleAsset(index = 1): FilmAsset {
    return createFilmAsset("style", index);
}

export function importFilmAsset(assets: FilmAsset[], asset: FilmAsset): FilmAsset[] {
    const now = new Date().toISOString();
    return [...assets, { ...structuredClone(asset), id: nanoid(), sourceLibraryAssetId: asset.id, createdAt: now, updatedAt: now }];
}
