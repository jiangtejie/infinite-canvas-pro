import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig, type AiConfig } from "@/stores/use-config-store";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { buildGenerationConfig } from "./canvas-generation-config";

const config = {
    ...defaultConfig,
    model: "base-model",
    imageModel: "image-model",
    videoModel: "video-model",
    audioModel: "audio-model",
    textModel: "text-model",
    imageChannelId: "image-channel",
    videoChannelId: "video-channel",
    audioChannelId: "audio-channel",
    textChannelId: "text-channel",
    activeChannelId: "active-channel",
    size: "1024x1024",
    videoSize: "1280x720",
    quality: "high",
    count: "2",
    canvasImageCount: "",
    videoSeconds: "5",
    audioVoice: "alloy",
} as AiConfig;

const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({ id: "n1", type: CanvasNodeType.Image, title: "n1", position: { x: 0, y: 0 }, width: 320, height: 240, metadata: {}, ...patch });

test("generation config picks mode-specific model and channel", () => {
    const image = buildGenerationConfig(config, undefined, "image");
    assert.equal(image.model, "image-model");
    assert.equal(image.activeChannelId, "image-channel");
    assert.equal(image.size, "1024x1024");
    assert.equal(image.quality, "high");
    assert.equal(image.count, "2");
    const video = buildGenerationConfig(config, undefined, "video");
    assert.equal(video.model, "video-model");
    assert.equal(video.activeChannelId, "video-channel");
    assert.equal(video.size, "1280x720");
    const audio = buildGenerationConfig(config, undefined, "audio");
    assert.equal(audio.model, "audio-model");
    assert.equal(audio.activeChannelId, "audio-channel");
    assert.equal(audio.audioVoice, "alloy");
});

test("node metadata overrides generation config", () => {
    const image = buildGenerationConfig(config, node({ metadata: { model: "node-model", channelId: "node-channel", size: "512x512", quality: "low", count: 3 } }), "image");
    assert.equal(image.model, "node-model");
    assert.equal(image.activeChannelId, "node-channel");
    assert.equal(image.imageChannelId, "node-channel");
    assert.equal(image.size, "512x512");
    assert.equal(image.quality, "low");
    assert.equal(image.count, "3");
});

test("panorama nodes always use the panorama image size", () => {
    const panorama = buildGenerationConfig(config, node({ type: CanvasNodeType.Panorama, metadata: { size: "512x512" } }), "image");
    assert.equal(panorama.size, "2:1");
});
