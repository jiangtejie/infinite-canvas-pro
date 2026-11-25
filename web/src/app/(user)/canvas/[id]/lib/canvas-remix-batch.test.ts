import assert from "node:assert/strict";
import test from "node:test";

import type { RemixBatchProgress, RemixRun } from "../../remix-types";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { getRemixReviewImages } from "./canvas-remix-actions";
import { collectRemixRunIssues, pauseRemixBatches, reconcileRemixBatchResume, remixBatchAttemptCounts, remixBatchGenerationNodeIds, remixBatchRemainingNodeIds, remixBatchResumeBlockReason, remixBatchRetryNodeIds, remixBatchTargetRunId, updateRemixBatch, updateRemixBatchProgress } from "./canvas-remix-batch";

const run = { id: "run-1", input: { ownerId: "guest" } } as RemixRun;
const update: Omit<RemixBatchProgress, "id" | "runId"> = {
    nodeIds: ["n1", "n2", "n3"], cursor: 1, completed: 1, failed: 0, failedNodeIds: [], status: "running",
};
const node = (id: string, metadata: CanvasNodeData["metadata"]): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 512, height: 512, metadata });

test("复刻批次进度写入运行记录，刷新后只继续未提交槽位", () => {
    const next = updateRemixBatch(run, update);
    assert.equal(next.batch?.cursor, 1);
    assert.deepEqual(remixBatchRemainingNodeIds(next, [node("n1", { status: "success" }), node("n2", { prompt: "p2" }), node("n3", { prompt: "p3" })]), ["n2", "n3"]);
    const finished = updateRemixBatch(next, { ...update, cursor: 2, completed: 1, failed: 1, failedNodeIds: ["n2"], status: "paused" });
    assert.deepEqual(remixBatchRemainingNodeIds(finished, [node("n3", { prompt: "p3" })]), ["n3"]);
});

test("批次进度同步到同一运行的全部节点，且不改变普通图片", () => {
    const active = updateRemixBatch(run, update);
    const next = updateRemixBatchProgress([
        { ...node("plan", {}), metadata: { remixRun: active, remixRunId: run.id } },
        { ...node("n2", {}), metadata: { remixRunId: run.id, prompt: "p2" } },
        node("ordinary", { prompt: "ordinary" }),
    ], ["n2"], { ...update, cursor: 2, completed: 1 });
    assert.equal(next[0].metadata?.remixRun?.batch?.cursor, 2);
    assert.equal(next[1].metadata?.remixRun, undefined);
    assert.equal(next[2].metadata?.remixRun, undefined);
});

test("混合多个复刻运行的批次会在写进度前拒绝，避免聚合进度串写", () => {
    assert.throws(() => remixBatchTargetRunId([
        node("n1", { remixRunId: "run-1", remixRole: "image" }),
        node("n2", { remixRunId: "run-2", remixRole: "image" }),
    ], ["n1", "n2"]), /分开批量生成/);
});

test("刷新暂停运行中的批次，不自动重发已提交或状态未知的任务", () => {
    const active = updateRemixBatch(run, update);
    const paused = pauseRemixBatches([{ ...node("plan", {}), metadata: { remixRun: active } }]);
    assert.equal(paused[0].metadata?.remixRun?.batch?.status, "paused");
    assert.deepEqual(remixBatchRemainingNodeIds(paused[0].metadata!.remixRun!, [
        node("n2", { status: "loading", imageTaskId: "server-task" }),
        node("n3", { imageTaskUnknown: true }),
    ]), []);
});

test("续跑按真实终态校正崩溃前未持久化的游标和成功失败计数", () => {
    const batch = updateRemixBatch(run, { ...update, cursor: 0, completed: 0, status: "paused" }).batch!;
    const resumed = reconcileRemixBatchResume(batch, [
        node("n1", { status: "success", content: "blob:one" }),
        node("n2", { status: "error" }),
        node("n3", { prompt: "p3" }),
    ]);
    assert.equal(resumed.cursor, 2);
    assert.equal(resumed.completed, 1);
    assert.equal(resumed.failed, 1);
    assert.deepEqual(resumed.failedNodeIds, ["n2"]);
    assert.deepEqual(remixBatchRemainingNodeIds({ ...run, batch: resumed }, [node("n3", { prompt: "p3" })]), ["n3"]);
});

test("有失败项时优先只重试失败图片，排除成功、未知和可恢复中的图片", () => {
    const batch = updateRemixBatch(run, { nodeIds: ["n1", "n2", "n3", "n4", "n5"], cursor: 5, completed: 1, failed: 2, failedNodeIds: ["n2", "n5"], status: "paused" }).batch!;
    const current = { ...run, batch };
    const nodes = [
        imageNode("n1", { status: "success", content: "blob:one" }),
        imageNode("n2", { status: "error", prompt: "p2" }),
        imageNode("n3", { status: "loading", imageTaskId: "task-3" }),
        imageNode("n4", { imageTaskUnknown: true }),
        imageNode("n5", { status: "stopped", prompt: "p5" }),
    ];
    assert.deepEqual(remixBatchRetryNodeIds(current, nodes), ["n2", "n5"]);
    assert.deepEqual(remixBatchGenerationNodeIds(current, nodes), ["n2", "n5"]);
    assert.deepEqual(getRemixReviewImages(current, nodes, remixBatchGenerationNodeIds(current, nodes)).map((item) => item.id), ["n2", "n5"]);
});

test("首次审阅不排除已有结果，继续批次只审阅实际待提交槽位", () => {
    const nodes = [imageNode("n1", { status: "success", content: "blob:one" }), imageNode("n2", {}), imageNode("n3", { imageTaskUnknown: true })];
    assert.deepEqual(getRemixReviewImages(run, nodes).map((item) => item.id), ["n1", "n2", "n3"]);
    const batch = updateRemixBatch(run, { ...update, cursor: 1, status: "paused" }).batch!;
    const targets = remixBatchGenerationNodeIds({ ...run, batch }, nodes);
    assert.deepEqual(targets, ["n2"]);
    assert.deepEqual(getRemixReviewImages({ ...run, batch }, nodes, targets).map((item) => item.id), ["n2"]);
    assert.throws(() => getRemixReviewImages(run, nodes, ["outside"]), /不在本次复刻范围内/);
});

function imageNode(id: string, metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return node(id, { remixRunId: run.id, remixRole: "image", prompt: `p-${id}`, ...metadata });
}

test("没有失败项时继续未提交槽位，不把未知任务当成重试目标", () => {
    const batch = updateRemixBatch(run, { nodeIds: ["n1", "n2", "n3"], cursor: 1, completed: 1, failed: 0, failedNodeIds: [], status: "paused" }).batch!;
    const current = { ...run, batch };
    const nodes = [
        node("n1", { remixRunId: run.id, remixRole: "image", status: "success" }),
        node("n2", { remixRunId: run.id, remixRole: "image", prompt: "p2" }),
        node("n3", { remixRunId: run.id, remixRole: "image", imageTaskUnknown: true }),
    ];
    assert.deepEqual(remixBatchRetryNodeIds(current, nodes), []);
    assert.deepEqual(remixBatchGenerationNodeIds(current, nodes), ["n2"]);
});

test("工作台区分失败、未知与未提交项，排除成功和恢复中的任务", () => {
    const nodes = [
        imageNode("n1", { status: "success", content: "blob:one" }),
        imageNode("n2", { status: "error" }),
        imageNode("n3", { status: "loading", imageTaskId: "task-3" }),
        imageNode("n4", { status: "loading", imageTaskUnknown: true }),
        imageNode("n5", { status: "idle" }),
        imageNode("n6", { status: "loading" }),
    ];
    assert.deepEqual(collectRemixRunIssues(run, nodes), {
        failedNodeIds: ["n2"],
        unknownNodeIds: ["n4"],
        remainingNodeIds: ["n5", "n6"],
    });
});

test("失败项重试成功后从失败计数移除，不重复累计成功", () => {
    assert.deepEqual(remixBatchAttemptCounts({ completed: 1, failed: 2, failedNodeIds: ["n2", "n5"] }, "n2", "success"), { completed: 2, failed: 1, failedNodeIds: ["n5"] });
});

test("失败项再次失败只保留一条失败记录，新失败才增加计数", () => {
    assert.deepEqual(remixBatchAttemptCounts({ completed: 1, failed: 1, failedNodeIds: ["n2"] }, "n2", "failure"), { completed: 1, failed: 1, failedNodeIds: ["n2"] });
    assert.deepEqual(remixBatchAttemptCounts({ completed: 1, failed: 1, failedNodeIds: ["n2"] }, "n3", "failure"), { completed: 1, failed: 2, failedNodeIds: ["n2", "n3"] });
});

test("暂停批次只有失败槽位时允许重试，避免空批次再次确认", () => {
    const batch = updateRemixBatch(run, { ...update, cursor: 3, completed: 2, failed: 1, failedNodeIds: ["n3"], status: "paused" }).batch!;
    const current = { ...run, batch };
    assert.equal(remixBatchResumeBlockReason(current, [
        node("n1", { remixRunId: run.id, remixRole: "image", status: "success" }),
        node("n2", { remixRunId: run.id, remixRole: "image", status: "success" }),
        node("n3", { remixRunId: run.id, remixRole: "image", status: "error" }),
    ]), "");
    assert.match(remixBatchResumeBlockReason(current, [
        node("n1", { remixRunId: run.id, remixRole: "image", status: "success" }),
        node("n2", { remixRunId: run.id, remixRole: "image", status: "success" }),
        node("n3", { remixRunId: run.id, remixRole: "image", imageTaskUnknown: true }),
    ]), /没有可继续提交/);
    assert.equal(remixBatchResumeBlockReason({ ...current, batch: { ...batch, status: "running" } }, []), "");
});
