import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { applySourceRemixPlan, parseSourceRemixPlan, remixImagePromptFromPlan } from "./canvas-source-remix-plan";

const imageNode = (id: string, remixIndex: number): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: `复刻配图 ${remixIndex}`,
    position: { x: 0, y: 0 },
    width: 320,
    height: 400,
    metadata: { prompt: "", remixIndex, remixSourceId: "source-1" },
});

test("parse remix plan reads shared setting and per-image prompts", async () => {
    const plan = await parseSourceRemixPlan('{"shared":"同一微信聊天界面","images":["第1张：抛出问题","第2张：给出步骤"]}', 2);
    assert.deepEqual(plan, { shared: "同一微信聊天界面", images: ["第1张：抛出问题", "第2张：给出步骤"] });
});

test("parse remix plan tolerates markdown fences and trailing commas", async () => {
    const plan = await parseSourceRemixPlan('```json\n{"shared":"统一版式","images":["甲","乙",]}\n```', 2);
    assert.deepEqual(plan.images, ["甲", "乙"]);
});

test("parse remix plan rejects mismatched image count", async () => {
    await assert.rejects(() => parseSourceRemixPlan('{"shared":"设定","images":["只有一张"]}', 3), /策划输出不完整/);
});

test("parse remix plan rejects empty shared setting or empty prompt", async () => {
    await assert.rejects(() => parseSourceRemixPlan('{"shared":"  ","images":["甲"]}', 1), /策划输出不完整/);
    await assert.rejects(() => parseSourceRemixPlan('{"shared":"设定","images":[""]}', 1), /策划输出不完整/);
});

test("parse remix plan rejects output that is not a plan object", async () => {
    await assert.rejects(() => parseSourceRemixPlan("这不是 JSON", 1));
});

test("remix image prompt is self-contained for an independent generation call", () => {
    assert.equal(remixImagePromptFromPlan({ shared: "同一聊天界面", images: ["第1张", "第2张"] }, 1), "同一聊天界面\n\n第2张");
});

test("apply remix plan writes prompts in the given image order and leaves other nodes alone", () => {
    const nodes = [imageNode("source-1-remix-image-0", 1), imageNode("source-1-remix-image-1", 2), imageNode("other", 1)];
    const next = applySourceRemixPlan(nodes, ["source-1-remix-image-1", "source-1-remix-image-0"], { shared: "共同设定", images: ["甲", "乙"] });
    assert.equal(next[0]?.metadata?.prompt, "共同设定\n\n乙");
    assert.equal(next[1]?.metadata?.prompt, "共同设定\n\n甲");
    assert.equal(next[2]?.metadata?.prompt, "");
    assert.equal(nodes[0]?.metadata?.prompt, "");
});