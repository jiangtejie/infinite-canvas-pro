/** 画布语义色：状态与节点类型统一在这里，避免组件内散落十六进制值。 */
export const canvasStatusColors = {
    success: "#22c55e",
    loading: "#f59e0b",
    error: "#ef4444",
} as const;

export const canvasNodeTypeColors = {
    image: "#10b981",
    video: "#f97316",
    audio: "#a855f7",
    config: "#60a5fa",
} as const;
