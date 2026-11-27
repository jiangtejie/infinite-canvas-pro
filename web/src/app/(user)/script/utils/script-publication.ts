import type { ScriptProjectDocument, ScriptVersion } from "../types";
import { scriptDataHash } from "./script-canonical";

export function publicationSourceHash(document: ScriptProjectDocument, episodeIds: string[]): string | null {
    const selectedIds = [...new Set(episodeIds)];
    if (!selectedIds.length) return null;
    const selected = selectedIds.map((id) => document.episodes.find((episode) => episode.id === id));
    if (selected.some((episode) => !episode)) return null;

    const hasProjectLock = Boolean(document.lockedVersionId || document.lockedVersionHash);
    if (hasProjectLock) {
        return document.lockedVersionId && document.lockedVersionHash ? document.lockedVersionHash : null;
    }
    if (selected.some((episode) => !episode?.lockedVersionId || !episode?.lockedVersionHash)) return null;
    return scriptDataHash(
        selected
            .map((episode) => `${episode!.id}:${episode!.lockedVersionHash}`)
            .sort()
            .join("\n"),
    );
}

export function isPublicationStale(document: ScriptProjectDocument, episodeIds: string[], sourceHash: string): boolean {
    return publicationSourceHash(document, episodeIds) !== sourceHash;
}

export function resolvePublicationVersions(
    document: ScriptProjectDocument,
    versions: ScriptVersion[],
    episodeIds: string[],
): ScriptVersion[] {
    const selectedIds = [...new Set(episodeIds)];
    if (!selectedIds.length) return [];

    const hasProjectLock = Boolean(document.lockedVersionId || document.lockedVersionHash);
    if (hasProjectLock) {
        const version = versions.find((item) => item.id === document.lockedVersionId);
        if (!version
            || version.projectId !== document.id
            || version.scope !== "project"
            || version.kind !== "locked"
            || version.hash !== document.lockedVersionHash
            || selectedIds.some((id) => !version.data.episodes.some((episode) => episode.id === id))) {
            return [];
        }
        return selectedIds.map(() => version);
    }

    const resolved: ScriptVersion[] = [];
    for (const episodeId of selectedIds) {
        const episode = document.episodes.find((item) => item.id === episodeId);
        const version = versions.find((item) => item.id === episode?.lockedVersionId);
        if (!episode?.lockedVersionId
            || !episode.lockedVersionHash
            || !version
            || version.projectId !== document.id
            || version.scope !== "episode"
            || version.episodeId !== episodeId
            || version.kind !== "locked"
            || version.hash !== episode.lockedVersionHash
            || !version.data.episodes.some((item) => item.id === episodeId)) {
            return [];
        }
        resolved.push(version);
    }
    return resolved;
}
