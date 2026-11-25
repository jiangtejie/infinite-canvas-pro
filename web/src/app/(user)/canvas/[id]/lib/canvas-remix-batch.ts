import type { RemixBatchProgress, RemixRun } from "../../remix-types";
import type { CanvasNodeData } from "../../types";
import { collectRemixImageNodeIds } from "./canvas-source-remix";

export function updateRemixBatch(run: RemixRun, update: Omit<RemixBatchProgress, "id" | "runId">): RemixRun {
    return { ...run, batch: { ...update, id: run.batch?.id || crypto.randomUUID(), runId: run.id } };
}

export function remixBatchTargetRunId(nodes: CanvasNodeData[], nodeIds: string[]) {
    const targets = new Set(nodeIds);
    const runIds = new Set(nodes.flatMap((node) => targets.has(node.id) && node.metadata?.remixRunId ? [node.metadata.remixRunId] : []));
    if (runIds.size > 1) throw new Error("请将不同复刻运行分开批量生成，以分别记录进度和审批");
    return runIds.values().next().value as string | undefined;
}

export function updateRemixBatchProgress(nodes: CanvasNodeData[], nodeIds: string[], update: Omit<RemixBatchProgress, "id" | "runId">) {
    const runId = remixBatchTargetRunId(nodes, nodeIds);
    if (!runId) return nodes;
    return nodes.map((node) => node.metadata?.remixRun?.id === runId
        ? { ...node, metadata: { ...node.metadata, remixRun: updateRemixBatch(node.metadata.remixRun, update) } }
        : node);
}

export function pauseRemixBatches(nodes: CanvasNodeData[]) {
    return nodes.map((node) => node.metadata?.remixRun?.batch?.status === "running"
        ? { ...node, metadata: { ...node.metadata, remixRun: { ...node.metadata.remixRun, batch: { ...node.metadata.remixRun.batch, status: "paused" as const } } } }
        : node);
}

export function remixBatchRemainingNodeIds(run: RemixRun, nodes: CanvasNodeData[]) {
    const batch = run.batch;
    if (!batch || batch.status === "completed" || batch.status === "failed") return [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return batch.nodeIds.slice(batch.cursor).filter((id) => {
        const node = byId.get(id);
        if (!node || node.metadata?.imageTaskUnknown || node.metadata?.status === "success" || node.metadata?.content) return false;
        return !["loading", "stopping"].includes(node.metadata?.status || "") || !node.metadata?.imageTaskId;
    });
}

export function remixBatchRetryNodeIds(run: RemixRun, nodes: CanvasNodeData[]) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const orderedIds = run.batch?.nodeIds || collectRemixImageNodeIds(nodes, run.id);
    return orderedIds.filter((id) => {
        const node = byId.get(id);
        const metadata = node?.metadata;
        return metadata?.remixRunId === run.id
            && metadata.remixRole === "image"
            && ["error", "stopped"].includes(metadata.status || "")
            && !metadata.imageTaskUnknown
            && !metadata.content;
    });
}

export function remixBatchGenerationNodeIds(run: RemixRun, nodes: CanvasNodeData[]) {
    const retryIds = remixBatchRetryNodeIds(run, nodes);
    if (retryIds.length) return retryIds;
    if (run.batch) return remixBatchRemainingNodeIds(run, nodes);
    return collectRemixImageNodeIds(nodes, run.id);
}

export function collectRemixRunIssues(run: RemixRun, nodes: CanvasNodeData[]) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const images = collectRemixImageNodeIds(nodes, run.id);
    const failedNodeIds = remixBatchRetryNodeIds(run, nodes);
    const failed = new Set(failedNodeIds);
    const unknownNodeIds = images.filter((id) => byId.get(id)?.metadata?.imageTaskUnknown);
    const unknown = new Set(unknownNodeIds);
    const remainingNodeIds = images.filter((id) => {
        const metadata = byId.get(id)?.metadata;
        if (!metadata || metadata.status === "success" || metadata.content || failed.has(id) || unknown.has(id)) return false;
        return !["loading", "stopping"].includes(metadata.status || "") || !metadata.imageTaskId;
    });
    return { failedNodeIds, unknownNodeIds, remainingNodeIds };
}

export function remixBatchAttemptCounts(progress: Pick<RemixBatchProgress, "completed" | "failed" | "failedNodeIds">, nodeId: string, result: "success" | "failure") {
    const wasFailed = progress.failedNodeIds.includes(nodeId);
    if (result === "success") {
        return {
            completed: progress.completed + 1,
            failed: wasFailed ? progress.failed - 1 : progress.failed,
            failedNodeIds: wasFailed ? progress.failedNodeIds.filter((id) => id !== nodeId) : progress.failedNodeIds,
        };
    }
    return wasFailed ? progress : { ...progress, failed: progress.failed + 1, failedNodeIds: [...progress.failedNodeIds, nodeId] };
}

export function reconcileRemixBatchResume(batch: RemixBatchProgress, nodes: CanvasNodeData[]): RemixBatchProgress {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const settled = (node?: CanvasNodeData) => Boolean(node && (node.metadata?.imageTaskUnknown || node.metadata?.content || ["success", "error", "stopped"].includes(node.metadata?.status || "")));
    let cursor = Math.min(Math.max(batch.cursor, 0), batch.nodeIds.length);
    while (cursor < batch.nodeIds.length && settled(byId.get(batch.nodeIds[cursor]))) cursor += 1;
    const attempted = batch.nodeIds.slice(0, cursor);
    const completed = attempted.filter((id) => {
        const node = byId.get(id);
        return node?.metadata?.status === "success" || Boolean(node?.metadata?.content);
    }).length;
    const failedNodeIds = attempted.filter((id) => {
        const node = byId.get(id);
        return node?.metadata?.status !== "success" && !node?.metadata?.content;
    });
    return { ...batch, cursor, completed, failed: failedNodeIds.length, failedNodeIds, status: "paused" };
}

export function remixBatchResumeBlockReason(run: RemixRun, nodes: CanvasNodeData[]) {
    return run.batch?.status === "paused" && remixBatchGenerationNodeIds(run, nodes).length === 0
        ? "没有可继续提交的复刻配图，请先检查已提交任务或状态未知的节点"
        : "";
}
