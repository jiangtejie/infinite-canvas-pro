import type { FilmStylePresetId } from "../types";

export type FilmStylePreset = {
    id: FilmStylePresetId;
    label: string;
    prompt: string;
};

export const DEFAULT_FILM_STYLE: FilmStylePresetId = "custom";

export const FILM_STYLE_PRESETS: FilmStylePreset[] = [
    { id: "custom", label: "自定义", prompt: "" },
    { id: "jp-3d", label: "日式 3D 渲染", prompt: "日式 3D 渲染风格，柔和光影，细节精致，动漫质感" },
    { id: "cg", label: "CG 动画", prompt: "CG 动画风格，三维建模质感，光影干净，电影级构图" },
    { id: "dark-real", label: "暗黑写实", prompt: "暗黑写实风格，低饱和色调，强烈明暗对比，写实材质" },
    { id: "cinematic", label: "电影感", prompt: "电影感画面，浅景深，胶片颗粒，戏剧性布光" },
    { id: "anime2d", label: "2D 动画", prompt: "2D 动画风格，清晰线稿与平涂上色，日式动画质感" },
    { id: "guofeng", label: "国风", prompt: "中国风，水墨与工笔质感，东方古典审美" },
    { id: "cyberpunk", label: "赛博朋克", prompt: "赛博朋克风格，霓虹灯光，高对比冷色调，未来都市" },
    { id: "film", label: "胶片", prompt: "胶片摄影风格，颗粒质感，温暖色调，自然光" },
    { id: "pixel", label: "像素风", prompt: "像素艺术风格，复古游戏质感，清晰像素块" },
];

export function normalizeFilmStylePreset(value?: string): FilmStylePresetId {
    return FILM_STYLE_PRESETS.some((preset) => preset.id === value) ? (value as FilmStylePresetId) : DEFAULT_FILM_STYLE;
}

export function filmStyleLabel(value?: string) {
    const preset = FILM_STYLE_PRESETS.find((item) => item.id === value);
    return preset?.label || "自定义";
}

/** 把风格预设和自定义补充词合成一段注入提示词。 */
export function resolveFilmStyleText(project: { stylePreset?: string; visualStyle?: string }) {
    const preset = FILM_STYLE_PRESETS.find((item) => item.id === project.stylePreset);
    return [preset?.prompt, project.visualStyle?.trim()].filter(Boolean).join("；");
}
