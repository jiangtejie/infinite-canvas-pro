import assert from "node:assert/strict";
import test from "node:test";

import type { FilmGenerationContext } from "@/lib/film/types";
import type { CanvasImageTask } from "@/services/api/image";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { applyFilmShotImageTaskUpdate, selectFilmShotImageTaskTargets } from "./film-shot-task-updates";

const context = { inputSignature: "sig-1" } as FilmGenerationContext;

const shotNode = (status: "loading" | "success" | "error" = "loading", clientTaskId = "client-1"): CanvasNodeData => ({
    id: "shot",
    type: CanvasNodeType.Shot,
    title: "镜头",
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        status,
        clientTaskId,
        imageTaskId: "task-1",
        filmShotTaskKind: "image",
        filmShot: {
            shotNo: "01",
            shotType: "",
            cameraMovement: "",
            duration: 4,
            description: "雨夜天台",
            dialogue: "",
            audio: "",
            prompt: "雨夜天台",
            pendingTask: { kind: "image", id: clientTaskId, startedAt: Date.now(), generationContext: context },
        },
    },
});

test("selects loading shot image tasks only", () => {
    const targets = selectFilmShotImageTaskTargets([shotNode("loading"), shotNode("success")]);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].id, "shot");
});

test("writes a completed image into filmShot versions and clears the task", () => {
    const task = { id: "task-1", status: "completed", image_url: "https://example.com/result.png", storageKey: "image:result" } as CanvasImageTask;
    const next = applyFilmShotImageTaskUpdate([shotNode()], "shot", task, "client-1");
    const node = next[0];
    assert.equal(node.metadata?.status, "success");
    assert.equal(node.metadata?.filmShot?.imageUrl, "https://example.com/result.png");
    assert.equal(node.metadata?.filmShot?.storageKey, "image:result");
    assert.equal(node.metadata?.filmShot?.imageVersions?.[0]?.generationContext?.inputSignature, "sig-1");
    assert.equal(node.metadata?.filmShot?.pendingTask, undefined);
    assert.equal(node.metadata?.filmShot?.lastFailedTaskKind, undefined);
    assert.equal(node.metadata?.filmShotTaskKind, undefined);
    assert.equal(node.metadata?.imageTaskId, undefined);
});

test("writes failure and ignores stale client task ids", () => {
    const failed = { id: "task-1", status: "failed", error: { message: "模型失败" } } as CanvasImageTask;
    const next = applyFilmShotImageTaskUpdate([shotNode()], "shot", failed, "client-1")[0];
    assert.equal(next.metadata?.status, "error");
    assert.equal(next.metadata?.filmShot?.errorMessage, "模型失败");
    assert.equal(next.metadata?.filmShot?.lastFailedTaskKind, "image");
    assert.equal(next.metadata?.filmShotTaskKind, undefined);
    assert.equal(next.metadata?.filmShot?.pendingTask, undefined);
    const stale = applyFilmShotImageTaskUpdate([shotNode()], "shot", failed, "client-old");
    assert.equal(stale[0].metadata?.status, "loading");
});
