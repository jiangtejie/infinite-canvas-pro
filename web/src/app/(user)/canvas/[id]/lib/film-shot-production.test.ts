import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData, type CanvasNodeStatus, type FilmShotNodeData } from "../../types";
import type { FilmShotEntry } from "./film-studio-types";
import { defaultFilmShotProductionSelection, planFilmShotProduction } from "./film-shot-production";

const entry = (id: string, patch: Partial<FilmShotNodeData> = {}, status: CanvasNodeStatus = "idle", sceneId = "scene-a", sceneLabel = "第 1 集 · 场景 A"): FilmShotEntry => ({
    shot: {
        id,
        type: CanvasNodeType.Shot,
        title: id,
        position: { x: 0, y: 0 },
        width: 420,
        height: 320,
        metadata: {
            status,
            filmShot: {
                shotNo: id,
                shotType: "中景",
                cameraMovement: "固定",
                duration: 4,
                description: `${id} 描述`,
                dialogue: "",
                audio: "",
                prompt: "",
                ...patch,
            } as FilmShotNodeData,
        },
    } satisfies CanvasNodeData,
    sceneId,
    sceneLabel,
    episodeTitle: "第 1 集",
    index: 0,
});

const shots = () => [
    entry("s1", { imageUrl: "https://example.com/1.png" }),
    entry("s2", { videoUrl: "https://example.com/2.mp4" }),
    entry("s3", {}, "loading"),
    entry("s4", { description: "", prompt: "" }, "idle", "scene-b", "第 1 集 · 场景 B"),
    entry("s5", { videoMode: "frames" }, "idle", "scene-b", "第 1 集 · 场景 B"),
    entry("s6", { lastFailedTaskKind: "image" }, "error"),
];

test("plans image and video queues with per-shot status", () => {
    const image = planFilmShotProduction(shots(), "image");
    assert.deepEqual(image.items.map((item) => [item.shotId, item.status]), [
        ["s1", "done"],
        ["s2", "ready"],
        ["s3", "busy"],
        ["s4", "no-text"],
        ["s5", "ready"],
        ["s6", "failed"],
    ]);
    assert.deepEqual(image.totals, { shots: 6, ready: 3, done: 1, blocked: 2, failed: 1 });
    assert.deepEqual([...defaultFilmShotProductionSelection(image)].sort(), ["s2", "s5", "s6"]);

    const video = planFilmShotProduction(shots(), "video");
    assert.deepEqual(video.items.map((item) => [item.shotId, item.status]), [
        ["s1", "ready"],
        ["s2", "done"],
        ["s3", "busy"],
        ["s4", "no-text"],
        ["s5", "frames"],
        ["s6", "ready"],
    ]);
    assert.deepEqual(video.totals, { shots: 6, ready: 2, done: 1, blocked: 3, failed: 0 });
});

test("groups shots by scene while keeping global item order", () => {
    const plan = planFilmShotProduction(shots(), "image");
    assert.deepEqual(plan.items.map((item) => item.shotId), ["s1", "s2", "s3", "s4", "s5", "s6"]);
    assert.deepEqual(plan.groups.map((group) => [group.sceneId, group.items.map((item) => item.shotId)]), [
        ["scene-a", ["s1", "s2", "s3", "s6"]],
        ["scene-b", ["s4", "s5"]],
    ]);
});
