import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasAudioTask } from "@/services/api/audio";
import type { CanvasImageTask } from "@/services/api/image";
import type { VideoResponse } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { applyCanvasAudioTaskUpdate, applyCanvasImageTaskConnections, applyCanvasImageTaskUpdate, applyCanvasVideoTaskUpdate, fitCanvasMediaNode, resetInterruptedGeneration } from "./canvas-task-updates";

const config = {
    model: "test-model",
    size: "1024x1024",
    videoSeconds: "5",
    vquality: "high",
    videoMode: "pro",
    videoNegativePrompt: "",
    videoGenerateAudio: false,
    videoCharacterOrientation: "",
    videoWatermark: false,
} as unknown as AiConfig;

const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "n1",
    type: CanvasNodeType.Video,
    title: "测试节点",
    position: { x: 100, y: 100 },
    width: 300,
    height: 200,
    metadata: { status: "loading" },
    ...patch,
});

const videoTask = (patch: Record<string, unknown>) => ({ id: "task-1", status: "completed", ...patch }) as unknown as VideoResponse;
const audioTask = (patch: Record<string, unknown>) => ({ id: "audio-1", status: "completed", ...patch }) as unknown as CanvasAudioTask;

test("video task completion fills media metadata and keeps aspect ratio", () => {
    const current = node({ metadata: { status: "loading", clientTaskId: "client-1" } });
    const next = applyCanvasVideoTaskUpdate([current], "n1", videoTask({ video_url: "https://example.com/v.mp4", size: "1280x720", started_at: 1_700_000_000 }), config, 1_000, { width: 300, height: 200 }, "client-1");
    assert.equal(next[0].metadata?.content, "https://example.com/v.mp4");
    assert.equal(next[0].metadata?.status, "success");
    assert.equal(next[0].metadata?.mimeType, "video/mp4");
    assert.equal(next[0].metadata?.progress, 100);
    assert.equal(next[0].metadata?.videoTaskId, "task-1");
    assert.ok(Math.abs(next[0].width / next[0].height - 16 / 9) < 0.01);
});

test("video task ignores a different client task id", () => {
    const nodes = [node({ metadata: { status: "loading", clientTaskId: "other" } })];
    assert.equal(applyCanvasVideoTaskUpdate(nodes, "n1", videoTask({ video_url: "v.mp4" }), config, 1_000, { width: 300, height: 200 }, "client-1"), nodes);
});

test("video task keeps stopped nodes untouched", () => {
    const nodes = [node({ metadata: { status: "stopped" } })];
    assert.equal(applyCanvasVideoTaskUpdate(nodes, "n1", videoTask({ video_url: "v.mp4" }), config, 1_000, { width: 300, height: 200 }), nodes);
});

test("completed video without a URL is reported as an error", () => {
    const next = applyCanvasVideoTaskUpdate([node()], "n1", videoTask({ status: "completed", video_url: "" }), config, 1_000, { width: 300, height: 200 });
    assert.equal(next[0].metadata?.status, "error");
    assert.equal(next[0].metadata?.errorDetails, "视频生成完成但没有返回视频地址");
});

test("audio task completion fills the audio metadata", () => {
    const next = applyCanvasAudioTaskUpdate([node({ type: CanvasNodeType.Audio })], "n1", audioTask({ audio_url: "https://example.com/a.mp3", bytes: 1234, mimeType: "audio/mpeg" }), 1_000);
    assert.equal(next[0].metadata?.content, "https://example.com/a.mp3");
    assert.equal(next[0].metadata?.status, "success");
    assert.equal(next[0].metadata?.audioTaskId, "audio-1");
    assert.equal(next[0].metadata?.bytes, 1234);
    assert.equal(next[0].metadata?.mimeType, "audio/mpeg");
});

test("fitCanvasMediaNode adjusts a matching image or video node", () => {
    const current = node({ type: CanvasNodeType.Video, metadata: { status: "success", content: "https://example.com/v.mp4" } });
    const next = fitCanvasMediaNode(current, { content: "https://example.com/v.mp4", width: 1280, height: 720 });
    assert.equal(next.metadata?.naturalWidth, 1280);
    assert.equal(next.metadata?.naturalHeight, 720);
    assert.ok(Math.abs(next.width / next.height - 16 / 9) < 0.01);
});

test("fitCanvasMediaNode ignores non-media or mismatched nodes", () => {
    const textNode = node({ type: CanvasNodeType.Text, metadata: { status: "success", content: "hello" } });
    assert.equal(fitCanvasMediaNode(textNode, { content: "hello", width: 1280, height: 720 }), textNode);
    const videoNode = node({ metadata: { content: "other.mp4" } });
    assert.equal(fitCanvasMediaNode(videoNode, { content: "v.mp4", width: 1280, height: 720 }), videoNode);
});

const imageTask = (patch: Record<string, unknown>) => ({ id: "image-1", status: "completed", ...patch }) as unknown as CanvasImageTask;

test("single image completion fills the node metadata", () => {
    const current = node({ type: CanvasNodeType.Image, metadata: { status: "loading", clientTaskId: "client-1", size: "1024x1024" } });
    const next = applyCanvasImageTaskUpdate([current], "n1", imageTask({ image_url: "https://example.com/i.png", width: 1024, height: 1024 }), 1_000, { width: 1024, height: 1024 }, "client-1");
    assert.equal(next[0].metadata?.content, "https://example.com/i.png");
    assert.equal(next[0].metadata?.status, "success");
    assert.equal(next[0].metadata?.imageTaskId, "image-1");
    assert.equal(next[0].metadata?.naturalWidth, 1024);
    assert.equal(next[0].metadata?.naturalHeight, 1024);
});

test("completed image without a URL is reported as an error", () => {
    const next = applyCanvasImageTaskUpdate([node({ type: CanvasNodeType.Image })], "n1", imageTask({ status: "completed", image_url: "" }), 1_000, { width: 1024, height: 1024 });
    assert.equal(next[0].metadata?.status, "error");
    assert.equal(next[0].metadata?.errorDetails, "图片生成失败");
});

test("workflow image batch fills its root and child nodes", () => {
    const root = node({ id: "root", type: CanvasNodeType.Image, title: "批次", metadata: { isBatchRoot: true, batchChildIds: ["n1"] } });
    const child = node({ id: "n1", type: CanvasNodeType.Image, metadata: { status: "loading", batchRootId: "root", clientTaskId: "client-1" } });
    const task = imageTask({ source: "workflow", image_urls: ["https://example.com/1.png", "https://example.com/2.png"] });
    const next = applyCanvasImageTaskUpdate([root, child], "n1", task, 1_000, { width: 512, height: 512 }, "client-1");
    const rootAfter = next.find((item) => item.id === "root");
    const extra = next.find((item) => item.id === "n1-result-1");
    assert.deepEqual(rootAfter?.metadata?.batchChildIds, ["n1", "n1-result-1"]);
    assert.equal(rootAfter?.metadata?.primaryImageId, "n1");
    assert.equal(rootAfter?.metadata?.content, "https://example.com/1.png");
    assert.equal(extra?.metadata?.content, "https://example.com/2.png");
    assert.equal(extra?.metadata?.batchRootId, "root");
});

test("workflow batch connections are rebuilt from the root", () => {
    const task = imageTask({ source: "workflow", image_urls: ["https://example.com/1.png", "https://example.com/2.png"] });
    const connections: CanvasConnection[] = [{ id: "old", fromNodeId: "root", toNodeId: "n1-result-9" }];
    const next = applyCanvasImageTaskConnections(connections, "n1", task, "root");
    assert.deepEqual(next.map((connection) => [connection.fromNodeId, connection.toNodeId]), [["root", "n1"], ["root", "n1-result-1"]]);
});

test("layer decomposition adds child connections", () => {
    const task = imageTask({ source: "direct", model: "seedream/5-pro-layer-decomposition", image_urls: ["https://example.com/1.png", "https://example.com/2.png"] });
    const next = applyCanvasImageTaskConnections([], "n1", task);
    assert.deepEqual(next.map((connection) => connection.toNodeId), ["n1-result-0", "n1-result-1"]);
});

test("resetInterruptedGeneration marks only loading nodes without a recoverable task", () => {
    const orphan = node({ metadata: { status: "loading" } });
    const recoverable = node({ type: CanvasNodeType.Video, metadata: { status: "loading", videoTaskVideoId: "v1" } });
    const success = node({ metadata: { status: "success" } });
    const next = resetInterruptedGeneration([orphan, recoverable, success]);
    assert.equal(next[0].metadata?.status, "error");
    assert.match(next[0].metadata?.errorDetails || "", /生成已中断/);
    assert.equal(next[1].metadata?.status, "loading");
    assert.equal(next[2].metadata?.status, "success");
});
