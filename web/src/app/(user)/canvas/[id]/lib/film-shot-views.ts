import type { CanvasNodeData } from "../../types";
import type { FilmShotEntry } from "./film-studio-types";

export type FilmShotMediaSummary = {
    hasImage: boolean;
    hasVideo: boolean;
    generating: "image" | "video" | null;
    failed: boolean;
};

export function filmShotMediaSummary(shot: CanvasNodeData): FilmShotMediaSummary {
    const payload = shot.metadata?.filmShot;
    const taskKind = shot.metadata?.filmShotTaskKind;
    return {
        hasImage: Boolean(payload?.imageUrl || payload?.storageKey),
        hasVideo: Boolean(payload?.videoUrl || payload?.videoStorageKey),
        generating: shot.metadata?.status === "loading" && (taskKind === "image" || taskKind === "video") ? taskKind : null,
        failed: shot.metadata?.status === "error" && Boolean(payload?.lastFailedTaskKind || taskKind),
    };
}

export function filmShotViewStats(shots: FilmShotEntry[]) {
    return {
        shots: shots.length,
        scenes: new Set(shots.map((entry) => entry.sceneId)).size,
        duration: shots.reduce((sum, entry) => sum + Math.max(1, entry.shot.metadata?.filmShot?.duration ?? 0), 0),
        images: shots.filter((entry) => filmShotMediaSummary(entry.shot).hasImage).length,
        videos: shots.filter((entry) => filmShotMediaSummary(entry.shot).hasVideo).length,
    };
}

export function filmTimelineBlocks(shots: FilmShotEntry[], pixelsPerSecond = 56) {
    let start = 0;
    return shots.map((entry) => {
        const duration = Math.max(1, entry.shot.metadata?.filmShot?.duration ?? 0);
        const block = { entry, start, end: start + duration, width: duration * pixelsPerSecond };
        start += duration;
        return block;
    });
}

export type FilmShotMediaFilter = "all" | "none" | "image" | "video" | "generating" | "failed";

export type FilmShotFilters = {
    sceneId?: string;
    status?: FilmShotMediaFilter;
    query?: string;
};

export function filmShotMatchesFilter(entry: FilmShotEntry, filters: FilmShotFilters) {
    if (filters.sceneId && filters.sceneId !== "all" && entry.sceneId !== filters.sceneId) return false;
    const media = filmShotMediaSummary(entry.shot);
    const status = filters.status ?? "all";
    if (status === "none" && (media.hasImage || media.hasVideo || media.generating)) return false;
    if (status === "image" && !media.hasImage) return false;
    if (status === "video" && !media.hasVideo) return false;
    if (status === "generating" && !media.generating) return false;
    if (status === "failed" && !media.failed && entry.shot.metadata?.status !== "error") return false;
    const query = filters.query?.trim().toLowerCase();
    if (!query) return true;
    const payload = entry.shot.metadata?.filmShot;
    return [payload?.shotNo, payload?.description, payload?.dialogue, payload?.prompt, entry.sceneLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
}

export function filterFilmShotEntries(shots: FilmShotEntry[], filters: FilmShotFilters) {
    return shots.filter((entry) => filmShotMatchesFilter(entry, filters));
}

export function groupFilmShots<T>(items: T[], size: number) {
    const chunk = Math.max(1, Math.floor(size));
    const groups: T[][] = [];
    for (let index = 0; index < items.length; index += chunk) groups.push(items.slice(index, index + chunk));
    return groups;
}

