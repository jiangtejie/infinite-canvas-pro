import assert from "node:assert/strict";
import test from "node:test";

import type { FilmShotGroup } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import type { FilmShotEntry } from "./film-studio-types";
import { createFilmShotGroup, removeFilmShotGroup, renameFilmShotGroup, selectFilmShotGroups } from "./film-shot-groups";

const entry = (id: string, duration: number, media: Partial<FilmShotNodeData> = {}): FilmShotEntry => ({
    shot: {
        id,
        type: CanvasNodeType.FilmShot,
        title: id,
        position: { x: 0, y: 0 },
        width: 420,
        height: 320,
        metadata: {
            status: "idle",
            filmShot: {
                shotNo: id,
                shotType: "中景",
                cameraMovement: "固定",
                duration,
                description: id,
                dialogue: "",
                audio: "",
                prompt: "",
                ...media,
            } as FilmShotNodeData,
        },
    } satisfies CanvasNodeData,
    sceneId: "scene",
    sceneLabel: "第 1 集 · 场景 1",
    episodeTitle: "第 1 集",
    index: 0,
});

const group = (patch: Partial<FilmShotGroup> = {}): FilmShotGroup => ({ id: "g1", title: "开场", shotIds: ["s3", "s1", "s1", "gone"], createdAt: "2026-11-22T00:00:00.000Z", ...patch });

test("resolves groups in film order with media and removed counts", () => {
    const shots = [
        entry("s1", 4, { imageUrl: "https://example.com/1.png" }),
        entry("s2", 5, { videoUrl: "https://example.com/2.mp4" }),
        entry("s3", 3),
    ];
    const [summary] = selectFilmShotGroups([group()], shots);
    assert.deepEqual(summary.shots.map((item) => item.shot.id), ["s1", "s3"]);
    assert.equal(summary.duration, 7);
    assert.equal(summary.imageCount, 1);
    assert.equal(summary.videoCount, 0);
    assert.equal(summary.missingCount, 1);
    assert.equal(summary.removedCount, 1);
});

test("counts version-pool-only media as generated", () => {
    const shots = [
        entry("s1", 4, { imageVersions: [{ id: "i1", url: "https://example.com/1.png", createdAt: "2026-11-22T00:00:00.000Z" }] }),
        entry("s2", 4, { videoVersions: [{ id: "v1", url: "https://example.com/2.mp4", createdAt: "2026-11-22T00:00:00.000Z" }] }),
    ];
    const [summary] = selectFilmShotGroups([group({ shotIds: ["s1", "s2"] })], shots);
    assert.equal(summary.imageCount, 1);
    assert.equal(summary.videoCount, 1);
    assert.equal(summary.missingCount, 0);
});

test("creates, renames and removes groups", () => {
    const created = createFilmShotGroup([], "  开场  ", ["a", "b", "a"]);
    assert.equal(created.length, 1);
    assert.equal(created[0].title, "开场");
    assert.deepEqual(created[0].shotIds, ["a", "b"]);

    const unnamed = createFilmShotGroup([], "", ["a"]);
    assert.equal(unnamed[0].title, "镜头组 1");
    assert.deepEqual(createFilmShotGroup([], "空组", []), []);

    const renamed = renameFilmShotGroup(created, created[0].id, "  新标题 ");
    assert.equal(renamed[0].title, "新标题");
    assert.equal(renameFilmShotGroup(created, created[0].id, "   ")[0].title, "开场");
    assert.deepEqual(removeFilmShotGroup(created, created[0].id), []);
});
