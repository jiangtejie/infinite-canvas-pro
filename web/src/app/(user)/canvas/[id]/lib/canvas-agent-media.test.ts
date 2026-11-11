import assert from "node:assert/strict";
import test from "node:test";

import type { AiConfig } from "@/stores/use-config-store";

import { CanvasNodeType } from "../../types";
import { buildAgentMediaPlan } from "./canvas-agent-media";

const baseConfig = (patch: Record<string, unknown> = {}) => ({
    imageModel: "gpt-image-2",
    videoModel: "seedance-1-0",
    audioModel: "generic-tts",
    quality: "high",
    size: "1024x1024",
    count: "1",
    canvasImageCount: "1",
    vquality: "720p",
    videoSize: "16:9",
    videoSeconds: "5",
    videoGenerateAudio: "false",
    audioVoice: "alloy",
    audioInstructions: "",
    activeChannelId: "c1",
    imageChannelId: "c1",
    videoChannelId: "c1",
    audioChannelId: "c1",
    ...patch,
}) as unknown as AiConfig;

const planInput = (patch: Record<string, unknown> = {}) => ({
    mode: "image" as const,
    requestId: "act-1",
    config: baseConfig(),
    isAiConfigReady: () => true,
    hasToken: true,
    prompt: "海边的女孩，逆光",
    ...patch,
});

test("image plan builds node metadata with request id and generation settings", () => {
    const plan = buildAgentMediaPlan(planInput());
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.targetType, CanvasNodeType.Image);
    assert.equal(plan.metadata.agentRequestId, "act-1");
    assert.equal(plan.metadata.model, "gpt-image-2");
    assert.equal(plan.metadata.channelId, "c1");
    assert.equal(plan.metadata.quality, "high");
    assert.equal(plan.metadata.count, 1);
    assert.equal(plan.metadata.excludeUpstreamText, true);
    assert.equal(plan.title, "海边的女孩，逆光");
});

test("missing model configuration is reported before creating a node", () => {
    const plan = buildAgentMediaPlan(planInput({ config: baseConfig({ imageModel: "" }), isAiConfigReady: () => false }));
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "model_not_configured");
});

test("workflow generation without login is rejected", () => {
    const plan = buildAgentMediaPlan(planInput({ config: baseConfig({ imageWorkflowRef: { id: "w1" } }), hasToken: false }));
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "login_required");
});

test("video plan validates duration and audio capability", () => {
    const invalid = buildAgentMediaPlan(planInput({ mode: "video", config: baseConfig({ videoModel: "cogvideox-3" }), seconds: 7 }));
    assert.equal(invalid.ok, false);
    if (invalid.ok) return;
    assert.equal(invalid.code, "unsupported_duration");

    const plan = buildAgentMediaPlan(planInput({ mode: "video", seconds: 10, generateAudio: false }));
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.targetType, CanvasNodeType.Video);
    assert.equal(plan.metadata.seconds, "10");
    assert.equal(plan.metadata.generateAudio, "false");
    assert.equal(plan.metadata.vquality, "720p");
});

test("video plan rejects native audio when the model does not support it", () => {
    const plan = buildAgentMediaPlan(planInput({ mode: "video", config: baseConfig({ videoModel: "agnes-video-2-5" }), seconds: 5, generateAudio: true }));
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "video_audio_not_supported");
});

test("audio plan falls back to configured voice and honors the tool override", () => {
    const plan = buildAgentMediaPlan(planInput({ mode: "audio", prompt: "欢迎收听", title: "旁白" }));
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.targetType, CanvasNodeType.Audio);
    assert.equal(plan.metadata.audioVoice, "alloy");
    assert.equal(plan.title, "旁白");

    const override = buildAgentMediaPlan(planInput({ mode: "audio", voice: "nova", instructions: "温柔" }));
    assert.equal(override.ok, true);
    if (!override.ok) return;
    assert.equal(override.metadata.audioVoice, "nova");
    assert.equal(override.metadata.audioInstructions, "温柔");
});
