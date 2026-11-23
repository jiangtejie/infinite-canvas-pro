import type { FilmStructurePlan } from "@/lib/film/types";

/** 把结构计划压缩为 AI 检查/拆镜可读的场次上下文。 */
export function structurePlanPromptContext(plan?: FilmStructurePlan) {
    if (!plan?.scenes.length) return "";
    return JSON.stringify(plan.scenes.map((scene) => ({
        episode: scene.episodeTitle,
        scene: scene.sceneName,
        purpose: scene.purpose,
        beats: scene.beats.map((beat) => beat.summary),
        coverage: scene.coverage,
        duration: scene.estimatedDuration,
    })));
}
