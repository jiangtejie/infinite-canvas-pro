import assert from "node:assert/strict";
import test from "node:test";

import { dedupeGenerationLogs, dedupeGenerationResults, imageLogIdentityKeys, type GenerationLog, type GenerationResult } from "./history";

const makeLog = (patch: Partial<GenerationLog>): GenerationLog => ({
    id: "log",
    createdAt: 1,
    title: "",
    prompt: "",
    time: "",
    model: "m",
    config: {} as never,
    references: [],
    durationMs: 0,
    successCount: 0,
    failCount: 0,
    imageCount: 0,
    size: "",
    quality: "",
    status: "生成中",
    images: [],
    thumbnails: [],
    errors: [],
    errorDetails: [],
    categoryIds: [],
    ...patch,
});

const makeResult = (patch: Partial<GenerationResult>): GenerationResult => ({
    id: "result",
    status: "pending",
    createdAt: 1,
    prompt: "",
    model: "m",
    config: {} as never,
    references: [],
    ...patch,
});

test("image history merges logs that share a task id and keeps the finished one", () => {
    const pending = makeLog({ id: "log-a", status: "生成中", task: { id: "task-1" } as never });
    const done = makeLog({ id: "log-b", status: "成功", images: [{ id: "img-1" } as never], task: { id: "task-1" } as never });

    const merged = dedupeGenerationLogs([pending, done]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, "成功");
    assert.equal(merged[0].images.length, 1);
});

test("image history keeps logs with different task identities", () => {
    const first = makeLog({ id: "log-a", task: { id: "task-1" } as never });
    const second = makeLog({ id: "log-b", task: { id: "task-2" } as never });

    assert.equal(dedupeGenerationLogs([first, second]).length, 2);
});

test("image history identity keys cover the log id and the task id", () => {
    const log = makeLog({ id: "log-a", task: { id: "task-1" } as never });
    const keys = imageLogIdentityKeys(log);

    assert.ok(keys.includes("log-a"));
    assert.ok(keys.includes("task-1"));
});

test("image history ignores the task id when a task returned multiple images", () => {
    const log = makeLog({ id: "log-a", task: { id: "task-1", image_urls: ["a", "b"] } as never });

    assert.ok(!imageLogIdentityKeys(log).includes("task-1"));
});

test("image history dedupes results and prefers the successful one with an image", () => {
    const pending = makeResult({ id: "r-pending", task: { id: "task-1" } as never });
    const success = makeResult({ id: "r-success", status: "success", image: { id: "img-1" } as never, task: { id: "task-1" } as never });

    const merged = dedupeGenerationResults([pending, success]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, "success");
    assert.equal(merged[0].image?.id, "img-1");
});

test("image history keeps a failed result when nothing better matches", () => {
    const failed = makeResult({ id: "r-failed", status: "failed", error: "boom" });

    assert.equal(dedupeGenerationResults([failed])[0].error, "boom");
});
