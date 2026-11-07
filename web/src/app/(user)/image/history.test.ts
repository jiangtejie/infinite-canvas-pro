import assert from "node:assert/strict";
import test from "node:test";

import { dedupeGenerationLogs, dedupeGenerationResults, imageLogIdentityKeys, imageLogsFromTask, parseImageTaskTime, updateResultByLogId, type GenerationLog, type GenerationResult } from "./history";

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
test("image history parses second/millisecond task times with image threshold", () => {
    assert.equal(parseImageTaskTime(1700000000), 1700000000000);
    assert.equal(parseImageTaskTime(1700000000000), 1700000000000);
    assert.equal(parseImageTaskTime("2026-01-02T03:04:05Z"), Date.parse("2026-01-02T03:04:05Z"));
    assert.equal(parseImageTaskTime(""), 0);
    // 图片阈值 1e11：5e11 已超过阈值，按毫秒处理。
    assert.equal(parseImageTaskTime(500000000000), 500000000000);
});

test("image history updates results by log id or task identity", () => {
    const byLogId = makeResult({ id: "r-1", taskLogId: "log-1" });
    const byTask = makeResult({ id: "r-2", task: { id: "task-2" } as never });
    const other = makeResult({ id: "r-3", task: { id: "task-3" } as never });

    const patchedByLog = updateResultByLogId([byLogId, other], "log-1", { status: "stopping" });
    assert.equal(patchedByLog[0].status, "stopping");
    assert.equal(patchedByLog[1].status, "pending");

    const patchedByTask = updateResultByLogId([byTask, other], "other-log", { status: "success", task: { id: "task-2" } as never });
    assert.equal(patchedByTask[0].status, "success");
    assert.equal(patchedByTask[1].status, "pending");
});

test("image history splits parent task images into per-image logs", () => {
    const log = makeLog({ id: "log-parent", createdAt: 10 });
    const task = { id: "task-parent", image_urls: ["https://cdn/a.png", "https://cdn/b.png"], status: "completed" } as never;
    const logs = imageLogsFromTask(log, task);

    assert.equal(logs.length, 2);
    assert.deepEqual(logs.map((item) => item.id), ["log-parent", "log-parent:1"]);
    assert.deepEqual(logs.map((item) => item.task?.id), ["task-parent", "task-parent:1"]);
    assert.deepEqual(logs.map((item) => item.task?.parent_task_id), ["task-parent", "task-parent"]);
    assert.deepEqual(logs.map((item) => item.images[0]?.id), ["task-parent", "task-parent:1"]);
    assert.deepEqual(logs.map((item) => item.images[0]?.dataUrl), ["https://cdn/a.png", "https://cdn/b.png"]);
});

test("image history prefers failed log over newer pending log with same identity", () => {
    const failed = makeLog({ id: "log-failed", createdAt: 1, status: "失败", failCount: 1, task: { id: "task-x" } as never });
    const pending = makeLog({ id: "log-pending", createdAt: 100, status: "生成中", task: { id: "task-x" } as never });

    const merged = dedupeGenerationLogs([pending, failed]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, "失败");
    assert.equal(merged[0].createdAt, 1);
});
