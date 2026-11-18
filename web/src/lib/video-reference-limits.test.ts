import assert from "node:assert/strict";
import test from "node:test";

import { videoFrameReferencesEnabled, videoKlingWorkbench, videoReferenceCapacity, videoReferenceLimits } from "./video-reference-limits";

const config = (patch: Record<string, unknown> = {}) => ({
    channelMode: "local",
    model: "m",
    videoModel: "m",
    activeChannelId: "c1",
    localChannels: [{ id: "c1", protocol: "apimart", models: ["m"] }],
    ...patch,
}) as never;

const withModel = (model: string, protocol: string, patch: Record<string, unknown> = {}) =>
    config({ localChannels: [{ id: "c1", protocol, models: [model] }], ...patch });

const capacity = (value: ReturnType<typeof videoReferenceCapacity>) => ({
    images: value.imageLimit,
    videos: value.videoLimit,
    audios: value.audioLimit,
});

test("video reference limits use ARK sizes only for seedance 2.5 on ark protocol", () => {
    const ark = withModel("doubao-seedance-2-5", "ark");
    assert.equal(videoReferenceLimits(ark, "doubao-seedance-2-5").images, 30);
    assert.equal(videoReferenceLimits(ark, "doubao-seedance-2-5").videos, 10);
    const apimart = withModel("doubao-seedance-2-5", "apimart");
    assert.equal(videoReferenceLimits(apimart, "doubao-seedance-2-5").images, 10);
    const openai = withModel("doubao-seedance-2-0", "openai");
    assert.equal(videoReferenceLimits(openai, "doubao-seedance-2-0").images, 10);
});

test("workflow mode keeps default limits while request-layer semantics stay protocol based", () => {
    const ark = withModel("x-seedance-2-5", "ark", { videoWorkflowRef: { id: "w" } });
    assert.equal(videoReferenceLimits(ark, "x-seedance-2-5").images, 30);
    assert.equal(videoReferenceLimits(ark, "x-seedance-2-5", { workflow: true }).images, 10);
});

test("kling omni capacities follow each mode", () => {
    const cases = [
        ["kling-3-0-omni-text-to-video", { images: 0, videos: 0, audios: 0 }],
        ["kling-3-0-omni-image-to-video", { images: 2, videos: 0, audios: 0 }],
        ["kling-3-0-omni-reference-to-video", { images: 10, videos: 1, audios: 0 }],
        ["kling-3-0-omni-transformation", { images: 4, videos: 1, audios: 0 }],
    ] as const;
    for (const [model, expected] of cases) {
        assert.deepEqual(capacity(videoReferenceCapacity(withModel(model, "kie"), model)), expected, model);
    }
});

test("kling workbench and plain models keep their own capacities", () => {
    assert.deepEqual(capacity(videoReferenceCapacity(withModel("kling-v2-6", "apimart"), "kling-v2-6")), { images: 2, videos: 0, audios: 0 });
    assert.deepEqual(capacity(videoReferenceCapacity(withModel("kling-v3", "apimart"), "kling-v3")), { images: 2, videos: 0, audios: 0 });
    assert.deepEqual(capacity(videoReferenceCapacity(withModel("doubao-seedance-2-0", "openai"), "doubao-seedance-2-0")), { images: 10, videos: 3, audios: 3 });
});

test("kling workbench detection stays on protocol scope", () => {
    assert.deepEqual(videoKlingWorkbench(withModel("kling-v2-6", "apimart"), "kling-v2-6"), { provider: "apimart", variant: "v26" });
    assert.deepEqual(videoKlingWorkbench(withModel("kling-3-0-omni-text-to-video", "kie"), "kling-3-0-omni-text-to-video"), { provider: "kie", variant: "v3" });
    assert.equal(videoKlingWorkbench(withModel("kling-v2-6", "openai"), "kling-v2-6"), null);
});

test("workflow mode disables kling reference rules without hiding stale config", () => {
    const stale = withModel("kling-v2-6", "apimart", { videoWorkflowRef: { id: "w" } });
    assert.deepEqual(videoKlingWorkbench(stale, "kling-v2-6"), { provider: "apimart", variant: "v26" });
    assert.equal(videoKlingWorkbench(stale, "kling-v2-6", { workflow: true }), null);
    assert.equal(videoReferenceCapacity(stale, "kling-v2-6", { workflow: true }).imageLimit, 10);
    assert.equal(videoReferenceCapacity(stale, "kling-v2-6", { workflow: true }).videoLimit, 3);
});

test("frame references are enabled for workflows and supported non-kling models", () => {
    assert.equal(videoFrameReferencesEnabled(withModel("kling-v2-6", "apimart"), "kling-v2-6", { workflow: true }), true);
    assert.equal(videoFrameReferencesEnabled(withModel("kling-v2-6", "apimart", { videoWorkflowRef: { id: "w" } }), "kling-v2-6"), false);
    assert.equal(videoFrameReferencesEnabled(withModel("kling-v2-6", "apimart"), "kling-v2-6"), false);
    assert.equal(videoFrameReferencesEnabled(withModel("kling-3-0-omni-image-to-video", "kie"), "kling-3-0-omni-image-to-video"), false);
    assert.equal(videoFrameReferencesEnabled(withModel("bytedance-seedance-2", "openai"), "bytedance-seedance-2"), true);
    assert.equal(videoFrameReferencesEnabled(withModel("m", "openai"), "m"), false);
});
