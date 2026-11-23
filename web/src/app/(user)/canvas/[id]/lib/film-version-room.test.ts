import assert from "node:assert/strict";
import test from "node:test";

import type { FilmMediaVersion } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import { applyFilmVersionSelections, defaultFilmVersionPair, filmVersionSummary, selectFilmVersionShots } from "./film-version-room";

const version = (id: string, createdAt = "2026-11-22T00:00:00.000Z"): FilmMediaVersion => ({
    id,
    url: `https://example.com/${id}.png`,
    storageKey: `key-${id}`,
    createdAt,
});
const shotNode = (id: string, payload: Partial<FilmShotNodeData>): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmShot,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        status: "success",
        filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "", ...payload },
    },
});
const a = shotNode("a", { shotNo: "01", imageUrl: version("a1").url, storageKey: "key-a1", imageVersions: [version("a1"), version("a2")] });
const b = shotNode("b", { shotNo: "02", imageVersions: [version("b1")] });
const chain: CanvasConnection[] = [{ id: "a->b", fromNodeId: "a", toNodeId: "b", kind: "sequence" }];

test("selects version shots in global order and filters by version count", () => {
    const all = selectFilmVersionShots([b, a], chain, "image", { minVersions: 1 });
    assert.deepEqual(all.map((shot) => shot.shotId), ["a", "b"]);
    assert.equal(all[0].currentVersionId, "a1");
    const multi = selectFilmVersionShots([b, a], chain, "image", { minVersions: 2 });
    assert.deepEqual(multi.map((shot) => shot.shotId), ["a"]);
});

test("pairs the current version with the latest other version", () => {
    const [shot] = selectFilmVersionShots([a], [], "image", { minVersions: 1 });
    assert.deepEqual(defaultFilmVersionPair(shot), { leftId: "a1", rightId: "a2" });
});

test("applies image and video selections without deleting version history", () => {
    const video1 = version("v1");
    const video2 = version("v2");
    const node = shotNode("media", {
        imageUrl: "old.png",
        storageKey: "old-key",
        imageVersions: [version("i1"), version("i2")],
        videoUrl: video1.url,
        videoStorageKey: video1.storageKey,
        videoVersions: [video1, video2],
    });
    const next = applyFilmVersionSelections([node], [
        { shotId: "media", kind: "image", versionId: "i2" },
        { shotId: "media", kind: "video", versionId: "v2" },
    ]);
    assert.equal(next[0].metadata?.filmShot?.imageUrl, version("i2").url);
    assert.equal(next[0].metadata?.filmShot?.storageKey, "key-i2");
    assert.equal(next[0].metadata?.filmShot?.videoUrl, video2.url);
    assert.equal(next[0].metadata?.filmShot?.videoStorageKey, "key-v2");
    assert.equal(next[0].metadata?.filmShot?.imageVersions?.length, 2);
    assert.equal(next[0].metadata?.filmShot?.videoVersions?.length, 2);
    assert.equal(next[0].metadata?.status, "success");
});

test("detects the current version by storage key and applies batch picks across shots", () => {
    const image1 = version("i1");
    const image2 = { ...version("i2"), url: "https://cdn.example.com/i2-signed.png", storageKey: "i2-key" };
    const node = shotNode("media", { imageUrl: "https://expired.example.com/i2.png", storageKey: "i2-key", imageVersions: [image1, image2] });
    assert.equal(selectFilmVersionShots([node], [], "image")[0].currentVersionId, "i2");
    const next = applyFilmVersionSelections([a, b], [
        { shotId: "a", kind: "image", versionId: "a2" },
        { shotId: "b", kind: "image", versionId: "b1" },
    ]);
    assert.equal(next.find((item) => item.id === "a")?.metadata?.filmShot?.storageKey, "key-a2");
    assert.equal(next.find((item) => item.id === "b")?.metadata?.filmShot?.imageUrl, version("b1").url);
});

test("keeps a pending generation task when switching the current version", () => {
    const node = shotNode("pending", {
        imageUrl: "old.png",
        storageKey: "old-key",
        imageVersions: [version("i1"), version("i2")],
        pendingTask: { kind: "video", id: "task-1", startedAt: 1 },
    });
    node.metadata = { ...node.metadata, status: "loading", filmShotTaskKind: "video" };
    const next = applyFilmVersionSelections([node], [{ shotId: "pending", kind: "image", versionId: "i2" }])[0];
    assert.equal(next.metadata?.filmShot?.imageUrl, version("i2").url);
    assert.equal(next.metadata?.filmShot?.pendingTask?.id, "task-1");
    assert.equal(next.metadata?.status, "loading");
    assert.equal(next.metadata?.filmShotTaskKind, "video");
});

test("leaves nodes untouched for unknown versions or missing shots", () => {
    const node = shotNode("media", { imageUrl: "old.png", storageKey: "old-key", imageVersions: [version("i1")] });
    const next = applyFilmVersionSelections([node], [
        { shotId: "media", kind: "image", versionId: "missing" },
        { shotId: "missing", kind: "image", versionId: "i1" },
    ]);
    assert.equal(next[0], node);
});

test("summarizes generation metadata and context for a version", () => {
    const withContext = {
        ...version("ctx"),
        generationContext: {
            prompt: "提示词",
            compilerVersion: "film-shot-gen/4",
            characters: [{ characterName: "阿青", stateName: "正装" }],
            references: [{ role: "style", label: "冷峻电影感" }],
            warnings: ["警告"],
            missingReferenceIds: ["missing"],
        },
    } as never;
    assert.deepEqual(filmVersionSummary(withContext), {
        hasContext: true,
        prompt: "提示词",
        compilerVersion: "film-shot-gen/4",
        characters: [{ name: "阿青", stateName: "正装" }],
        references: [{ role: "style", label: "冷峻电影感" }],
        warnings: ["警告"],
        missing: 1,
    });
});

test("summarizes uploaded or old versions without generation context", () => {
    assert.deepEqual(filmVersionSummary(version("upload")), {
        hasContext: false,
        prompt: "",
        compilerVersion: "",
        characters: [],
        references: [],
        warnings: [],
        missing: 0,
    });
});
