import type { FilmStage } from "./types";

export const FILM_STAGES: Array<{ key: FilmStage; label: string }> = [
    { key: "script", label: "剧本" },
    { key: "cast", label: "角色与场景" },
    { key: "storyboard", label: "导演台" },
    { key: "edit", label: "剪辑" },
];

export function filmStageLabel(stage: FilmStage) {
    return FILM_STAGES.find((item) => item.key === stage)?.label || "剧本";
}