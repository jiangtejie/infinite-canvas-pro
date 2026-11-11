import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import type { CanvasAgentAction } from "./canvas-agent-tools";
import { canvasAgentConfirmation } from "./canvas-agent-confirmation";

const action = (name: CanvasAgentAction["name"], args: Record<string, unknown> = {}): CanvasAgentAction => ({ id: "a1", name, arguments: args });
const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "n1",
    type: CanvasNodeType.Text,
    title: "镜头一",
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    ...patch,
});
const context = (patch: Partial<{ nodes: CanvasNodeData[]; connections: CanvasConnection[]; autoGenerateMedia: boolean; confirmMediaGeneration: boolean }> = {}) => ({
    nodes: [node(), node({ id: "n2", title: "分镜图" })],
    connections: [] as CanvasConnection[],
    autoGenerateMedia: true,
    ...patch,
});

test("delete node asks for confirmation with the node title", () => {
    const confirmation = canvasAgentConfirmation(action("delete_node", { nodeId: "n2" }), context());
    assert.ok(confirmation);
    assert.equal(confirmation.title, "删除「分镜图」？");
    assert.equal(confirmation.danger, true);
    assert.equal(confirmation.okText, "确认删除");
});

test("plain writes and reads run without confirmation", () => {
    assert.equal(canvasAgentConfirmation(action("create_text_node", { title: "镜头", content: "x" }), context()), null);
    assert.equal(canvasAgentConfirmation(action("get_canvas_summary"), context()), null);
});

test("delete connection summarises both ends", () => {
    const connections: CanvasConnection[] = [{ id: "e1", fromNodeId: "n1", toNodeId: "n2" }];
    const confirmation = canvasAgentConfirmation(action("delete_connection", { connectionId: "e1" }), context({ connections }));
    assert.ok(confirmation);
    assert.equal(confirmation.detail, "镜头一 → 分镜图");
    assert.equal(confirmation.danger, true);
    const missing = canvasAgentConfirmation(action("delete_connection", { connectionId: "missing" }), context({ connections }));
    assert.match(missing!.detail, /找不到这条连线/);
});

test("media confirmation only appears when auto generation is enabled", () => {
    assert.equal(canvasAgentConfirmation(action("generate_image", { prompt: "海边", sourceNodeIds: [] }), context({ autoGenerateMedia: false })), null);
    assert.ok(canvasAgentConfirmation(action("generate_image", { prompt: "海边", sourceNodeIds: [] }), context()));
});

test("image confirmation shows count and size", () => {
    const confirmation = canvasAgentConfirmation(action("generate_image", { prompt: "海边的女孩", sourceNodeIds: [], count: 4, size: "1024x1024" }), context());
    assert.ok(confirmation);
    assert.equal(confirmation.title, "提交 4 张图片生成？");
    assert.match(confirmation.detail, /提示词：海边的女孩/);
    assert.match(confirmation.detail, /1024x1024/);
    assert.equal(confirmation.danger, false);
});

test("video and audio confirmations include duration and voice", () => {
    const video = canvasAgentConfirmation(action("generate_video", { prompt: "镜头推进", sourceNodeIds: [], seconds: 8, size: "16:9" }), context());
    assert.ok(video);
    assert.match(video.detail, /8s/);
    const audio = canvasAgentConfirmation(action("generate_audio", { prompt: "欢迎收听", sourceNodeIds: [], voice: "nova" }), context());
    assert.ok(audio);
    assert.match(audio.detail, /音色 nova/);
});

test("media confirmation can be turned off without affecting destructive actions", () => {
    const generate = action("generate_image", { prompt: "海边", sourceNodeIds: [] });
    assert.equal(canvasAgentConfirmation(generate, context({ confirmMediaGeneration: false })), null);
    assert.ok(canvasAgentConfirmation(generate, context({ confirmMediaGeneration: true })));
    assert.ok(canvasAgentConfirmation(generate, context()));
    assert.ok(canvasAgentConfirmation(action("delete_node", { nodeId: "n1" }), context({ confirmMediaGeneration: false })));
});

test("media confirmation shows the estimated credits when available", () => {
    const generate = action("generate_image", { prompt: "海边", sourceNodeIds: [], count: 2 });
    const withCost = canvasAgentConfirmation(generate, { ...context(), creditCost: 4 });
    assert.ok(withCost);
    assert.match(withCost.detail, /预计 4 算力点/);
    const free = canvasAgentConfirmation(generate, { ...context(), creditCost: 0 });
    assert.ok(free);
    assert.doesNotMatch(free.detail, /算力点/);
    const del = canvasAgentConfirmation(action("delete_node", { nodeId: "n1" }), { ...context(), creditCost: 4 });
    assert.doesNotMatch(del!.detail, /算力点/);
});
