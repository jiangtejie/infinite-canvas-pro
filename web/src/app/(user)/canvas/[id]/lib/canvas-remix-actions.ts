import type { CanvasAgentToolResult } from "../../agent/canvas-agent-tools";
import type { RemixRun } from "../../remix-types";
import type { CanvasNodeData } from "../../types";
import type { CanvasBatchRunResult } from "./canvas-batch";
import { sourceNodeHasMaterial } from "./canvas-node-meta";
import { remixBatchRetryNodeIds, remixBatchRemainingNodeIds } from "./canvas-remix-batch";

export type RemixRunAction = {
    kind: "review" | "generate" | "retry" | "view" | "publish" | "replan";
    label: string;
};

export function getRemixRunAction(run: RemixRun, nodes: CanvasNodeData[], hasPublishNode: boolean): RemixRunAction {
    const images = nodes.filter((node) => node.metadata?.remixRunId === run.id && node.metadata.remixRole === "image");
    if (images.some((node) => !node.metadata?.imageTaskUnknown && ["loading", "stopping"].includes(node.metadata?.status || ""))) return { kind: "view", label: "查看进度" };
    if (run.binding === "detached") return { kind: "replan", label: "重新策划" };
    if (!run.plan) return { kind: "view", label: "查看策划" };
    const retryIds = remixBatchRetryNodeIds(run, nodes);
    if (retryIds.length) return { kind: "retry", label: `重试失败项（${retryIds.length}）` };
    const completed = images.length > 0 && images.every((node) => node.metadata?.status === "success" || Boolean(node.metadata?.content));
    if (completed) return hasPublishNode ? { kind: "publish", label: "去发布" } : { kind: "view", label: "查看策划" };
    const remainingIds = remixBatchRemainingNodeIds(run, nodes);
    if (remainingIds.length) return { kind: "generate", label: `继续剩余（${remainingIds.length}）` };
    if (images.length && run.batch) return { kind: "view", label: "查看策划" };
    return { kind: "review", label: "审阅并生成" };
}

export function getRemixReviewImages(run: RemixRun, nodes: CanvasNodeData[], nodeIds?: string[]) {
    const images = nodes.filter((node) => node.metadata?.remixRunId === run.id && node.metadata.remixRole === "image")
        .sort((a, b) => (a.metadata?.remixIndex || 0) - (b.metadata?.remixIndex || 0));
    if (!nodeIds) return images;
    const targets = new Set(nodeIds);
    if (nodeIds.some((id) => !images.some((node) => node.id === id))) throw new Error("所选图片不在本次复刻范围内");
    return images.filter((node) => targets.has(node.id));
}

export function sourceRemixActionVisible(node: CanvasNodeData) {
    return sourceNodeHasMaterial(node.metadata) && node.metadata?.sourceParsing !== true;
}

export type RemixRunGenerationResult = CanvasBatchRunResult & { publishNodeId?: string; message?: string };

export function getRemixAgentGenerationResult(result: RemixRunGenerationResult): CanvasAgentToolResult {
    const detail = {
        imageNodeIds: result.nodeIds,
        completedNodeIds: result.completedNodeIds,
        completed: result.completed,
        failed: result.failed,
        failedNodeIds: result.failedNodeIds,
        publishNodeId: result.publishNodeId,
    };
    if (result.status === "success") return { ok: true, submitted: true, message: `复刻配图已全部生成，共 ${result.completed} 张`, ...detail };
    if (result.status === "cancelled") return { ok: false, code: "remix_batch_cancelled", submitted: false, message: "用户已取消本次复刻生成，请停止，不要重新请求", ...detail };
    if (result.status === "busy") return { ok: false, code: "remix_batch_busy", submitted: false, message: "已有批量生成正在运行，请等待当前批次结束", ...detail };
    if (result.status === "unavailable") return { ok: false, code: "remix_batch_not_started", submitted: false, message: result.message || "复刻配图批次未执行，请检查节点状态或模型配置", ...detail };
    const statusMessage = result.status === "stopped" ? "复刻配图已停止" : result.status === "timeout" ? "复刻配图等待超时" : "复刻配图部分失败";
    return { ok: false, code: "remix_batch_incomplete", submitted: true, message: `${statusMessage}：成功 ${result.completed} 张，失败 ${result.failed} 张；请先检查节点状态，不要重复提交可恢复任务`, ...detail };
}
