import { nanoid } from "nanoid";

import type { FilmAsset, FilmAssetKind, FilmProject } from "@/lib/film/types";
import { filmAssetsOfKind } from "./film-edits";

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

/** 一次扫描所有项目，按库条目汇总副本数与镜头 / 造型引用数。 */
export function filmLibraryUsageIndex(projects: FilmProject[], kind: FilmAssetKind): Map<string, FilmLibraryUsage> {
    const index = new Map<string, FilmLibraryUsage>();
    const ensure = (libraryId: string) => {
        const current = index.get(libraryId);
        if (current) return current;
        const created: FilmLibraryUsage = { projects: 0, copies: 0, bindings: 0, projectTitles: [] };
        index.set(libraryId, created);
        return created;
    };
    for (const project of projects) {
        const copies = new Map<string, Set<string>>();
        for (const asset of filmAssetsOfKind(project, kind)) {
            if (!asset.sourceLibraryAssetId) continue;
            const ids = copies.get(asset.sourceLibraryAssetId) || new Set<string>();
            ids.add(asset.id);
            copies.set(asset.sourceLibraryAssetId, ids);
        }
        if (!copies.size) continue;
        const copyToLibrary = new Map<string, string>();
        for (const [libraryId, ids] of copies) {
            const usage = ensure(libraryId);
            usage.projects += 1;
            usage.copies += ids.size;
            usage.projectTitles.push(project.title);
            ids.forEach((id) => copyToLibrary.set(id, libraryId));
        }
        if (kind === "style") continue;
        const add = (libraryId: string) => {
            const usage = index.get(libraryId);
            if (usage) usage.bindings += 1;
        };
        if (kind === "costume") {
            for (const character of project.characters || []) {
                for (const state of character.character?.states || []) {
                    const libraryId = state.costumeId ? copyToLibrary.get(state.costumeId) : undefined;
                    if (libraryId) add(libraryId);
                }
            }
            continue;
        }
        for (const episode of project.episodes || []) {
            for (const scene of episode.scenes) {
                for (const shot of scene.shots) {
                    if (kind === "character") {
                        for (const binding of shot.characterBindings) {
                            const libraryId = copyToLibrary.get(binding.characterId);
                            if (libraryId) add(libraryId);
                        }
                    } else if (kind === "location") {
                        const libraryId = shot.locationId ? copyToLibrary.get(shot.locationId) : undefined;
                        if (libraryId) add(libraryId);
                    } else if (kind === "prop") {
                        for (const binding of shot.propBindings || []) {
                            const libraryId = copyToLibrary.get(binding.propId);
                            if (libraryId) add(libraryId);
                        }
                    }
                }
            }
        }
    }
    return index;
}

/** 单个库条目的使用统计。 */
export function filmLibraryUsage(projects: FilmProject[], libraryId: string, kind: FilmAssetKind): FilmLibraryUsage {
    return filmLibraryUsageIndex(projects, kind).get(libraryId) || EMPTY_FILM_LIBRARY_USAGE;
}

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
