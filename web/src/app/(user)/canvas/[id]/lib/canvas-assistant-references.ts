import type { CanvasAssistantSession, CanvasNodeData } from "../../types";
import { assistantReferenceContentFromNode } from "../../utils/canvas-resource-references";

/**
 * 恢复画布时同步 Agent 会话里的引用内容与中断消息。
 */
export function syncAssistantReferences(sessions: CanvasAssistantSession[], nodes: CanvasNodeData[], restoreInterrupted = false, previousNode?: CanvasNodeData) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return sessions.map((session) => ({
        ...session,
        messages: session.messages.map((message) => {
            const interrupted = restoreInterrupted && (message.status === "thinking" || message.status === "running");
            return {
                ...message,
                text: interrupted && !message.text ? "上次 Agent 执行因页面关闭而中断；已提交的媒体任务会继续恢复，你可以让我从当前画布继续。" : message.text,
                status: interrupted ? ("waiting" as const) : message.status,
                activity: interrupted ? undefined : message.activity,
                references: message.references?.map((reference) => {
                    const node = nodeById.get(reference.id);
                    const content = node && (!previousNode || (reference.dataUrl === previousNode.metadata?.content && reference.storageKey === previousNode.metadata?.storageKey)) && assistantReferenceContentFromNode(node);
                    return content ? { ...reference, ...content } : reference;
                }),
            };
        }),
    }));
}
