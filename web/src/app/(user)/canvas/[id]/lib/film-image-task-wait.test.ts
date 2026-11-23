import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasImageTask } from "@/services/api/image";
import { waitForCanvasImageTask } from "./film-image-task-wait";

const task = (status: string, patch: Partial<CanvasImageTask> = {}): CanvasImageTask => ({ id: "task-1", status, ...patch } as CanvasImageTask);

test("waits until the image task reaches a terminal state and reports progress", async () => {
    let progress = 0;
    const result = await waitForCanvasImageTask(task("pending"), {
        signal: new AbortController().signal,
        poll: async () => task("completed", { progress: 42, image_urls: ["https://example.com/a.png"] }),
        sleep: async () => undefined,
        now: () => 0,
        onProgress: (value) => { progress = value; },
    });
    assert.equal(result.status, "completed");
    assert.equal(progress, 42);
});

test("returns failed tasks to the caller instead of looping forever", async () => {
    const result = await waitForCanvasImageTask(task("pending"), {
        signal: new AbortController().signal,
        poll: async () => task("failed"),
        sleep: async () => undefined,
        now: () => 0,
    });
    assert.equal(result.status, "failed");
});

test("throws the caller timeout message instead of polling past the deadline", async () => {
    let time = 0;
    let calls = 0;
    await assert.rejects(() => waitForCanvasImageTask(task("pending"), {
        signal: new AbortController().signal,
        poll: async () => { calls += 1; return task("pending"); },
        sleep: async () => { time = 10; },
        now: () => time,
        timeoutMs: 5,
        timeoutMessage: "九宫格预览生成超时",
    }), /九宫格预览生成超时/);
    assert.equal(calls, 1);
});
