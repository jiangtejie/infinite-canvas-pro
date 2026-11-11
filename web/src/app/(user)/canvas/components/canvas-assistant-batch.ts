import type { CanvasAssistantBatch } from "../types";

/** 单动作且无失败时不展示批次信息，避免每条回复都带脚注。 */
export function shouldShowAssistantBatch(batch?: CanvasAssistantBatch | null) {
    return Boolean(batch && (batch.total > 1 || batch.failed > 0));
}

/** 一轮对话可能有多个批次：累加总数并保留是否发生过回滚。 */
export function mergeAssistantBatch(previous: CanvasAssistantBatch | null, next: CanvasAssistantBatch): CanvasAssistantBatch {
    if (!previous) return next;
    return {
        total: previous.total + next.total,
        succeeded: previous.succeeded + next.succeeded,
        failed: previous.failed + next.failed,
        rolledBack: previous.rolledBack || next.rolledBack,
        nodeIds: [...new Set([...(previous.nodeIds || []), ...(next.nodeIds || [])])].slice(0, 20),
    };
}

export function formatAssistantBatch(batch: CanvasAssistantBatch) {
    const parts = [`本批 ${batch.total} 个操作`, `成功 ${batch.succeeded}`];
    if (batch.failed) parts.push(`失败 ${batch.failed}`);
    if (batch.rolledBack) parts.push("已回滚");
    return parts.join(" · ");
}
