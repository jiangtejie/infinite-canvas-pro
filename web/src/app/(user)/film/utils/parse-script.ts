import type { FilmEpisode, FilmShot } from "@/lib/film/types";
import { deriveFilmShotStatus } from "./film-status";

export function flattenFilmShots(episodes: FilmEpisode[]): FilmShot[] {
    return episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.shots));
}

export function countFilmScenes(episodes: FilmEpisode[]): number {
    return episodes.reduce((total, episode) => total + episode.scenes.length, 0);
}

export function countReadyShots(episodes: FilmEpisode[]): number {
    return flattenFilmShots(episodes).filter((shot) => {
        const status = deriveFilmShotStatus(shot);
        return status === "image_ready" || status === "video_ready";
    }).length;
}
