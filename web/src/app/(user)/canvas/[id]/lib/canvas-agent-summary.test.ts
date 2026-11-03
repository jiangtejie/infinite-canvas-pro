import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { canvasAgentNodeSummary, canvasAgentTaskSummary, canvasAgentVideoDurationHint, canvasRecoverableTaskId, validateCanvasAgentVideoSeconds } from "./canvas-agent-summary";

const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "n1",
    type: CanvasNodeType.Image,
    title: "测试节点",
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata: { status: "success" },
    ...patch,
});

test("agent node summary truncates text and hides data urls", () => {
    const summary = canvasAgentNodeSummary(node({ type: CanvasNodeType.Text, metadata: { content: "x".repeat(4500) } }));
    assert.equal(summary.text?.length, 4000);
    assert.equal(summary.mediaUrl, undefined);
    const image = canvasAgentNodeSummary(node({ metadata: { content: "data:image/png;base64,abc" } }));
    assert.equal(image.mediaUrl, undefined);
    assert.equal(image.hasMedia, true);
    const remote = canvasAgentNodeSummary(node({ metadata: { content: "https://example.com/i.png" } }));
    assert.equal(remote.mediaUrl, "https://example.com/i.png");
});

test("agent task summary exposes status, task id, progress and error", () => {
    const summary = canvasAgentTaskSummary(node({ type: CanvasNodeType.Video, metadata: { status: "loading", videoTaskVideoId: "v1", progress: 42, errorDetails: "oops", content: "https://example.com/v.mp4" } }));
    assert.equal(summary.status, "loading");
    assert.equal(summary.taskId, "v1");
    assert.equal(summary.progress, 42);
    assert.equal(summary.error, "oops");
    assert.equal(summary.mediaUrl, "https://example.com/v.mp4");
});

test("recoverable task id follows the node type", () => {
    assert.equal(canvasRecoverableTaskId(node({ metadata: { videoTaskVideoId: "v1" } })), "");
    assert.equal(canvasRecoverableTaskId(node({ type: CanvasNodeType.Video, metadata: { videoTaskVideoId: "v1" } })), "v1");
    assert.equal(canvasRecoverableTaskId(node({ type: CanvasNodeType.Image, metadata: { imageTaskId: "i1" } })), "i1");
    assert.equal(canvasRecoverableTaskId(node({ type: CanvasNodeType.Audio, metadata: { audioTaskId: "a1" } })), "a1");
    assert.equal(canvasRecoverableTaskId(node({ type: CanvasNodeType.Text })), "");
});

test("video seconds validation respects each model family", () => {
    assert.equal(validateCanvasAgentVideoSeconds("cogvideox-3", 5), "");
    assert.match(validateCanvasAgentVideoSeconds("cogvideox-3", 7), /CogVideoX-3/);
    assert.equal(validateCanvasAgentVideoSeconds("seedance-2-5", 30), "");
    assert.equal(validateCanvasAgentVideoSeconds("seedance-2-5", -1), "");
    assert.match(validateCanvasAgentVideoSeconds("seedance-2-5", 31), /4-30/);
    assert.equal(validateCanvasAgentVideoSeconds("seedance-1-0", 15), "");
    assert.match(validateCanvasAgentVideoSeconds("seedance-1-0", 16), /4-15/);
    assert.equal(validateCanvasAgentVideoSeconds("kling-v3", 15), "");
    assert.match(validateCanvasAgentVideoSeconds("kling-v3", 2), /3-15/);
    assert.equal(validateCanvasAgentVideoSeconds("kling-v2-6", 5), "");
    assert.match(validateCanvasAgentVideoSeconds("kling-v2-6", 7), /5 或 10/);
    assert.equal(validateCanvasAgentVideoSeconds("unknown-model", 30), "");
    assert.match(validateCanvasAgentVideoSeconds("unknown-model", 31), /1-30/);
    assert.match(validateCanvasAgentVideoSeconds("unknown-model", 3.5), /整数秒/);
});

test("video duration hints match the model family", () => {
    assert.match(canvasAgentVideoDurationHint("cogvideox-3").range, /5 或 10/);
    assert.match(canvasAgentVideoDurationHint("seedance-2-5").range, /4-30/);
    assert.match(canvasAgentVideoDurationHint("seedance-1-0").range, /4-15/);
    assert.match(canvasAgentVideoDurationHint("kling-v3").range, /3-15/);
    assert.match(canvasAgentVideoDurationHint("kling-v2-6").range, /5 或 10/);
});
