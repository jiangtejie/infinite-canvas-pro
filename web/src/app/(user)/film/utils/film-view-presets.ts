export type FilmViewPreset = { key: string; label: string; prompt: string };

export const FILM_LOCATION_VIEW_PRESETS: FilmViewPreset[] = [
    { key: "quad", label: "四视图", prompt: "场景四视图：同一场景的正视、侧视、俯视、背视四个角度并排展示，保持结构、配色与光照一致" },
    { key: "panorama", label: "全景", prompt: "场景全景图：超宽幅全景，完整展示空间结构与远景" },
    { key: "detail", label: "细节特写", prompt: "场景细节特写：材质、陈设与关键道具的近景" },
];
