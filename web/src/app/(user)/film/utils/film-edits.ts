import { nanoid } from "nanoid";

import type { FilmAsset, FilmAssetKind, FilmEpisode, FilmScene, FilmShot } from "../types";

export function addFilmEpisode(episodes: FilmEpisode[]): FilmEpisode[] {
    return [
        ...episodes,
        { id: nanoid(), title: `第 ${episodes.length + 1} 集`, scenes: [] },
    ];
}

export function addFilmScene(episodes: FilmEpisode[], episodeId: string): FilmEpisode[] {
    return episodes.map((episode) => episode.id === episodeId
        ? { ...episode, scenes: [...episode.scenes, createScene(episode.scenes.length + 1)] }
        : episode);
}

export function addFilmShot(episodes: FilmEpisode[], sceneId: string): FilmEpisode[] {
    return episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => {
            if (scene.id !== sceneId) return scene;
            const shotIndex = scene.shots.length + 1;
            return {
                ...scene,
                shots: [...scene.shots, {
                    id: nanoid(),
                    shotNo: `${episodes.indexOf(episode) + 1}-${episode.scenes.indexOf(scene) + 1}-${String(shotIndex).padStart(2, "0")}`,
                    shotType: "",
                    duration: 5,
                    description: "",
                    dialogue: "",
                    audio: "",
                    prompt: "",
                    status: "idle",
                }],
            };
        }),
    }));
}

export function updateFilmShot(episodes: FilmEpisode[], shotId: string, patch: Partial<FilmShot>): FilmEpisode[] {
    return episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot),
        })),
    }));
}

export function removeFilmShot(episodes: FilmEpisode[], shotId: string): FilmEpisode[] {
    return episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => ({ ...scene, shots: scene.shots.filter((shot) => shot.id !== shotId) })),
    }));
}

export function updateFilmScene(episodes: FilmEpisode[], sceneId: string, patch: Partial<FilmScene>): FilmEpisode[] {
    return episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...patch } : scene),
    }));
}

export function removeFilmScene(episodes: FilmEpisode[], sceneId: string): FilmEpisode[] {
    return episodes.map((episode) => ({ ...episode, scenes: episode.scenes.filter((scene) => scene.id !== sceneId) }));
}

export function addFilmAsset(assets: FilmAsset[], kind: FilmAssetKind): FilmAsset[] {
    return [
        ...assets,
        {
            id: nanoid(),
            name: kind === "character" ? `角色 ${assets.length + 1}` : `场景 ${assets.length + 1}`,
            description: "",
            visualPrompt: "",
            status: "idle",
            createdAt: new Date().toISOString(),
        },
    ];
}

export function updateFilmAsset(assets: FilmAsset[], id: string, patch: Partial<FilmAsset>): FilmAsset[] {
    return assets.map((asset) => asset.id === id ? { ...asset, ...patch } : asset);
}

export function removeFilmAsset(assets: FilmAsset[], id: string): FilmAsset[] {
    return assets.filter((asset) => asset.id !== id);
}

function createScene(index: number): FilmScene {
    return { id: nanoid(), name: `场景 ${index}`, location: "", time: "", mood: "", shots: [] };
}
