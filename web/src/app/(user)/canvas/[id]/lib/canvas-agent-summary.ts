import { isSeedance25Model, isSeedanceVideoModel } from "@/lib/seedance-video";
import { isCogVideoX3Model, isKlingV26Model, isKlingV3Model, modelKey } from "@/lib/video-model-capabilities";

import type { CanvasNodeData } from "../../types";
import { canvasNodeSummaryFields } from "./canvas-node-summary-fields";
import { canvasRecoverableTaskId } from "./canvas-task-helpers";

export function canvasAgentNodeSummary(node: CanvasNodeData) {
    return { id: node.id, type: node.type, title: node.title, ...canvasNodeSummaryFields(node) };
}

export function canvasAgentTaskSummary(node: CanvasNodeData) {
    const content = node.metadata?.content || "";
    return {
        type: node.type,
        status: node.metadata?.status || "idle",
        taskId: canvasRecoverableTaskId(node) || undefined,
        progress: node.metadata?.progress,
        error: node.metadata?.errorDetails,
        mediaUrl: content && !content.startsWith("data:") ? content : undefined,
    };
}

export function canvasAgentVideoDurationHint(modelName: string) {
    const key = modelKey(modelName);
    if (isCogVideoX3Model(key)) return { values: [5, 10], range: "仅 5 或 10 秒" };
    if (isSeedance25Model(key)) return { min: 4, max: 30, auto: -1, range: "智能（-1）或 4-30 秒，范围内任意整数秒数均可；videoSeconds 仅为默认值，可由本次 seconds 覆盖" };
    if (isSeedanceVideoModel(key)) return { values: [-1, 4, 5, 6, 8, 10, 12, 15], range: "智能或 4-15 秒" };
    if (isKlingV3Model(key)) return { values: [3, 15], range: "3-15 秒" };
    if (isKlingV26Model(key)) return { values: [5, 10], range: "仅 5 或 10 秒" };
    return { values: [6, 10, 12, 16, 20], range: "1-30 秒" };
}

export function validateCanvasAgentVideoSeconds(modelName: string, seconds: number) {
    if (!Number.isInteger(seconds)) return "视频总时长必须为整数秒";
    const key = modelKey(modelName);
    if (isCogVideoX3Model(key) && seconds !== 5 && seconds !== 10) return "当前 CogVideoX-3 模型仅支持 5 或 10 秒";
    const seedance = isSeedanceVideoModel(key);
    const seedanceMaxSeconds = isSeedance25Model(key) ? 30 : 15;
    if (seedance && seconds !== -1 && (seconds < 4 || seconds > seedanceMaxSeconds)) return `当前 Seedance 模型仅支持智能时长或 4-${seedanceMaxSeconds} 秒`;
    if (isKlingV3Model(key) && (seconds < 3 || seconds > 15)) return "当前 Kling 3 模型仅支持 3-15 秒";
    if (isKlingV26Model(key) && seconds !== 5 && seconds !== 10) return "当前 Kling 2.6 模型仅支持 5 或 10 秒";
    if (!seedance && !key.includes("kling") && (seconds < 1 || seconds > 30)) return "当前视频模型仅支持 1-30 秒";
    return "";
}
