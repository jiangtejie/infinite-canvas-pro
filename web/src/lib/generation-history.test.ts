import assert from "node:assert/strict";
import test from "node:test";

import {
    isClientTaskId,
    isCompletedTaskStatus,
    isFailedTaskStatus,
    isRecoverableTask,
    mergeNormalizedLogs,
    normalizeLogsSafely,
    parseTaskTimestampValue,
    sortByNewest,
    uniqueStrings,
    updateResultsByMatch,
} from "./generation-history";

test("generation history normalizes task timestamps with media thresholds", () => {
    assert.equal(parseTaskTimestampValue(1700000000000), 1700000000000);
    assert.equal(parseTaskTimestampValue(1700000000), 1700000000000);
    assert.equal(parseTaskTimestampValue("2026-01-02T03:04:05Z"), Date.parse("2026-01-02T03:04:05Z"));
    assert.equal(parseTaskTimestampValue("1700000000"), 1700000000000);
    assert.equal(parseTaskTimestampValue(""), 0);
    assert.equal(parseTaskTimestampValue(undefined), 0);
    // 同一秒级数值在不同媒体阈值下解释不同：图片阈值 1e11 视为毫秒，视频默认 1e12 视为秒。
    assert.equal(parseTaskTimestampValue(500000000000, 100000000000), 500000000000);
    assert.equal(parseTaskTimestampValue(500000000000), 500000000000000);
});

test("generation history keeps stopping/stopped patches guarded", () => {
    type Row = { id: string; status: "pending" | "stopping" | "stopped" | "success" };
    const keep = (item: Row, patch: Partial<Row>) => (item.status === "stopping" || item.status === "stopped") && patch.status !== "stopping" && patch.status !== "stopped";
    const rows: Row[] = [
        { id: "a", status: "stopping" },
        { id: "b", status: "stopped" },
        { id: "c", status: "pending" },
    ];
    const patched = updateResultsByMatch(rows, () => true, { status: "success" }, keep);
    assert.deepEqual(patched.map((row) => row.status), ["stopping", "stopped", "success"]);
    assert.deepEqual(updateResultsByMatch(rows, (row) => row.id === "a", { status: "stopped" }, keep).map((row) => row.status), ["stopped", "stopped", "pending"]);
});

test("generation history recovers only unfinished tasks", () => {
    const isCompleted = (task: { status: string }) => task.status === "completed";
    const isFailed = (task: { status: string }) => task.status === "failed";
    assert.equal(isRecoverableTask({ status: "processing" }, isCompleted, isFailed), true);
    assert.equal(isRecoverableTask({ status: "completed" }, isCompleted, isFailed), false);
    assert.equal(isRecoverableTask({ status: "failed" }, isCompleted, isFailed), false);
    assert.equal(isCompletedTaskStatus("SUCCEEDED"), true);
    assert.equal(isFailedTaskStatus("cancelled"), true);
    assert.equal(isFailedTaskStatus("processing"), false);
});

test("generation history skips damaged logs and merges remote/local by keys", async () => {
    const normalized = await normalizeLogsSafely([{ id: "ok" }, { id: "bad" }], async (log) => {
        if (log.id === "bad") throw new Error("damaged");
        return log;
    });
    assert.deepEqual(normalized.map((log) => log.id), ["ok"]);

    const merged = mergeNormalizedLogs(
        [{ id: "remote", createdAt: 2 }],
        [{ id: "kept", createdAt: 1 }, { id: "remote", createdAt: 3 }],
        (log) => [log.id],
        (log, remoteKeys) => !remoteKeys.has(log.id),
        (logs) => logs,
    );
    assert.deepEqual(merged.map((log) => log.id).sort(), ["kept", "remote"]);
    assert.equal(merged.find((log) => log.id === "remote")?.createdAt, 2);
});

test("generation history shared string helpers", () => {
    assert.deepEqual(uniqueStrings([" a ", "", undefined, null, "a", "b"]), ["a", "b"]);
    assert.equal(isClientTaskId("client_video_task_1", "client_video_task_"), true);
    assert.equal(isClientTaskId("task-1", "client_video_task_"), false);
    assert.deepEqual(sortByNewest([{ id: "a", createdAt: 1 }, { id: "b", createdAt: 3 }, { id: "c" }]).map((item) => item.id), ["b", "a", "c"]);
});
