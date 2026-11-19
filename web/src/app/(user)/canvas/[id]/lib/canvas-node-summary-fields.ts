import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { canvasNodeDisplayStatus, publishDraftText, sourceNodeText } from "./canvas-node-meta";
import { canvasRecoverableTaskId } from "./canvas-task-helpers";

/** Agent 工具结果与默认上下文共用的节点字段提取。 */
export function canvasNodeSummaryFields(node: CanvasNodeData, maxText = 4000) {
    const content = node.metadata?.content || "";
    const isText = node.type === CanvasNodeType.Text;
    const isSource = node.type === CanvasNodeType.Source;
    const isPublish = node.type === CanvasNodeType.Publish;
    const sourceImages = isSource
        ? (node.metadata?.sourceImages || [])
            .filter((image) => image.url)
            .map((image, index) => ({ index: index + 1, url: image.url, width: image.width, height: image.height }))
        : undefined;
    return {
        text: isText ? content.slice(0, maxText) : isSource ? sourceNodeText(node).slice(0, maxText) : isPublish ? publishDraftText(node).slice(0, maxText) : undefined,
        sourceImages,
        mediaUrl: !isText && !isSource && !isPublish && content && !content.startsWith("data:") ? content : undefined,
        hasMedia: !isText && !isPublish ? Boolean(content) : undefined,
        status: canvasNodeDisplayStatus(node) || "idle",
        prompt: node.metadata?.prompt?.slice(0, maxText),
        model: node.metadata?.model,
        size: node.metadata?.size,
        seconds: node.metadata?.seconds,
        generateAudio: node.metadata?.generateAudio,
        taskId: canvasRecoverableTaskId(node) || undefined,
        progress: node.metadata?.progress,
        error: isSource ? node.metadata?.sourceError : isPublish ? node.metadata?.publishError : node.metadata?.errorDetails,
        groupId: node.metadata?.groupId,
        remixRunId: node.metadata?.remixRunId,
        remixRole: node.metadata?.remixRole,
        remixTarget: node.metadata?.remixRun?.input.marketing?.location.name,
    };
}
