import type { FilmGenerationReferenceRole } from "@/lib/film/types";

export const FILM_REFERENCE_ROLE_LABELS: Record<FilmGenerationReferenceRole, string> = {
    "character-package": "角色参考板",
    "character-state": "造型",
    costume: "服装",
    prop: "道具",
    location: "场景",
    "location-variant": "场景变体",
    style: "风格",
    "previous-shot": "上一镜",
    "anchor-shot": "锚定镜",
    storyboard: "分镜参考",
    "first-frame": "首帧",
    "last-frame": "尾帧",
};
