import { CanvasNodeType, type CanvasNodeData, type CanvasNodeStatus } from "../../types";

/**
 * 素材源正文唯一口径：标题 + 正文 + 规范化 #话题，段间空行。
 * Agent 摘要、Agent 默认上下文、素材展开与关键词搜索共用，避免各处各拼一份导致口径分歧。
 */
export function sourceNodeText(node: CanvasNodeData) {
    const tags = (node.metadata?.sourceTags || [])
        .map((tag) => `#${tag.replace(/^#+/, "")}`)
        .filter((tag) => tag.length > 1)
        .join(" ");
    return [node.metadata?.sourceTitle, node.metadata?.sourceText, tags].map((part) => part?.trim()).filter(Boolean).join("\n\n");
}

/** 发布草稿正文唯一口径：标题 + 正文 + 规范化 #话题，段间空行。Agent 摘要、默认上下文与关键词搜索共用。 */
export function publishDraftText(node: CanvasNodeData) {
    const draft = node.metadata?.publishDraft;
    const tags = (draft?.tags || [])
        .map((tag) => `#${tag.replace(/^#+/, "")}`)
        .filter((tag) => tag.length > 1)
        .join(" ");
    return [draft?.title, draft?.body, tags].map((part) => part?.trim()).filter(Boolean).join("\n\n");
}

/** 画布节点展示状态：素材源/发布节点各有自己的状态字段，其余沿用节点任务状态。 */
export function canvasNodeDisplayStatus(node: CanvasNodeData): CanvasNodeStatus | undefined {
    if (node.type === CanvasNodeType.Source) return node.metadata?.sourceStatus;
    if (node.type === CanvasNodeType.Publish) {
        if (node.metadata?.publishStatus === "generating") return "loading";
        if (node.metadata?.publishStatus === "error") return "error";
        return node.metadata?.publishRecord ? "success" : "idle";
    }
    return node.metadata?.status;
}
