import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RemixGenerationSummary } from "../../components/canvas-remix-plan-panel";
import type { RemixRun, SourceRemixPlan } from "../../remix-types";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { getRemixAgentGenerationResult, getRemixReviewImages, getRemixRunAction, sourceRemixActionVisible } from "./canvas-remix-actions";
import type { CanvasBatchRunResult } from "./canvas-batch";

const plan: SourceRemixPlan = {
    schemaVersion: 1,
    sourcePattern: { type: "tutorial", preserve: ["结构"] },
    copy: { title: "测试策划", body: "正文", tags: ["测试"] },
    marketingPlacement: { mode: "natural", reason: "自然", cta: "无" },
    factsUsed: [],
    visual: { sharedAnchors: [], images: [{ sourceImageId: "source-1", role: "封面", prompt: "封面提示词", referenceAssetIds: [] }] },
};
const run = { id: "run-1", input: { ownerId: "guest" }, binding: "active", plan } as RemixRun;
const image = (id: string, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x: 0, y: 0 },
    width: 512,
    height: 512,
    metadata: { remixRunId: run.id, remixRole: "image", prompt: `提示词-${id}`, ...metadata },
});
const source = (metadata: CanvasNodeData["metadata"]): CanvasNodeData => ({
    id: "source-1", type: CanvasNodeType.Source, title: "素材", position: { x: 0, y: 0 }, width: 420, height: 420, metadata,
});

test("待审阅运行卡只提供进入完整策划的主动作", () => {
    assert.deepEqual(getRemixRunAction(run, [image("n1")], false), { kind: "review", label: "审阅并生成" });
});

test("生成中运行卡只提供查看进度，不重复提供生成或重做", () => {
    assert.deepEqual(getRemixRunAction(run, [image("n1", { status: "loading", imageTaskId: "task-1" })], false), { kind: "view", label: "查看进度" });
});

test("状态未知的加载项不遮蔽失败项重试", () => {
    const current = { ...run, batch: { id: "batch-1", runId: run.id, nodeIds: ["n1", "n2"], cursor: 2, completed: 0, failed: 1, failedNodeIds: ["n2"], status: "paused" as const } };
    assert.deepEqual(getRemixRunAction(current, [
        image("n1", { status: "loading", imageTaskUnknown: true }),
        image("n2", { status: "error" }),
    ], false), { kind: "retry", label: "重试失败项（1）" });
});

test("失败项优先于尚未提交项，运行卡主按钮只重试失败图片", () => {
    const current = { ...run, batch: { id: "batch-1", runId: run.id, nodeIds: ["n1", "n2", "n3"], cursor: 2, completed: 0, failed: 1, failedNodeIds: ["n2"], status: "paused" as const } };
    assert.deepEqual(getRemixRunAction(current, [image("n1", { status: "error" }), image("n2", { status: "error" }), image("n3")], false), { kind: "retry", label: "重试失败项（2）" });
});

test("没有失败项时运行卡主按钮只继续剩余图片", () => {
    const current = { ...run, batch: { id: "batch-1", runId: run.id, nodeIds: ["n1", "n2"], cursor: 1, completed: 1, failed: 0, failedNodeIds: [], status: "paused" as const } };
    assert.deepEqual(getRemixRunAction(current, [image("n1", { status: "success" }), image("n2")], false), { kind: "generate", label: "继续剩余（1）" });
});

test("未知任务不会触发再次生成，运行卡回到查看策划", () => {
    const current = { ...run, batch: { id: "batch-1", runId: run.id, nodeIds: ["n1"], cursor: 1, completed: 0, failed: 0, failedNodeIds: [], status: "paused" as const } };
    assert.deepEqual(getRemixRunAction(current, [image("n1", { imageTaskUnknown: true })], false), { kind: "view", label: "查看策划" });
});

test("全部完成后运行卡只提供去发布；发布节点缺失时查看策划", () => {
    const nodes = [image("n1", { status: "success", content: "blob:one" })];
    assert.deepEqual(getRemixRunAction(run, nodes, true), { kind: "publish", label: "去发布" });
    assert.deepEqual(getRemixRunAction(run, nodes, false), { kind: "view", label: "查看策划" });
});

test("脱离资料绑定的运行只提供重新策划", () => {
    assert.deepEqual(getRemixRunAction({ ...run, binding: "detached" }, [image("n1")], false), { kind: "replan", label: "重新策划" });
});

test("单图审阅范围只返回目标图片，按运行内顺序排列", () => {
    assert.deepEqual(getRemixReviewImages(run, [image("n1"), image("n2"), image("n3")], ["n3"]).map((node) => node.id), ["n3"]);
    assert.deepEqual(getRemixReviewImages(run, [image("n1"), image("n2"), image("n3")], ["n3", "n1"]).map((node) => node.id), ["n1", "n3"]);
    assert.throws(() => getRemixReviewImages(run, [image("n1")], ["n2"]), /不在本次复刻范围内/);
});

test("只有已解析且未在解析中的素材源显示复刻入口", () => {
    assert.equal(sourceRemixActionVisible(source({ sourceTitle: "素材", sourceParsing: false })), true);
    assert.equal(sourceRemixActionVisible(source({ sourceTitle: "素材", sourceParsing: true })), false);
    assert.equal(sourceRemixActionVisible(source({ sourceStatus: "error" })), false);
    assert.equal(sourceRemixActionVisible(source({})), false);
});

const batchResult = (patch: Partial<CanvasBatchRunResult> = {}): CanvasBatchRunResult => ({
    status: "success", total: 1, completed: 1, failed: 0, failedNodeIds: [], nodeIds: ["n1"], completedNodeIds: [], ...patch,
});

test("单图生成确认使用复刻槽位的真实序号和角色", () => {
    const html = renderToStaticMarkup(createElement(RemixGenerationSummary, {
        scopes: [{ run, images: [image("n1", { remixIndex: 1 })] }], count: 1, model: "image-model", credits: 0,
    }));
    assert.match(html, /本次重做 · 第 1 张 封面/);
    assert.doesNotMatch(html, /第 2 张/);
});

test("Agent 只回报本次批次目标与真实发布节点，不推断旧任务", () => {
    const result = getRemixAgentGenerationResult({ ...batchResult({ nodeIds: ["n2"], completedNodeIds: ["n2"] }), publishNodeId: "publish-1" });
    assert.equal(result.ok, true);
    assert.equal(result.submitted, true);
    assert.deepEqual(result.imageNodeIds, ["n2"]);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.publishNodeId, "publish-1");
});

test("Agent 将部分失败、停止和超时回报为未完成，不报成功", () => {
    for (const status of ["partial", "stopped", "timeout"] as const) {
        const result = getRemixAgentGenerationResult(batchResult({ status, total: 2, completed: 1, failed: 1, failedNodeIds: ["n2"], nodeIds: ["n1", "n2"], completedNodeIds: ["n1"] }));
        assert.equal(result.ok, false);
        assert.equal(result.code, "remix_batch_incomplete");
        assert.equal(result.submitted, true);
        assert.equal(result.completed, 1);
        assert.equal(result.failed, 1);
        assert.deepEqual(result.imageNodeIds, ["n1", "n2"]);
    }
});

test("Agent 区分取消、批次忙碌和未执行，避免自动重试", () => {
    const cancelled = getRemixAgentGenerationResult(batchResult({ status: "cancelled", total: 0, completed: 0, nodeIds: [] }));
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.code, "remix_batch_cancelled");
    assert.equal(cancelled.submitted, false);
    assert.match(cancelled.message || "", /不要重新请求/);

    const busy = getRemixAgentGenerationResult(batchResult({ status: "busy", total: 0, completed: 0, nodeIds: [] }));
    assert.equal(busy.code, "remix_batch_busy");
    assert.equal(busy.submitted, false);

    const unavailable = getRemixAgentGenerationResult({ ...batchResult({ status: "unavailable", total: 0, completed: 0, nodeIds: [] }), message: "没有可生成的复刻配图" });
    assert.equal(unavailable.code, "remix_batch_not_started");
    assert.equal(unavailable.message, "没有可生成的复刻配图");
    assert.equal(unavailable.submitted, false);
});
