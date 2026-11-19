import type { ComicCharacter, ComicLibraryCharacter, ComicLibraryLocation, ComicLocation } from "../types";

/** 库条目在副本导入后被修改过。 */
export function comicLibraryEntryIsNewer(entry: { updatedAt?: string } | undefined, copy: { sourceLibraryUpdatedAt?: string }) {
    return Boolean(entry?.updatedAt && entry.updatedAt > (copy.sourceLibraryUpdatedAt || ""));
}

/** 用库条目覆盖项目副本：保留副本 id、创建信息与来源关系。 */
export function applyComicCharacterLibraryEntry(copy: ComicCharacter, entry: ComicLibraryCharacter): ComicCharacter {
    return {
        ...structuredClone(entry),
        id: copy.id,
        sourceLibraryCharacterId: copy.sourceLibraryCharacterId || entry.id,
        sourceLibraryUpdatedAt: entry.updatedAt || "",
    };
}

export function applyComicLocationLibraryEntry(copy: ComicLocation, entry: ComicLibraryLocation): ComicLocation {
    return {
        ...structuredClone(entry),
        id: copy.id,
        sourceLibraryLocationId: copy.sourceLibraryLocationId || entry.id,
        sourceLibraryUpdatedAt: entry.updatedAt || "",
    };
}
