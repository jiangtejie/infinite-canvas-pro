import { collectSourceMaterialNodes } from "../[id]/lib/canvas-source-remix";
import type { CanvasConnection, CanvasNodeData } from "../types";
import type { CanvasAgentAction } from "./canvas-agent-tools";

export type CanvasAgentConfirmation = {
    title: string;
    detail: string;
    okText: string;
    danger: boolean;
};

type CanvasAgentConfirmationContext = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    autoGenerateMedia: boolean;
    /** 未设置时保持原有行为：自动提交生成前确认。 */
    confirmMediaGeneration?: boolean;
    /** 平台渠道的预估算力点；0 或未提供时不展示。 */
    creditCost?: number;
};

const excerpt = (value: unknown, max = 60) => {
    const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    return text.length > max ? text.slice(0, max) + "…" : text;
};

const nodeTitle = (nodes: CanvasNodeData[], nodeId: string) => nodes.find((node) => node.id === nodeId)?.title || "未命名节点";

/**
 * 破坏性与高成本操作的确认文案；返回 null 表示可直接执行。
 * 媒体动作仅在自动提交生成时确认，仅创建节点不消耗生成成本。
 */
export function canvasAgentConfirmation(action: CanvasAgentAction, context: CanvasAgentConfirmationContext): CanvasAgentConfirmation | null {
    if (action.name === "delete_node") {
        return { title: `删除「${nodeTitle(context.nodes, String(action.arguments.nodeId || ""))}」？`, detail: "相关连线和任务记录将按现有逻辑清理", okText: "确认删除", danger: true };
    }
    if (action.name === "delete_connection") {
        const connectionId = String(action.arguments.connectionId || "");
        const connection = context.connections.find((item) => item.id === connectionId);
        const detail = connection ? `${nodeTitle(context.nodes, connection.fromNodeId)} → ${nodeTitle(context.nodes, connection.toNodeId)}` : "找不到这条连线，执行后将返回失败";
        return { title: "删除这条连线？", detail, okText: "确认删除", danger: true };
    }
    if (action.name === "plan_source_remix") {
        if (context.confirmMediaGeneration === false) return null;
        const imageCount = collectSourceMaterialNodes(context.nodes, String(action.arguments.sourceNodeId || "")).materialImages.length;
        return { title: "做整组复刻策划？", detail: `一次读入新文案与 ${imageCount} 张原图，产出整组共同设定与逐张配图提示词`, okText: "开始策划", danger: false };
    }
    // generate_remix_images 复用批量队列自带的确认（张数、模型、算力点），不再叠一层卡片。
    if (!context.autoGenerateMedia) return null;
    if (context.confirmMediaGeneration === false) return null;
    const prompt = excerpt(action.arguments.prompt);
    const promptLine = prompt ? `提示词：${prompt}` : "未提供提示词";
    const costLine = context.creditCost && context.creditCost > 0 ? ` · 预计 ${context.creditCost} 算力点` : "";
    if (action.name === "generate_image" || action.name === "edit_image") {
        const count = typeof action.arguments.count === "number" ? Math.max(1, Math.floor(action.arguments.count)) : 1;
        const size = typeof action.arguments.size === "string" && action.arguments.size ? ` · ${action.arguments.size}` : "";
        return { title: action.name === "edit_image" ? "提交图片编辑并生成？" : `提交 ${count} 张图片生成？`, detail: promptLine + size + costLine, okText: "提交生成", danger: false };
    }
    if (action.name === "generate_video") {
        const seconds = typeof action.arguments.seconds === "number" ? ` · ${action.arguments.seconds}s` : "";
        const size = typeof action.arguments.size === "string" && action.arguments.size ? ` · ${action.arguments.size}` : "";
        return { title: "提交视频生成？", detail: promptLine + seconds + size + costLine, okText: "提交生成", danger: false };
    }
    if (action.name === "generate_audio") {
        const voice = excerpt(action.arguments.voice, 24);
        return { title: "提交音频生成？", detail: promptLine + (voice ? ` · 音色 ${voice}` : "") + costLine, okText: "提交生成", danger: false };
    }
    return null;
}
