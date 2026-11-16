import assert from "node:assert/strict";
import test from "node:test";

import type { AiConfig } from "@/stores/use-config-store";
import { filterChannelModelsByCapability } from "@/stores/use-config-store";
import { createTeamoVideoRequestBody, isTeamoVideoConfig, teamoVideoSeconds, teamoVideoSize } from "./teamo";
import { aiVideoPollUrl, createVideoRequestBody } from "./request";
import type { VideoReferenceInput } from "../types";

const config = (overrides: Partial<AiConfig> = {}): AiConfig => ({
    channelMode: "local",
    baseUrl: "https://api.teamorouter.ai",
    apiKey: "sk-teamo",
    model: "seedance-2-0-mini-text-to-video-basic",
    videoModel: "seedance-2-0-mini-text-to-video-basic",
    size: "16:9",
    vquality: "720p",
    videoSeconds: "5",
    localChannels: [],
    ...overrides,
} as AiConfig);

const emptyInput: Required<VideoReferenceInput> = { references: [], videoReferences: [], audioReferences: [], firstFrame: null, lastFrame: null };

test("识别 TeamoRouter 视频渠道，排除 Google 与普通 OpenAI", () => {
    assert.equal(isTeamoVideoConfig(config()), true);
    assert.equal(isTeamoVideoConfig(config({ baseUrl: "https://generativelanguage.googleapis.com" })), false);
    assert.equal(isTeamoVideoConfig(config({ baseUrl: "https://api.openai.com" })), false);
});

test("TeamoRouter 尺寸映射为 WIDTHxHEIGHT", () => {
    assert.equal(teamoVideoSize(config({ size: "16:9" })), "1280x720");
    assert.equal(teamoVideoSize(config({ size: "9:16" })), "720x1280");
    assert.equal(teamoVideoSize(config({ size: "1:1" })), "720x720");
    assert.equal(teamoVideoSize(config({ size: "854x480" })), "854x480");
});

test("TeamoRouter 时长为整数秒并收敛范围", () => {
    assert.equal(teamoVideoSeconds(config({ videoSeconds: "5" })), "5");
    assert.equal(teamoVideoSeconds(config({ videoSeconds: "0" })), "4");
    assert.equal(teamoVideoSeconds(config({ videoSeconds: "99" })), "30");
});

test("TeamoRouter 请求体只含 OpenAI-Videos 标准字段", async () => {
    const body = await createTeamoVideoRequestBody(config(), "seedance-2-0-mini-text-to-video-basic", "一只狗在草地跑", emptyInput);
    assert.deepEqual(Object.keys(body).sort(), ["model", "prompt", "seconds", "size"]);
    assert.equal(body.model, "seedance-2-0-mini-text-to-video-basic");
    assert.equal(body.seconds, "5");
    assert.equal(body.size, "1280x720");
});

test("TeamoRouter 参考图走 input_reference.image_url", async () => {
    const input = { ...emptyInput, references: [{ id: "r1", name: "r1", type: "image/png", dataUrl: "data:image/png;base64,AAAA" }] };
    const body = await createTeamoVideoRequestBody(config(), "m", "p", input);
    assert.deepEqual(body.input_reference, { image_url: "data:image/png;base64,AAAA" });
});

test("TeamoRouter 创建/轮询走 /videos，且 dispatcher 路由到适配器", async () => {
    assert.equal(aiVideoPollUrl(config(), "m", "vid_1"), "https://api.teamorouter.ai/v1/videos/vid_1");
    const body = await createVideoRequestBody(config(), "m", "p", emptyInput);
    assert.equal(body instanceof FormData, false);
    assert.equal((body as Record<string, unknown>).size, "1280x720");
});

test("TeamoRouter 渠道的视频模型按通用名称匹配，Google Gemini 仍仅 veo", () => {
    const teamo = { protocol: "gemini" as const, baseUrl: "https://api.teamorouter.ai", models: ["seedance-2-0-mini-text-to-video-basic", "gemini-3.1-flash-image"] };
    const google = { protocol: "gemini" as const, baseUrl: "https://generativelanguage.googleapis.com", models: ["seedance-2-0-mini-text-to-video-basic", "veo-3.1-generate"] };
    assert.deepEqual(filterChannelModelsByCapability([teamo], "video"), ["seedance-2-0-mini-text-to-video-basic"]);
    assert.deepEqual(filterChannelModelsByCapability([google], "video"), ["veo-3.1-generate"]);
});