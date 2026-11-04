export type FilmViewPreset = { key: string; label: string; prompt: string };

export const FILM_CHARACTER_VIEW_PRESETS: FilmViewPreset[] = [
    { key: "turnaround", label: "三视图", prompt: "角色三视图：正视图、侧视图、背视图并排，白色背景，统一光照" },
    { key: "expression", label: "表情设定", prompt: "角色表情设定：多种表情并排展示，白色背景" },
    { key: "proportion", label: "比例设定", prompt: "角色比例设定图：全身站姿，标注头身比例，白色背景" },
    { key: "action", label: "动作设定", prompt: "角色动作设定：多个动作姿态并排展示，白色背景" },
];
