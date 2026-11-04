import { cn } from "@/lib/utils";

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

export const FILM_CAMERA_MOVEMENT_OPTIONS = ["固定", "缓慢横移", "缓慢推进", "微距推进", "手持轻晃", "跟拍", "环绕", "升降", "拉远", "摇镜"];

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

export function FilmShotTypeTag({ value, className }: { value?: string; className?: string }) {
    return <span className={cn("font-mono text-[9px] tracking-wide text-muted-foreground/60", className)}>{filmShotTypeLabel(value)}</span>;
}
