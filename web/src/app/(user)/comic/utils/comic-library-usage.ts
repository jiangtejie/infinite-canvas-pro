import type { ComicProject } from "../types";

export type ComicLibraryUsage = {
    projects: number;
    copies: number;
    bindings: number;
    projectTitles: string[];
};

export const EMPTY_COMIC_LIBRARY_USAGE: ComicLibraryUsage = { projects: 0, copies: 0, bindings: 0, projectTitles: [] };

function ensure(index: Map<string, ComicLibraryUsage>, libraryId: string) {
    const current = index.get(libraryId);
    if (current) return current;
    const usage: ComicLibraryUsage = { projects: 0, copies: 0, bindings: 0, projectTitles: [] };
    index.set(libraryId, usage);
    return usage;
}

/** 一次扫描所有漫画项目，统计角色库条目的项目数、副本数与页格绑定数。 */
export function comicCharacterLibraryUsageIndex(projects: ComicProject[]) {
    const index = new Map<string, ComicLibraryUsage>();
    for (const project of projects) {
        const copies = new Map<string, Set<string>>();
        for (const character of project.characters || []) {
            if (!character.sourceLibraryCharacterId) continue;
            const ids = copies.get(character.sourceLibraryCharacterId) || new Set<string>();
            ids.add(character.id);
            copies.set(character.sourceLibraryCharacterId, ids);
        }
        if (!copies.size) continue;
        const copyToLibrary = new Map<string, string>();
        for (const [libraryId, ids] of copies) {
            const usage = ensure(index, libraryId);
            usage.projects += 1;
            usage.copies += ids.size;
            usage.projectTitles.push(project.title);
            ids.forEach((id) => copyToLibrary.set(id, libraryId));
        }
        for (const chapter of project.chapters) {
            for (const page of chapter.pages) {
                for (const panel of page.panels) {
                    for (const binding of panel.characterBindings) {
                        const libraryId = copyToLibrary.get(binding.characterId);
                        if (libraryId) ensure(index, libraryId).bindings += 1;
                    }
                }
            }
        }
    }
    return index;
}

/** 场景库条目按项目副本统计；漫画页格不绑定场景，只统计项目与副本。 */
export function comicLocationLibraryUsageIndex(projects: ComicProject[]) {
    const index = new Map<string, ComicLibraryUsage>();
    for (const project of projects) {
        const copies = new Map<string, Set<string>>();
        for (const location of project.locations || []) {
            if (!location.sourceLibraryLocationId) continue;
            const ids = copies.get(location.sourceLibraryLocationId) || new Set<string>();
            ids.add(location.id);
            copies.set(location.sourceLibraryLocationId, ids);
        }
        for (const [libraryId, ids] of copies) {
            const usage = ensure(index, libraryId);
            usage.projects += 1;
            usage.copies += ids.size;
            usage.projectTitles.push(project.title);
        }
    }
    return index;
}
