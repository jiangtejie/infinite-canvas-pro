import { isCogVideoX3Model, modelKey } from "@/lib/video-model-capabilities";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { canvasVideoTaskId } from "./canvas-task-helpers";

export function canvasAgentNodeSummary(node: CanvasNodeData) {
    const content = node.metadata?.content || "";
    const isText = node.type === CanvasNodeType.Text;
    const isSource = node.type === CanvasNodeType.Source;
    const sourceText = (node.metadata?.sourceText || "").trim();
    const sourceTags = (node.metadata?.sourceTags || []).map((tag) => "#" + tag).join(" ");
    const text = isText ? content.slice(0, 4000) : isSource ? (sourceText + (sourceTags ? "\n" + sourceTags : "")).slice(0, 4000) : undefined;
    return {
        id: node.id,
        type: node.type,
        title: node.title,
        text,
        mediaUrl: !isText && !isSource && content && !content.startsWith("data:") ? content : undefined,
        hasMedia: !isText ? Boolean(content) : undefined,
        status: isSource ? node.metadata?.sourceStatus || "idle" : node.metadata?.status || "idle",
        prompt: node.metadata?.prompt?.slice(0, 4000),
        model: node.metadata?.model,
        size: node.metadata?.size,
        seconds: node.metadata?.seconds,
        generateAudio: node.metadata?.generateAudio,
        taskId: canvasRecoverableTaskId(node) || undefined,
        progress: node.metadata?.progress,
        error: isSource ? node.metadata?.sourceError : node.metadata?.errorDetails,
        groupId: node.metadata?.groupId,
    };
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
    if (key.includes("seedance-2-5") || key.includes("seedance2-5")) return { min: 4, max: 30, auto: -1, range: "智能（-1）或 4-30 秒，范围内任意整数秒数均可；videoSeconds 仅为默认值，可由本次 seconds 覆盖" };
    if (key.includes("seedance")) return { values: [-1, 4, 5, 6, 8, 10, 12, 15], range: "智能或 4-15 秒" };
    if (isCanvasAgentKlingV3(key)) return { values: [3, 15], range: "3-15 秒" };
    if (isCanvasAgentKlingV26(key)) return { values: [5, 10], range: "仅 5 或 10 秒" };
    return { values: [6, 10, 12, 16, 20], range: "1-30 秒" };
}

export function validateCanvasAgentVideoSeconds(modelName: string, seconds: number) {
    if (!Number.isInteger(seconds)) return "视频总时长必须为整数秒";
    const key = modelKey(modelName);
    if (isCogVideoX3Model(key) && seconds !== 5 && seconds !== 10) return "当前 CogVideoX-3 模型仅支持 5 或 10 秒";
    const seedanceMaxSeconds = (key.includes("seedance-2-5") || key.includes("seedance2-5")) ? 30 : 15;
    if (key.includes("seedance") && seconds !== -1 && (seconds < 4 || seconds > seedanceMaxSeconds)) return `当前 Seedance 模型仅支持智能时长或 4-${seedanceMaxSeconds} 秒`;
    if (isCanvasAgentKlingV3(key) && (seconds < 3 || seconds > 15)) return "当前 Kling 3 模型仅支持 3-15 秒";
    if (isCanvasAgentKlingV26(key) && seconds !== 5 && seconds !== 10) return "当前 Kling 2.6 模型仅支持 5 或 10 秒";
    if (!key.includes("seedance") && !key.includes("kling") && (seconds < 1 || seconds > 30)) return "当前视频模型仅支持 1-30 秒";
    return "";
}

function isCanvasAgentKlingV3(key: string) {
    return key.includes("kling-v3") || key.includes("kling-3-0");
}

function isCanvasAgentKlingV26(key: string) {
    return key.includes("kling-v2-6") || key.includes("kling-2-6");
}

export function canvasRecoverableTaskId(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Video) return canvasVideoTaskId(node.metadata);
    if (isCanvasImageNodeType(node.type)) return node.metadata?.imageTaskId || "";
    if (node.type === CanvasNodeType.Audio) return node.metadata?.audioTaskId || "";
    return "";
}
