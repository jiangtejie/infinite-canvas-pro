export const FILM_SHOT_TYPE_OPTIONS = [
    { value: "ELS", label: "大远景" },
    { value: "LS", label: "远景" },
    { value: "WS", label: "全景" },
    { value: "MS", label: "中景" },
    { value: "MCU", label: "中近景" },
    { value: "CU", label: "特写" },
    { value: "ECU", label: "大特写" },
    { value: "OTS", label: "过肩" },
    { value: "POV", label: "主观" },
];

const SHOT_TYPE_LABELS = new Map(FILM_SHOT_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const SHOT_TYPE_ALIASES: Record<string, string> = {
    "大远景": "ELS",
    "远景": "LS",
    "全景": "WS",
    "中景": "MS",
    "中近景": "MCU",
    "近景": "MCU",
    "特写": "CU",
    "大特写": "ECU",
    "过肩": "OTS",
    "主观": "POV",
};

export const FILM_CAMERA_MOVEMENT_OPTIONS = ["固定", "缓慢横移", "缓慢推进", "推近", "微距推进", "手持轻晃", "跟拍", "环绕", "升降", "拉远", "缓慢拉远", "摇镜", "左移", "右移", "变焦"];

export const FILM_TRANSITION_OPTIONS = ["硬切", "叠化", "淡入", "淡出", "闪白", "闪黑", "划像", "匹配剪辑", "跳切"];

export const FILM_COMPOSITION_OPTIONS = ["三分法", "居中对称", "前景遮挡", "框中框", "低角度", "高角度", "俯拍", "仰拍", "过肩", "主观视角", "广角畸变", "长焦压缩", "浅景深", "深焦"];

export const FILM_LIGHTING_OPTIONS = ["自然光", "侧光", "侧逆光", "逆光", "顶光", "底光", "伦勃朗光", "蝴蝶光", "分割光", "柔光", "硬光", "黄金时刻", "蓝调时刻", "霓虹", "烛光", "月光", "低照度"];

export const FILM_COLOR_TONE_OPTIONS = ["冷调", "暖调", "低饱和", "高饱和", "青橙", "单色", "高对比", "低对比", "褪色", "霓虹", "赛博"];

export const FILM_LENS_OPTIONS = ["14mm 广角", "24mm 广角", "35mm", "50mm 标准", "85mm 人像", "135mm 长焦", "微距", "浅景深", "深焦", "广角畸变", "长焦压缩"];

export const FILM_PERFORMANCE_EMOTION_OPTIONS = ["克制", "平静", "警惕", "紧张", "压抑", "愤怒", "悲伤", "恐惧", "喜悦", "疲惫", "冷漠", "疯狂"];

export const FILM_BODY_LANGUAGE_OPTIONS = ["静止站立", "缓慢回头", "向前迈步", "后退", "转身离开", "伸手", "握拳", "低头", "抬头", "倚靠", "坐下", "奔跑"];

export const FILM_SOUND_AMBIENCE_OPTIONS = ["雨声", "风声", "街道底噪", "海浪声", "鸟鸣", "室内安静", "人群嘈杂", "机器轰鸣", "火焰燃烧", "夜晚虫鸣"];

export const FILM_SOUND_SFX_OPTIONS = ["脚步", "关门", "玻璃碎裂", "金属摩擦", "衣料摩擦", "呼吸", "心跳", "刀剑出鞘", "枪声", "汽车驶过"];

export const FILM_MUSIC_OPTIONS = ["无音乐", "低音持续", "钢琴", "弦乐", "鼓点", "电子氛围", "紧张渐强", "空灵合成器"];

export const FILM_DIALOGUE_TONE_OPTIONS = ["低声", "平静", "压怒", "气声", "喊叫", "耳语", "哽咽", "冷笑", "急促"];

export const FILM_COVERAGE_OPTIONS = ["建立", "反应", "细节", "关系", "过渡"];

export function filmShotTypeLabel(value?: string) {
    if (!value) return "景别未设置";
    return SHOT_TYPE_LABELS.get(value) || value;
}

export function filmShotTypeCodeFromLabel(label?: string) {
    const text = (label || "").trim();
    if (!text) return "";
    if (SHOT_TYPE_LABELS.has(text.toUpperCase())) return text.toUpperCase();
    return SHOT_TYPE_ALIASES[text] || text;
}
