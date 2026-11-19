import assert from "node:assert/strict";
import test from "node:test";

import { redactLogMedia } from "./log-redaction";

test("redacts nested image, video and audio data URLs", () => {
    const payload = {
        prompt: "保留",
        images: [{ url: "data:image/png;base64,AAAA" }],
        video: "https://cdn/video.mp4",
        audio: "data:audio/mpeg;base64,BBBB",
        nested: { frame: "data:video/mp4;base64,CCCC", note: "描述里带 data:image/png 片段" },
    };
    redactLogMedia(payload);
    assert.equal(payload.prompt, "保留");
    assert.equal(payload.video, "https://cdn/video.mp4");
    assert.match(payload.images[0].url, /^\[redacted media\/string len=/);
    assert.match(payload.audio, /^\[redacted media\/string len=/);
    assert.match(payload.nested.frame, /^\[redacted media\/string len=/);
    assert.match(payload.nested.note, /^\[redacted media\/string len=/);
});

test("redacts long bare base64 strings but keeps short ones", () => {
    const long = "A".repeat(4096);
    const payload = { long, short: "QUJDRA==" };
    redactLogMedia(payload);
    assert.match(payload.long, /^\[redacted media\/string len=4096\]$/);
    assert.equal(payload.short, "QUJDRA==");
});
