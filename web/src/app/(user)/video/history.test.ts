import assert from "node:assert/strict";
import test from "node:test";

import { dedupeVideoLogs, videoLogIdentityKeys, type GenerationLog } from "./history";

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
