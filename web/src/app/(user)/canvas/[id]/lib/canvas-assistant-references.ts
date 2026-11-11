import type { CanvasAgentState, CanvasAssistantSession, CanvasNodeData } from "../../types";
import { assistantReferenceContentFromNode } from "../../utils/canvas-resource-references";

/**
 * 用当前画布校正 Agent 状态：过滤已删除节点的引用与悬空的待处理任务 ID，
 * 阶段、已确认方案与已完成任务历史保持不变。
 */
export function reconcileCanvasAgentState(state: CanvasAgentState, nodes: CanvasNodeData[]): CanvasAgentState {
    const existing = new Set(nodes.map((node) => node.id));
    const taskIds = new Set(
        nodes
            .flatMap((node) => [node.metadata?.imageTaskId, node.metadata?.videoTaskId, node.metadata?.videoTaskVideoId, node.metadata?.audioTaskId])
            .filter((taskId): taskId is string => Boolean(taskId)),
    );
    const keepIds = (ids: string[] | undefined) => [...new Set((ids || []).filter((id) => existing.has(id)))];
    const keepTasks = (ids: string[] | undefined) => [...new Set((ids || []).filter((id) => taskIds.has(id)))];
    return {
        ...state,
        approvedNodeIds: keepIds(state.approvedNodeIds),
        referenceNodeIds: keepIds(state.referenceNodeIds),
        pendingTaskIds: keepTasks(state.pendingTaskIds),
    };
}

/**
 * 恢复画布时同步 Agent 会话里的引用内容与中断消息。
 */
export function syncAssistantReferences(sessions: CanvasAssistantSession[], nodes: CanvasNodeData[], restoreInterrupted = false, previousNode?: CanvasNodeData) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return sessions.map((session) => ({
        ...session,
        agentState: session.agentState ? reconcileCanvasAgentState(session.agentState, nodes) : session.agentState,
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
