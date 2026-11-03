import assert from "node:assert/strict";
import test from "node:test";

import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import type { NodeGenerationInput } from "../../components/canvas-node-generation";
import { applyNodeConfigPatch, audioExtension, audioMetadata, buildImageGenerationMetadata, buildImportedVideoNode, getGenerationCount, getInputSummary, getNextDirectorOutputY, imageExtension, imageMetadata, referenceUrl, videoMetadata } from "./canvas-node-builders";

const node = (id: string, type: CanvasNodeType, patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: {},
    ...patch,
});

const reference = (patch: Partial<ReferenceImage>): ReferenceImage => ({ id: "r", dataUrl: "", ...patch } as ReferenceImage);

test("image and audio extensions fall back predictably", () => {
    assert.equal(imageExtension("data:image/webp;base64,abc"), "webp");
    assert.equal(imageExtension("https://example.com/a.jpg"), "png");
    assert.equal(audioExtension("audio/wav"), "wav");
    assert.equal(audioExtension("audio/ogg; codecs=opus"), "opus");
    assert.equal(audioExtension("audio/aac"), "aac");
    assert.equal(audioExtension("audio/flac"), "flac");
    assert.equal(audioExtension(undefined), "mp3");
});

test("uploaded media metadata keeps url, storage key and dimensions", () => {
    const image = imageMetadata({ url: "https://example.com/i.png", storageKey: "img-key", width: 640, height: 480, bytes: 12, mimeType: "image/png" } as never);
    assert.deepEqual(image, { content: "https://example.com/i.png", storageKey: "img-key", status: "success", naturalWidth: 640, naturalHeight: 480, bytes: 12, mimeType: "image/png" });
    const video = videoMetadata({ url: "https://example.com/v.mp4", width: 1280, height: 720, bytes: 20 } as never);
    assert.equal(video.mimeType, "video/mp4");
    assert.equal(video.naturalWidth, 1280);
    const audio = audioMetadata({ url: "https://example.com/a.mp3", bytes: 30 } as never);
    assert.equal(audio.mimeType, "audio/mpeg");
    assert.equal(audio.bytes, 30);
});

test("imported video node is centered and fitted to the max size", () => {
    const videoNode = buildImportedVideoNode({ url: "https://example.com/v.mp4", width: 1920, height: 1080, bytes: 10 } as never, "测试视频", { x: 500, y: 400 });
    assert.equal(videoNode.type, CanvasNodeType.Video);
    assert.equal(videoNode.title, "测试视频");
    assert.equal(videoNode.metadata?.content, "https://example.com/v.mp4");
    assert.ok(videoNode.width <= 420 && videoNode.height <= 420);
    assert.ok(Math.abs(videoNode.position.x + videoNode.width / 2 - 500) < 0.01);
    assert.ok(Math.abs(videoNode.position.y + videoNode.height / 2 - 400) < 0.01);
});

test("director output Y only follows image and video children", () => {
    const director = node("director", CanvasNodeType.Director, { position: { x: 0, y: 100 } });
    const image = node("image", CanvasNodeType.Image, { position: { x: 300, y: 200 }, height: 100 });
    const video = node("video", CanvasNodeType.Video, { position: { x: 300, y: 400 }, height: 120 });
    const text = node("text", CanvasNodeType.Text, { position: { x: 300, y: 900 } });
    const connections: CanvasConnection[] = [
        { id: "c1", fromNodeId: "director", toNodeId: "image" },
        { id: "c2", fromNodeId: "director", toNodeId: "video" },
        { id: "c3", fromNodeId: "director", toNodeId: "text" },
    ];
    assert.equal(getNextDirectorOutputY(director, [director, image, video, text], connections), 556);
    assert.equal(getNextDirectorOutputY(director, [director], []), 100);
});

test("image generation metadata resolves reference urls and filters data urls", () => {
    const config = { model: "m", imageChannelId: "", activeChannelId: "channel-1", size: "1024x1024", quality: "high" } as unknown as AiConfig;
    const metadata = buildImageGenerationMetadata("generation", config, 2, [reference({ url: "https://example.com/1.png" }), reference({ storageKey: "key-2" }), reference({ dataUrl: "data:image/png;base64,abc" })]);
    assert.equal(metadata.generationType, "generation");
    assert.equal(metadata.model, "m");
    assert.equal(metadata.channelId, "channel-1");
    assert.equal(metadata.count, 2);
    assert.deepEqual(metadata.references, ["https://example.com/1.png", "key-2"]);
});

test("reference url prefers storage key, then url, then remote data url", () => {
    assert.equal(referenceUrl(reference({ storageKey: "k", url: "u" })), "k");
    assert.equal(referenceUrl(reference({ url: "u" })), "u");
    assert.equal(referenceUrl(reference({ dataUrl: "https://example.com/i.png" })), "https://example.com/i.png");
    assert.equal(referenceUrl(reference({ dataUrl: "data:image/png;base64,abc" })), undefined);
});

test("generation count clamps to 1-15 and handles bad input", () => {
    assert.equal(getGenerationCount("3"), 3);
    assert.equal(getGenerationCount("0"), 1);
    assert.equal(getGenerationCount("-4"), 4);
    assert.equal(getGenerationCount("99"), 15);
    assert.equal(getGenerationCount("abc"), 1);
});

test("config patch resizes an empty image node and keeps it centered", () => {
    const image = node("image", CanvasNodeType.Image, { position: { x: 100, y: 100 }, width: 400, height: 300 });
    const next = applyNodeConfigPatch(image, { size: "16:9" });
    assert.equal(next.metadata?.size, "16:9");
    assert.ok(Math.abs(next.width / next.height - 16 / 9) < 0.01);
    assert.ok(Math.abs(next.position.x + next.width / 2 - 300) < 0.01);
    assert.ok(Math.abs(next.position.y + next.height / 2 - 250) < 0.01);
});

test("panorama config patch forces the panorama ratio", () => {
    const panorama = node("panorama", CanvasNodeType.Panorama, { width: 400, height: 200 });
    const next = applyNodeConfigPatch(panorama, { size: "16:9" });
    assert.equal(next.metadata?.size, "2:1");
    assert.equal(next.width, 400);
});

test("config patch does not resize nodes that already have content", () => {
    const image = node("image", CanvasNodeType.Image, { width: 400, height: 300, metadata: { content: "https://example.com/i.png" } });
    const next = applyNodeConfigPatch(image, { size: "16:9" });
    assert.equal(next.width, 400);
    assert.equal(next.metadata?.size, "16:9");
});

test("input summary counts each input type", () => {
    const inputs = [{ type: "text" }, { type: "image" }, { type: "image" }, { type: "video" }, { type: "audio" }] as NodeGenerationInput[];
    assert.deepEqual(getInputSummary(inputs), { textCount: 1, imageCount: 2, videoCount: 1, audioCount: 1 });
});
