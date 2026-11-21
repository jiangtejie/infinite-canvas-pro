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
