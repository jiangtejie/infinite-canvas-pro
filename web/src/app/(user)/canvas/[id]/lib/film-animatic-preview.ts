import type { FilmShotEntry } from "./film-studio-types";

export type FilmPreviewMedia = "video" | "image" | "none";

export type FilmPreviewClip = {
    shotId: string;
    index: number;
    shotNo: string;
    sceneId: string;
    sceneLabel: string;
    episodeTitle: string;
    description: string;
    dialogue: string;
    media: FilmPreviewMedia;
    imageUrl?: string;
    imageStorageKey?: string;
    videoUrl?: string;
    videoStorageKey?: string;
    duration: number;
    start: number;
    end: number;
};

export type FilmPreviewScene = {
    sceneId: string;
    label: string;
    start: number;
    end: number;
};

export type FilmPreviewTimeline = {
    clips: FilmPreviewClip[];
    scenes: FilmPreviewScene[];
    totalDuration: number;
    videoCount: number;
    imageCount: number;
    missingCount: number;
};

export const EMPTY_FILM_PREVIEW_TIMELINE: FilmPreviewTimeline = {
    clips: [],
    scenes: [],
    totalDuration: 0,
    videoCount: 0,
    imageCount: 0,
    missingCount: 0,
};

export function selectFilmPreviewEntries(shots: FilmShotEntry[], shotIds?: string[] | null): FilmShotEntry[] {
    if (!shotIds?.length) return shots;
    const selected = new Set(shotIds);
    return shots.filter((entry) => selected.has(entry.shot.id));
}

export function buildFilmPreviewTimeline(shots: FilmShotEntry[]): FilmPreviewTimeline {
    const clips: FilmPreviewClip[] = [];
    const scenes: FilmPreviewScene[] = [];
    let cursor = 0;
    for (const entry of shots) {
        const payload = entry.shot.metadata?.filmShot;
        const duration = Math.max(0.5, Number(payload?.duration) || 4);
        const imageUrl = payload?.imageUrl || payload?.imageVersions?.at(-1)?.url;
        const imageStorageKey = payload?.storageKey || payload?.imageVersions?.at(-1)?.storageKey;
        const videoUrl = payload?.videoUrl || payload?.videoVersions?.at(-1)?.url;
        const videoStorageKey = payload?.videoStorageKey || payload?.videoVersions?.at(-1)?.storageKey;
        const media: FilmPreviewMedia = videoUrl || videoStorageKey
            ? "video"
            : imageUrl || imageStorageKey
                ? "image"
                : "none";
        const clip: FilmPreviewClip = {
            shotId: entry.shot.id,
            index: clips.length,
            shotNo: payload?.shotNo || entry.shot.title || `镜头 ${clips.length + 1}`,
            sceneId: entry.sceneId,
            sceneLabel: entry.sceneLabel,
            episodeTitle: entry.episodeTitle,
            description: payload?.description || "",
            dialogue: payload?.dialogue || "",
            media,
            imageUrl,
            imageStorageKey,
            videoUrl,
            videoStorageKey,
            duration,
            start: cursor,
            end: cursor + duration,
        };
        clips.push(clip);
        const lastScene = scenes[scenes.length - 1];
        if (lastScene && lastScene.sceneId === entry.sceneId) lastScene.end = clip.end;
        else scenes.push({ sceneId: entry.sceneId, label: entry.sceneLabel, start: clip.start, end: clip.end });
        cursor = clip.end;
    }
    return {
        clips,
        scenes,
        totalDuration: cursor,
        videoCount: clips.filter((clip) => clip.media === "video").length,
        imageCount: clips.filter((clip) => clip.media === "image").length,
        missingCount: clips.filter((clip) => clip.media === "none").length,
    };
}

export function filmPreviewClipAt(timeline: FilmPreviewTimeline, seconds: number): FilmPreviewClip | null {
    if (!timeline.clips.length) return null;
    const time = Math.max(0, Math.min(timeline.totalDuration, seconds));
    return timeline.clips.find((clip) => time >= clip.start && time < clip.end)
        ?? timeline.clips[timeline.clips.length - 1];
}

export function formatFilmPreviewTime(seconds: number) {
    const value = Math.max(0, Math.floor(seconds));
    const minute = Math.floor(value / 60);
    const second = value % 60;
    return `${minute}:${String(second).padStart(2, "0")}`;
}
