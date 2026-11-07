import assert from "node:assert/strict";
import test from "node:test";

import { dedupeVideoLogs, mergeBackendTaskIntoLog, mergeDuplicateVideoLog, mergePendingLogResults, parseTaskTimestamp, shouldPreferVideoLog, updateResultByLogId, videoLogBackendMergeKeys, videoLogIdentityKeys, videoLogScore, videoTaskIdentityKeys, type GenerationLog, type GenerationResult } from "./history";

const makeLog = (patch: Partial<GenerationLog>): GenerationLog => ({ ...({} as GenerationLog), ...patch });

test("video history merges logs that share a backend task id", () => {
    const pending = makeLog({ id: "log-a", status: "生成中", task: { id: "task-1" } as never, createdAt: 1 });
    const done = makeLog({ id: "log-b", status: "成功", task: { id: "task-1" } as never, video: { id: "video-1", url: "u" } as never, createdAt: 2 });

    const merged = dedupeVideoLogs([pending, done]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].video?.id, "video-1");
});

test("video history keeps logs for different tasks", () => {
    const first = makeLog({ id: "log-a", task: { id: "task-1" } as never, createdAt: 1 });
    const second = makeLog({ id: "log-b", task: { id: "task-2" } as never, createdAt: 2 });

    assert.equal(dedupeVideoLogs([first, second]).length, 2);
});

test("video history identity keys cover the task id and the video id", () => {
    const log = makeLog({ id: "log-a", task: { id: "task-1" } as never, video: { id: "video-1", url: "u" } as never });
    const keys = videoLogIdentityKeys(log);

    assert.ok(keys.includes("task-1"));
    assert.ok(keys.includes("video-1"));
});

test("video history keeps a stopped log as is", () => {
    const stopped = makeLog({ id: "log-a", status: "已停止", task: { id: "task-1" } as never, createdAt: 2 });

    assert.equal(dedupeVideoLogs([stopped])[0].status, "已停止");
});
test("video history parses task timestamps with video threshold", () => {
    assert.equal(parseTaskTimestamp(1700000000), 1700000000000);
    assert.equal(parseTaskTimestamp(1700000000000), 1700000000000);
    assert.equal(parseTaskTimestamp("2026-01-02T03:04:05Z"), Date.parse("2026-01-02T03:04:05Z"));
    assert.equal(parseTaskTimestamp(""), 0);
    // 视频阈值 1e12：5e11 视为秒级时间戳。
    assert.equal(parseTaskTimestamp(500000000000), 500000000000000);
});

test("video history keeps stopping/stopped results against normal updates", () => {
    const stopping = { id: "r-1", taskLogId: "log-1", status: "stopping" } as unknown as GenerationResult;
    const patched = updateResultByLogId([stopping], "log-1", { status: "pending" });
    assert.equal(patched[0].status, "stopping");

    const confirmed = updateResultByLogId([stopping], "log-1", { status: "stopped" });
    assert.equal(confirmed[0].status, "stopped");

    const normal = { id: "r-2", taskLogId: "log-2", status: "pending" } as unknown as GenerationResult;
    assert.equal(updateResultByLogId([normal], "log-2", { status: "success" })[0].status, "success");
});

test("video history ignores unbound client task ids in identity keys", () => {
    assert.deepEqual(videoTaskIdentityKeys({ id: "client_video_task_1" } as never), []);
    assert.deepEqual(videoTaskIdentityKeys({ id: "client_video_task_1", request_body: "{}" } as never), ["client_video_task_1"]);
    assert.deepEqual(videoTaskIdentityKeys({ id: "server-task-1" } as never), ["server-task-1"]);

    const localClientLog = { id: "log-a", task: { id: "client_video_task_1" } } as unknown as GenerationLog;
    assert.ok(videoLogBackendMergeKeys(localClientLog).includes("client_video_task_1"));
});

test("video history scores stopped tasks above completed ones when merging duplicates", () => {
    const stopped = makeLog({ id: "log-stopped", status: "已停止", createdAt: 1, config: {} as never });
    const success = makeLog({ id: "log-success", status: "成功", createdAt: 9, video: { id: "video-1", url: "u" } as never, config: {} as never });

    assert.ok(videoLogScore(stopped) > videoLogScore(success));
    assert.equal(shouldPreferVideoLog(stopped, success), true);
    assert.equal(mergeDuplicateVideoLog(success, stopped).status, "已停止");
});

test("video history keeps stopped/completed logs when merging backend tasks", () => {
    const stopped = makeLog({ id: "log-a", status: "已停止", createdAt: 2, durationMs: 5, task: { id: "task-1" } as never, config: {} as never });
    const incoming = makeLog({ id: "backend-1", status: "成功", createdAt: 3, task: { id: "task-1" } as never, video: { id: "video-1", url: "u" } as never, config: {} as never });
    assert.equal(mergeBackendTaskIntoLog(stopped, incoming, incoming.task!).status, "已停止");

    const completed = makeLog({ id: "log-b", status: "成功", createdAt: 1, video: { id: "video-0", url: "u0" } as never, config: {} as never });
    const failedUpdate = makeLog({ id: "backend-2", status: "失败", createdAt: 4, config: {} as never });
    const merged = mergeBackendTaskIntoLog(completed, failedUpdate, failedUpdate.task!);
    assert.equal(merged.status, "成功");
    assert.equal(merged.video?.id, "video-0");
});

test("video history does not downgrade a stopped result while merging pending logs", () => {
    const stoppedResult = { id: "log-a", taskLogId: "log-a", status: "stopped" } as unknown as GenerationResult;
    const pendingLog = makeLog({ id: "log-a", status: "生成中", task: { id: "task-1" } as never, config: {} as never });

    const merged = mergePendingLogResults([stoppedResult], [pendingLog]);

    assert.equal(merged[0].status, "stopped");
});
