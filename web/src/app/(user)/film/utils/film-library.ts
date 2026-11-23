import { nanoid } from "nanoid";

import type { FilmAsset } from "@/lib/film/types";

/** 找到项目副本对应的库条目：优先副本的来源 id，其次同 id 或来源指向副本 id 的条目。 */
export function findFilmLibraryEntry(library: FilmAsset[], asset: FilmAsset): FilmAsset | undefined {
    return (asset.sourceLibraryAssetId ? library.find((item) => item.id === asset.sourceLibraryAssetId) : undefined)
        || library.find((item) => item.id === asset.id || item.sourceLibraryAssetId === asset.id);
}

export function filmLibraryEntryIsNewer(entry: FilmAsset | undefined, asset: FilmAsset): boolean {
    return Boolean(entry && entry.updatedAt > asset.updatedAt);
}

/** 库条目覆盖项目副本：保留副本 id、来源与创建时间。 */
export function applyFilmLibraryEntry(asset: FilmAsset, entry: FilmAsset): FilmAsset {
    return {
        ...structuredClone(entry),
        id: asset.id,
        sourceLibraryAssetId: asset.sourceLibraryAssetId || entry.id,
        createdAt: asset.createdAt,
        updatedAt: new Date().toISOString(),
    };
}

export type FilmLibraryUsage = {
    projects: number;
    copies: number;
    bindings: number;
    projectTitles: string[];
};

export const EMPTY_FILM_LIBRARY_USAGE: FilmLibraryUsage = { projects: 0, copies: 0, bindings: 0, projectTitles: [] };

/** 存入母版库：命中同来源条目则原地更新并保留库 id，否则新建。 */
export function upsertFilmLibraryAsset(library: FilmAsset[], asset: FilmAsset, now = new Date().toISOString()): { library: FilmAsset[]; mode: "created" | "updated" } {
    const existing = (asset.sourceLibraryAssetId ? library.find((item) => item.id === asset.sourceLibraryAssetId) : undefined)
        || library.find((item) => item.id === asset.id || item.sourceLibraryAssetId === asset.id);
    if (existing) {
        const next: FilmAsset = {
            ...structuredClone(asset),
            id: existing.id,
            sourceLibraryAssetId: existing.sourceLibraryAssetId || asset.sourceLibraryAssetId || asset.id,
            createdAt: existing.createdAt,
            updatedAt: now,
        };
        return { library: library.map((item) => item.id === existing.id ? next : item), mode: "updated" };
    }
    const next: FilmAsset = {
        ...structuredClone(asset),
        id: nanoid(),
        sourceLibraryAssetId: asset.sourceLibraryAssetId || asset.id,
        createdAt: now,
        updatedAt: now,
    };
    return { library: [next, ...library], mode: "created" };
}
