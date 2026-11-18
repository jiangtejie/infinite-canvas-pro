import assert from "node:assert/strict";
import test from "node:test";

import { validateVideoRequest } from "./validation";

const baseConfig = (patch: Record<string, unknown> = {}) => ({
    channelMode: "local",
    model: "m",
    videoModel: "m",
    activeChannelId: "c1",
    videoMode: "std",
    videoGenerateAudio: "false",
    videoNegativePrompt: "",
    localChannels: [{ id: "c1", protocol: "apimart", models: ["m"] }],
    ...patch,
}) as never;

const withModel = (model: string, protocol: string, patch: Record<string, unknown> = {}) =>
    baseConfig({ localChannels: [{ id: "c1", protocol, models: [model] }], ...patch });

const input = (patch: Record<string, unknown> = {}) => ({
    config: baseConfig(),
    model: "m",
    prompt: "镜头推近",
    references: [],
    videoReferences: [],
    elementList: undefined,
    configReady: true,
    ...patch,
}) as never;

const image = (id: string) => ({ id, name: `${id}.png`, type: "image/png", dataUrl: "https://cdn/x.png" });

test("video request requires a prompt unless the workflow provides one", () => {
    assert.deepEqual(validateVideoRequest(input({ prompt: "  " })), { tone: "error", message: "请输入视频提示词" });
    const autodl = withModel("m", "autodl");
    assert.equal(validateVideoRequest(input({ config: autodl, prompt: "" })), null);
});

test("video request reports missing configuration separately", () => {
    assert.deepEqual(validateVideoRequest(input({ configReady: false })), { tone: "config", message: "请先完成配置" });
});

test("kling omni modes require their own inputs", () => {
    const imageToVideo = withModel("kling-3-0-omni-image-to-video", "kie");
    assert.equal(validateVideoRequest(input({ config: imageToVideo, model: "kling-3-0-omni-image-to-video" }))?.message, "请添加首帧图片");
    const referenceToVideo = withModel("kling-3-0-omni-reference-to-video", "kie");
    assert.equal(validateVideoRequest(input({ config: referenceToVideo, model: "kling-3-0-omni-reference-to-video" }))?.message, "请添加参考图、参考视频或角色元素");
    const transformation = withModel("kling-3-0-omni-transformation", "kie");
    assert.equal(validateVideoRequest(input({ config: transformation, model: "kling-3-0-omni-transformation" }))?.message, "请添加需要变换的参考视频");
});

test("kling omni reference-to-video accepts a character element as its input", () => {
    const referenceToVideo = withModel("kling-3-0-omni-reference-to-video", "kie");
    const elementList = [{ name: "", description: "", references: [{ id: "e1", kind: "image", name: "a", type: "", url: "https://cdn/a.png" }] }];
    assert.equal(validateVideoRequest(input({ config: referenceToVideo, model: "kling-3-0-omni-reference-to-video", elementList }))?.message, "请填写元素名称");
});

test("kling v2.6 audio generation is restricted to pro mode and one reference", () => {
    const std = withModel("kling-v2-6", "apimart", { videoGenerateAudio: "true", videoMode: "std" });
    assert.equal(validateVideoRequest(input({ config: std, model: "kling-v2-6" }))?.message, "Kling v2.6 音频生成需要 pro 模式");
    const pro = withModel("kling-v2-6", "apimart", { videoGenerateAudio: "true", videoMode: "pro" });
    assert.equal(validateVideoRequest(input({ config: pro, model: "kling-v2-6", references: [image("r1"), image("r2")] }))?.message, "Kling v2.6 开启音频时最多 1 张参考图");
});

test("kling v3 elements must be complete", () => {
    const klingV3 = withModel("kling-v3", "apimart");
    const elementList = [{ name: "", description: "角色", references: [{ id: "e1", kind: "image", name: "a", type: "", url: "https://cdn/a.png" }, { id: "e2", kind: "image", name: "b", type: "", url: "https://cdn/b.png" }] }];
    assert.equal(validateVideoRequest(input({ config: klingV3, model: "kling-v3", elementList }))?.message, "请填写元素名称");
});

test("seedance reference videos keep their duration rules", () => {
    const seedance = withModel("bytedance-seedance-2-0", "openai");
    const issue = validateVideoRequest(input({ config: seedance, model: "bytedance-seedance-2-0", videoReferences: [{ id: "v1", name: "v.mp4", type: "video/mp4", url: "https://cdn/v.mp4", durationMs: 60_000 }] }));
    assert.equal(issue?.tone, "error");
    assert.ok(issue.message.includes("视频1 时长需要在 2-15 秒之间"), issue.message);
});

test("a well formed request passes validation", () => {
    assert.equal(validateVideoRequest(input()), null);
});
