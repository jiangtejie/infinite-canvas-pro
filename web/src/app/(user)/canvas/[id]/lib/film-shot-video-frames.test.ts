import assert from "node:assert/strict";
import test from "node:test";

import type { ReferenceImage } from "@/types/image";
import { filmFrameReady, filmVideoFrameBlockReason, filmVideoInput, filmVideoMode } from "./film-shot-video-frames";

const image = (id: string): ReferenceImage => ({ id, name: `${id}.jpg`, type: "image/jpeg", dataUrl: "data:image/jpeg;base64,AA" });

test("normalizes the video mode and validates the first frame", () => {
    assert.equal(filmVideoMode(undefined), "reference");
    assert.equal(filmVideoMode({ videoMode: "frames" }), "frames");
    assert.equal(filmFrameReady({ kind: "storyboard", url: "https://example.com/first.png" }), true);
    assert.equal(filmFrameReady({ kind: "upload", url: "", storageKey: "image:first" }), true);
    assert.equal(filmFrameReady({ kind: "storyboard", url: "" }), false);
    assert.equal(filmVideoFrameBlockReason("frames", undefined), "首尾帧模式需要先选择首帧");
    assert.equal(filmVideoFrameBlockReason("reference", undefined), "");
    assert.equal(filmVideoFrameBlockReason("frames", { kind: "storyboard", url: "https://example.com/first.png" }), "");
});

test("builds frames or reference video inputs", () => {
    const images = [image("shot-first"), image("shot-last"), image("character")];
    assert.deepEqual(filmVideoInput("frames", images, "shot"), {
        firstFrame: images[0],
        lastFrame: images[1],
    });
    assert.deepEqual(filmVideoInput("frames", [image("character")], "shot"), {
        firstFrame: null,
        lastFrame: null,
    });
    assert.deepEqual(filmVideoInput("reference", images, "shot"), { references: images });
});
