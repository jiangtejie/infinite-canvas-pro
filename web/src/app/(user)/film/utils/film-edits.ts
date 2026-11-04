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
                    cameraMovement: "",
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

export function moveFilmShot(episodes: FilmEpisode[], shotId: string, direction: -1 | 1): FilmEpisode[] {
    return episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => {
            const index = scene.shots.findIndex((shot) => shot.id === shotId);
            if (index < 0) return scene;
            const target = index + direction;
            if (target < 0 || target >= scene.shots.length) return scene;
            const shots = [...scene.shots];
            [shots[index], shots[target]] = [shots[target], shots[index]];
            return { ...scene, shots };
        }),
    }));
}

export function moveFilmShotToScene(episodes: FilmEpisode[], shotId: string, targetSceneId: string): FilmEpisode[] {
    const shot = episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.shots)).find((item) => item.id === shotId);
    if (!shot) return episodes;
    const without = episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => scene.id === targetSceneId ? scene : { ...scene, shots: scene.shots.filter((item) => item.id !== shotId) }),
    }));
    return without.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => scene.id === targetSceneId ? { ...scene, shots: [...scene.shots, shot] } : scene),
    }));
}

export function filmShotPosition(episodes: FilmEpisode[], shotId: string) {
    for (const [episodeIndex, episode] of episodes.entries()) {
        for (const [sceneIndex, scene] of episode.scenes.entries()) {
            const shotIndex = scene.shots.findIndex((shot) => shot.id === shotId);
            if (shotIndex >= 0) return { episodeIndex, sceneIndex, shotIndex, sceneId: scene.id, sceneShotCount: scene.shots.length };
        }
    }
    return null;
}

export function filmSceneOptions(episodes: FilmEpisode[]) {
    return episodes.flatMap((episode) => episode.scenes.map((scene) => ({ value: scene.id, label: `${episode.title} / ${scene.name}` })));
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
            views: [],
            createdAt: new Date().toISOString(),
        },
    ];
}

export function importFilmAsset(assets: FilmAsset[], asset: FilmAsset): FilmAsset[] {
    return [...assets, { ...asset, id: nanoid(), createdAt: new Date().toISOString() }];
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
