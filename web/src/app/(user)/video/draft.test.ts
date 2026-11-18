import assert from "node:assert/strict";
import test from "node:test";

import { isEmptyVideoDraft, serializeVideoDraft, type VideoDraftInput } from "./draft";

const base: VideoDraftInput = {
    prompt: "",
    negativePrompt: "",
    references: [],
    firstFrame: null,
    lastFrame: null,
    videoReferences: [],
    audioReferences: [],
    taskCount: 1,
};

test("video draft keeps storage keys and https urls but drops inline blobs", () => {
    const serialized = serializeVideoDraft({
        ...base,
        prompt: "镜头缓慢推近",
        references: [
            { id: "r1", name: "a.png", type: "image/png", dataUrl: "blob:abc", storageKey: "image:1" },
            { id: "r2", name: "b.png", type: "image/png", dataUrl: "https://cdn.example/b.png" },
            { id: "r3", name: "c.png", type: "image/png", dataUrl: "data:image/png;base64,AAAA" },
        ] as never,
    });

    assert.equal(serialized.prompt, "镜头缓慢推近");
    assert.deepEqual(serialized.references.map((item) => item.id), ["r1", "r2"]);
    assert.equal(serialized.references[0].storageKey, "image:1");
    assert.equal(serialized.references[0].dataUrl, "");
    assert.equal(serialized.references[1].dataUrl, "https://cdn.example/b.png");
});

test("video draft serializes frames like references and keeps nulls", () => {
    const serialized = serializeVideoDraft({
        ...base,
        firstFrame: { id: "f1", name: "first.png", type: "image/png", dataUrl: "blob:f", storageKey: "image:f" } as never,
        lastFrame: { id: "f2", name: "last.png", type: "image/png", dataUrl: "data:image/png;base64,BBBB" } as never,
    });

    assert.equal(serialized.firstFrame?.storageKey, "image:f");
    assert.equal(serialized.firstFrame?.dataUrl, "");
    assert.equal(serialized.lastFrame, null);
});

test("video draft drops media references that only live in memory", () => {
    const serialized = serializeVideoDraft({
        ...base,
        videoReferences: [
            { id: "v1", name: "a.mp4", type: "video/mp4", url: "blob:v", storageKey: "video-reference:1", bytes: 10, durationMs: 3000 },
            { id: "v2", name: "b.mp4", type: "video/mp4", url: "https://cdn.example/b.mp4" },
            { id: "v3", name: "c.mp4", type: "video/mp4", url: "blob:c" },
        ] as never,
        audioReferences: [{ id: "a1", name: "a.mp3", type: "audio/mpeg", url: "blob:a", durationMs: 2000 }] as never,
    });

    assert.deepEqual(serialized.videoReferences.map((item) => item.id), ["v1", "v2"]);
    assert.equal(serialized.videoReferences[0].url, "");
    assert.equal(serialized.videoReferences[0].durationMs, 3000);
    assert.equal(serialized.videoReferences[1].url, "https://cdn.example/b.mp4");
    assert.deepEqual(serialized.audioReferences, []);
});

test("video draft normalizes task count to 1-6", () => {
    assert.equal(serializeVideoDraft({ ...base, taskCount: 0 }).taskCount, 1);
    assert.equal(serializeVideoDraft({ ...base, taskCount: 99 }).taskCount, 6);
    assert.equal(serializeVideoDraft({ ...base, taskCount: 3 }).taskCount, 3);
});

test("video draft is empty until it has text or usable references", () => {
    assert.equal(isEmptyVideoDraft(serializeVideoDraft({ ...base, taskCount: 4 })), true);
    assert.equal(isEmptyVideoDraft(serializeVideoDraft({ ...base, negativePrompt: "模糊" })), false);
    assert.equal(isEmptyVideoDraft(serializeVideoDraft({ ...base, references: [{ id: "r1", name: "a.png", type: "image/png", dataUrl: "", storageKey: "image:1" }] as never })), false);
});
