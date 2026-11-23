import { nanoid } from "nanoid";

import type { FilmShotGroup } from "@/lib/film/types";
import { filmShotMediaSummary } from "./film-shot-views";
import type { FilmShotEntry } from "./film-studio-types";

export type FilmShotGroupSummary = FilmShotGroup & {
    shots: FilmShotEntry[];
    duration: number;
    imageCount: number;
    videoCount: number;
    missingCount: number;
    removedCount: number;
};

export function selectFilmShotGroups(groups: FilmShotGroup[] | undefined, shots: FilmShotEntry[]): FilmShotGroupSummary[] {
    return (groups || []).map((group) => {
        const ids = new Set(group.shotIds);
        const resolved = shots.filter((entry) => ids.has(entry.shot.id));
        let duration = 0;
        let imageCount = 0;
        let videoCount = 0;
        let missingCount = 0;
        for (const entry of resolved) {
            const payload = entry.shot.metadata?.filmShot;
            duration += Math.max(0.5, Number(payload?.duration) || 4);
            const media = filmShotMediaSummary(entry.shot);
            if (media.hasVideo) videoCount += 1;
            else if (media.hasImage) imageCount += 1;
            else missingCount += 1;
        }
        return {
            ...group,
            shots: resolved,
            duration,
            imageCount,
            videoCount,
            missingCount,
            removedCount: new Set(group.shotIds).size - resolved.length,
        };
    });
}

export function createFilmShotGroup(groups: FilmShotGroup[], title: string, shotIds: string[]): FilmShotGroup[] {
    const ids = [...new Set(shotIds.filter(Boolean))];
    if (!ids.length) return groups;
    const name = title.trim() || `镜头组 ${groups.length + 1}`;
    return [...groups, { id: nanoid(), title: name, shotIds: ids, createdAt: new Date().toISOString() }];
}

export function renameFilmShotGroup(groups: FilmShotGroup[], id: string, title: string) {
    const name = title.trim();
    if (!name) return groups;
    return groups.map((group) => group.id === id ? { ...group, title: name } : group);
}

export function removeFilmShotGroup(groups: FilmShotGroup[], id: string) {
    return groups.filter((group) => group.id !== id);
}
