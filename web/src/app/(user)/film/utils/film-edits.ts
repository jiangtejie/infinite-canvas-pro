import { nanoid } from "nanoid";

import type { FilmAsset, FilmAssetKind, FilmEpisode, FilmProject, FilmScene, FilmShot } from "@/lib/film/types";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import { createEmptyCharacterProfile } from "./film-character";
import { createFilmImageSlot } from "./film-image-slot";

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
                    characterBindings: [], propBindings: [],
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

export function removeFilmScene(episodes: FilmEpisode[], sceneId: string): FilmEpisode[] {
    return episodes.map((episode) => ({ ...episode, scenes: episode.scenes.filter((scene) => scene.id !== sceneId) }));
}

export function createFilmAsset(kind: FilmAssetKind, index: number): FilmAsset {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        name: `${kind === "style" ? "风格圣经" : FILM_ASSET_KIND_LABELS[kind]} ${index}`,
        aliases: [],
        description: "",
        visualPrompt: "",
        status: "idle",
        concept: createFilmImageSlot(),
        ...(kind === "location" || kind === "prop" || kind === "costume" ? { views: createFilmImageSlot() } : {}),
        ...(kind === "character" ? { character: createEmptyCharacterProfile() } : {}),
        ...(kind === "location" ? { location: { variants: [] } } : {}),
        createdAt: now,
        updatedAt: now,
    };
}

export function addFilmAsset(assets: FilmAsset[], kind: FilmAssetKind): FilmAsset[] {
    return [...assets, createFilmAsset(kind, assets.length + 1)];
}

export function importFilmAsset(assets: FilmAsset[], asset: FilmAsset): FilmAsset[] {
    const now = new Date().toISOString();
    return [...assets, { ...structuredClone(asset), id: nanoid(), sourceLibraryAssetId: asset.id, createdAt: now, updatedAt: now }];
}

export function updateFilmAsset(assets: FilmAsset[], id: string, patch: Partial<FilmAsset>): FilmAsset[] {
    return assets.map((asset) => asset.id === id ? { ...asset, ...patch, updatedAt: new Date().toISOString() } : asset);
}

/** 按资产类别取项目内的资产列表；风格圣经是项目唯一资产。 */
export function filmAssetsOfKind(project: FilmProject, kind: FilmAssetKind): FilmAsset[] {
    if (kind === "character") return project.characters || [];
    if (kind === "location") return project.locations || [];
    if (kind === "prop") return project.props || [];
    if (kind === "costume") return project.costumes || [];
    return project.style ? [project.style] : [];
}

/** 按资产类别生成项目更新补丁，统一刷新资产 updatedAt。 */
export function patchFilmAssetProject(project: FilmProject, kind: FilmAssetKind, assetId: string, patch: Partial<FilmAsset>): Partial<FilmProject> {
    if (kind === "style") {
        if (project.style?.id !== assetId) return {};
        return { style: { ...project.style, ...patch, updatedAt: new Date().toISOString() } };
    }
    if (kind === "character") return { characters: updateFilmAsset(project.characters || [], assetId, patch) };
    if (kind === "location") return { locations: updateFilmAsset(project.locations || [], assetId, patch) };
    if (kind === "prop") return { props: updateFilmAsset(project.props || [], assetId, patch) };
    return { costumes: updateFilmAsset(project.costumes || [], assetId, patch) };
}

export function removeFilmAsset(assets: FilmAsset[], id: string): FilmAsset[] {
    return assets.filter((asset) => asset.id !== id);
}

function createScene(index: number): FilmScene {
    return { id: nanoid(), name: `场景 ${index}`, location: "", time: "", mood: "", shots: [] };
}
