import type { CanvasNodeType } from "../types";

/** 画布语义色：状态与节点类型统一在这里，避免组件内散落十六进制值。 */
export const canvasStatusColors = {
    success: "#22c55e",
    loading: "#f59e0b",
    error: "#ef4444",
} as const;

export const canvasNodeTypeColors = {
    image: "#10b981",
    panorama: "#10b981",
    video: "#f97316",
    audio: "#a855f7",
    config: "#60a5fa",
    text: "#6366f1",
    source: "#ec4899",
    publish: "#14b8a6",
    group: "#a8a29e",
    director: "#fbbf24",
    comic: "#e11d48",
    comicPage: "#e11d48",
    filmScript: "#0ea5e9",
    filmScene: "#22c55e",
    filmShot: "#eab308",
    filmCharacter: "#f43f5e",
    filmLocation: "#14b8a6",
    filmProp: "#a855f7",
    filmStyle: "#f97316",
    filmBeat: "#ec4899",
} as const satisfies Record<CanvasNodeType, string>;
