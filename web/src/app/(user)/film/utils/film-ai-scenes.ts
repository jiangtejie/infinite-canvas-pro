import { nanoid } from "nanoid";

import { errorMessage } from "@/lib/utils";
import type { FilmEpisode, FilmScene, FilmStructurePlan, FilmStructureScene } from "@/lib/film/types";
import type { AiConfig } from "@/stores/use-config-store";
import { requestFilmAiStoryboard, type FilmParseOptions } from "./film-ai-parse";

export function filmStructureSceneKey(scene: FilmStructureScene) {
    return `${scene.episodeTitle}::${scene.sceneName}`;
}

/** 单场分镜：只把该场正文与结构计划交给视觉代理，避免长剧本整篇重跑。 */
export async function requestFilmSceneStoryboard(config: AiConfig, scene: FilmStructureScene, scriptExcerpt: string, options: FilmParseOptions = {}): Promise<FilmScene> {
    const plan: FilmStructurePlan = { scriptHash: "", scenes: [scene], createdAt: new Date().toISOString() };
    const episodes = await requestFilmAiStoryboard(config, scriptExcerpt, { ...options, structurePlan: plan });
    const result = episodes[0]?.scenes[0];
    if (!result?.shots.length) throw new Error(`「${scene.sceneName || "本场"}」没有拆出镜头`);
    return {
        id: nanoid(),
        name: scene.sceneName || result.name,
        location: result.location || "",
        time: result.time || "",
        mood: result.mood || "",
        shots: result.shots.map((shot, index) => ({
            ...shot,
            shotNo: shot.shotNo || `${scene.sceneNo}-${String(index + 1).padStart(2, "0")}`,
        })),
    };
}

export type FilmSceneStoryboardRun = {
    scenes: Array<FilmScene | null>;
    errors: Record<string, string>;
    aborted: boolean;
};

/** 逐场分镜：有限并发，单场失败只记入 errors，不影响其他场。 */
export async function runFilmSceneStoryboards(
    plan: FilmStructurePlan,
    requestScene: (scene: FilmStructureScene, index: number) => Promise<FilmScene>,
    options: { concurrency?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<FilmSceneStoryboardRun> {
    const total = plan.scenes.length;
    const scenes: Array<FilmScene | null> = Array.from({ length: total }, () => null);
    const errors: Record<string, string> = {};
    let cursor = 0;
    let done = 0;
    let aborted = false;
    const worker = async () => {
        while (true) {
            if (options.signal?.aborted) {
                aborted = true;
                return;
            }
            const index = cursor++;
            if (index >= total) return;
            const scene = plan.scenes[index];
            try {
                scenes[index] = await requestScene(scene, index);
            } catch (error) {
                if (options.signal?.aborted) {
                    aborted = true;
                    return;
                }
                errors[filmStructureSceneKey(scene)] = errorMessage(error, "本场分镜失败");
            }
            done += 1;
            options.onProgress?.(done, total);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 3, total)) }, worker));
    return { scenes, errors, aborted };
}

/** 按结构计划顺序组装集/场；失败场次跳过，由 sceneErrors 提供重试入口。 */
export function episodesFromSceneStoryboards(plan: FilmStructurePlan, scenes: Array<FilmScene | null>): FilmEpisode[] {
    const episodes: FilmEpisode[] = [];
    const byTitle = new Map<string, FilmEpisode>();
    plan.scenes.forEach((structureScene, index) => {
        const scene = scenes[index];
        if (!scene) return;
        let episode = byTitle.get(structureScene.episodeTitle);
        if (!episode) {
            episode = { id: nanoid(), title: structureScene.episodeTitle, scenes: [] };
            episodes.push(episode);
            byTitle.set(structureScene.episodeTitle, episode);
        }
        episode.scenes.push(scene);
    });
    return episodes;
}

/** 单场重做：只替换目标场次，其他场次与人工修改保持不变；失败场次按计划顺序补位。 */
export function upsertFilmAnalysisScene(
    episodes: FilmEpisode[],
    plan: FilmStructurePlan,
    planScene: FilmStructureScene,
    scene: FilmScene,
): FilmEpisode[] {
    const next = episodes.map((episode) => ({ ...episode, scenes: [...episode.scenes] }));
    let episode = next.find((item) => item.title === planScene.episodeTitle);
    if (!episode) {
        episode = { id: nanoid(), title: planScene.episodeTitle, scenes: [] };
        next.push(episode);
    }
    const existingIndex = episode.scenes.findIndex((item) => item.name === planScene.sceneName);
    if (existingIndex >= 0) {
        episode.scenes[existingIndex] = { ...scene, id: episode.scenes[existingIndex].id };
        return next;
    }
    const planOrder = plan.scenes
        .filter((item) => item.episodeTitle === planScene.episodeTitle)
        .map((item) => item.sceneName);
    const targetIndex = planOrder.indexOf(planScene.sceneName);
    let insertAt = episode.scenes.length;
    for (let index = 0; index < episode.scenes.length; index++) {
        if (planOrder.indexOf(episode.scenes[index].name) > targetIndex) {
            insertAt = index;
            break;
        }
    }
    episode.scenes.splice(insertAt, 0, scene);
    return next;
}
