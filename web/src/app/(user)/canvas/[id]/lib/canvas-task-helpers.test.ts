import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasNodeMetadata } from "../../types";
import {
    canvasImageTaskChildIds,
    canvasImageTaskURLs,
    canvasTaskCompleted,
    canvasTaskFailed,
    canvasTaskMediaURL,
    canvasVideoTaskCompleted,
    canvasVideoTaskFailed,
    canvasVideoTaskFromMetadata,
    canvasVideoTaskId,
    parseCanvasTaskTime,
    parseCanvasVideoTaskSize,
} from "./canvas-task-helpers";

const metadata = (value: Record<string, unknown>) => value as CanvasNodeMetadata;

test("canvas task status recognizes completed and failed states", () => {
    for (const status of ["completed", "COMPLETE", "done", "succeeded", "Success"]) assert.equal(canvasTaskCompleted(status), true);
    for (const status of ["failed", "FAIL", "error", "cancelled", "canceled"]) assert.equal(canvasTaskFailed(status), true);
    assert.equal(canvasTaskCompleted("running"), false);
    assert.equal(canvasTaskFailed("done"), false);
    assert.equal(canvasTaskCompleted(undefined), false);
});

test("video completion accepts a URL even without a finished status", () => {
    assert.equal(canvasVideoTaskCompleted({ video_url: "v.mp4" }), true);
    assert.equal(canvasVideoTaskCompleted({ url: "v.mp4", status: "running" }), true);
    assert.equal(canvasVideoTaskCompleted({ status: "succeeded" }), true);
    assert.equal(canvasVideoTaskCompleted({ status: "running" }), false);
    assert.equal(canvasVideoTaskFailed({ status: "cancelled" }), true);
});

test("task time parses seconds, milliseconds, numeric strings and ISO dates", () => {
    assert.equal(parseCanvasTaskTime(1_700_000_000), 1_700_000_000_000);
    assert.equal(parseCanvasTaskTime(1_700_000_000_000), 1_700_000_000_000);
    assert.equal(parseCanvasTaskTime("1700000000"), 1_700_000_000_000);
    assert.equal(parseCanvasTaskTime("2026-11-02T04:00:00.000Z"), Date.parse("2026-11-02T04:00:00.000Z"));
    assert.equal(parseCanvasTaskTime(""), 0);
    assert.equal(parseCanvasTaskTime("not-a-date"), 0);
});

test("video task size uses the WxH value or the fallback", () => {
    assert.deepEqual(parseCanvasVideoTaskSize("1280x720", { width: 1, height: 2 }), { width: 1280, height: 720 });
    assert.deepEqual(parseCanvasVideoTaskSize("bad", { width: 1, height: 2 }), { width: 1, height: 2 });
    assert.deepEqual(parseCanvasVideoTaskSize(undefined, { width: 3, height: 4 }), { width: 3, height: 4 });
});

test("video task is rebuilt from node metadata", () => {
    const task = canvasVideoTaskFromMetadata(metadata({ videoTaskVideoId: "video-1", videoTaskId: "task-1", model: "kling", status: "running", progress: 30 }));
    assert.equal(task.id, "video-1");
    assert.equal(task.task_id, "task-1");
    assert.equal(task.video_id, "video-1");
    assert.equal(task.model, "kling");
    assert.equal(task.status, "running");
    assert.equal(task.progress, 30);
});

test("video task id prefers video id, then task id, then empty", () => {
    assert.equal(canvasVideoTaskId(metadata({ videoTaskVideoId: "video-1", videoTaskId: "task-1" })), "video-1");
    assert.equal(canvasVideoTaskId(metadata({ videoTaskId: "task-1" })), "task-1");
    assert.equal(canvasVideoTaskId(metadata({})), "");
    assert.equal(canvasVideoTaskId(undefined), "");
});

test("image task urls dedupe, trim and keep order", () => {
    assert.deepEqual(canvasImageTaskURLs({ image_urls: ["a.png", "a.png", " b.png "], image_url: "c.png" }), ["a.png", "b.png", "c.png"]);
    assert.deepEqual(canvasImageTaskURLs({ image_urls: [], image_url: "", url: "" }), []);
});

test("image task builds stable child ids", () => {
    assert.deepEqual(canvasImageTaskChildIds("node-1", { image_urls: ["a.png", "b.png"] }), ["node-1-result-0", "node-1-result-1"]);
});

test("task media url picks the right field per task kind", () => {
    assert.equal(canvasTaskMediaURL({ video_url: "v.mp4", url: "fallback.mp4" }), "v.mp4");
    assert.equal(canvasTaskMediaURL({ image_urls: ["i.png"] }), "i.png");
    assert.equal(canvasTaskMediaURL({ url: "a.mp3" }), "a.mp3");
});
