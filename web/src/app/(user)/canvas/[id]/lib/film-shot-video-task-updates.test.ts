import assert from "node:assert/strict";
import test from "node:test";

import type { FilmGenerationContext } from "@/lib/film/types";
import type { VideoResponse } from "@/services/api/video";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { applyFilmShotVideoTaskUpdate, selectFilmShotVideoTaskTargets } from "./film-shot-video-task-updates";

const context = { inputSignature: "sig-video" } as FilmGenerationContext;

const shotNode = (status: "loading" | "success" | "error" = "loading", clientTaskId = "video-client-1"): CanvasNodeData => ({
    id: "shot",
    type: CanvasNodeType.Shot,
    title: "镜头",
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        status,
        clientTaskId,
        filmShotTaskKind: "video",
        filmShot: {
            shotNo: "01",
            shotType: "",
            cameraMovement: "",
            duration: 4,
            description: "雨夜天台",
            dialogue: "",
            audio: "",
            prompt: "雨夜天台",
            pendingTask: { kind: "video", id: "video-task-1", taskId: "task-id-1", videoId: "video-id-1", startedAt: Date.now(), generationContext: context },
        },
    },
});

test("selects loading shot video tasks only", () => {
    const targets = selectFilmShotVideoTaskTargets([shotNode("loading"), shotNode("success")]);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].id, "shot");
});

test("writes a completed video into filmShot versions and clears the task", () => {
    const task = { id: "video-task-1", status: "completed", video_url: "https://example.com/result.mp4", storageKey: "video:result" } as VideoResponse;
    const next = applyFilmShotVideoTaskUpdate([shotNode()], "shot", task, "video-client-1")[0];
    assert.equal(next.metadata?.status, "success");
    assert.equal(next.metadata?.filmShot?.videoUrl, "https://example.com/result.mp4");
    assert.equal(next.metadata?.filmShot?.videoStorageKey, "video:result");
    assert.equal(next.metadata?.filmShot?.videoVersions?.[0]?.generationContext?.inputSignature, "sig-video");
    assert.equal(next.metadata?.filmShot?.pendingTask, undefined);
    assert.equal(next.metadata?.filmShot?.lastFailedTaskKind, undefined);
    assert.equal(next.metadata?.filmShotTaskKind, undefined);
    assert.equal(next.metadata?.clientTaskId, undefined);
});

test("writes failure and ignores stale client task ids", () => {
    const failed = { id: "video-task-1", status: "failed", error: { message: "视频模型失败" } } as VideoResponse;
    const next = applyFilmShotVideoTaskUpdate([shotNode()], "shot", failed, "video-client-1")[0];
    assert.equal(next.metadata?.status, "error");
    assert.equal(next.metadata?.filmShot?.errorMessage, "视频模型失败");
    assert.equal(next.metadata?.filmShot?.lastFailedTaskKind, "video");
    assert.equal(next.metadata?.filmShotTaskKind, undefined);
    assert.equal(next.metadata?.filmShot?.pendingTask, undefined);
    const stale = applyFilmShotVideoTaskUpdate([shotNode()], "shot", failed, "video-client-old")[0];
    assert.equal(stale.metadata?.status, "loading");
});
