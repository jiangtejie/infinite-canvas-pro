export type FilmViewPreset = { key: string; label: string; prompt: string };

export const FILM_CHARACTER_VIEW_PRESETS: FilmViewPreset[] = [
    { key: "turnaround", label: "三视图", prompt: "角色三视图：正视图、侧视图、背视图并排，白色背景，统一光照" },
    { key: "expression", label: "表情设定", prompt: "角色表情设定：多种表情并排展示，白色背景" },
    { key: "proportion", label: "比例设定", prompt: "角色比例设定图：全身站姿，标注头身比例，白色背景" },
    { key: "action", label: "动作设定", prompt: "角色动作设定：多个动作姿态并排展示，白色背景" },
];

export const FILM_LOCATION_VIEW_PRESETS: FilmViewPreset[] = [
    { key: "quad", label: "四视图", prompt: "场景四视图：同一场景的正视、侧视、俯视、背视四个角度并排展示，保持结构、配色与光照一致" },
    { key: "panorama", label: "全景", prompt: "场景全景图：超宽幅全景，完整展示空间结构与远景" },
    { key: "detail", label: "细节特写", prompt: "场景细节特写：材质、陈设与关键道具的近景" },
];
