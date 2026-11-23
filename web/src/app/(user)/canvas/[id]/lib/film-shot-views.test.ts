import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import type { FilmShotEntry } from "./film-studio-types";
import { filterFilmShotEntries, filmShotMediaSummary, filmShotViewStats, groupFilmShots } from "./film-shot-views";

const shot = (duration: number, patch: Partial<NonNullable<CanvasNodeData["metadata"]>["filmShot"]> = {}, metadata: Partial<NonNullable<CanvasNodeData["metadata"]>> = {}): CanvasNodeData => ({
    id: `shot-${duration}-${Object.keys(patch).join("-")}`,
    type: CanvasNodeType.FilmShot,
    title: "镜头",
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: {
        filmShot: {
            shotNo: "01",
            shotType: "",
            cameraMovement: "",
            duration,
            description: "",
            dialogue: "",
            audio: "",
            prompt: "",
            ...patch,
        },
        ...metadata,
    },
});
const entry = (id: string, sceneId: string, node: CanvasNodeData): FilmShotEntry => ({ shot: { ...node, id }, sceneId, sceneLabel: sceneId, episodeTitle: "", index: 0 });

test("summarizes shot media states", () => {
    assert.deepEqual(filmShotMediaSummary(shot(4, { imageUrl: "https://example.com/a.png" })), { hasImage: true, hasVideo: false, generating: null, failed: false });
    assert.deepEqual(filmShotMediaSummary(shot(4, { videoUrl: "https://example.com/a.mp4", storageKey: "image:a", videoStorageKey: "video:a" })), { hasImage: true, hasVideo: true, generating: null, failed: false });
    assert.deepEqual(filmShotMediaSummary(shot(4, {}, { status: "loading", filmShotTaskKind: "video" })), { hasImage: false, hasVideo: false, generating: "video", failed: false });
    assert.deepEqual(filmShotMediaSummary(shot(4, { lastFailedTaskKind: "image" }, { status: "error" })), { hasImage: false, hasVideo: false, generating: null, failed: true });
});

test("treats storage keys and version pools as generated media", () => {
    assert.deepEqual(filmShotMediaSummary(shot(4, { storageKey: "image:a" })), { hasImage: true, hasVideo: false, generating: null, failed: false });
    assert.deepEqual(filmShotMediaSummary(shot(4, { videoStorageKey: "video:a" })), { hasImage: false, hasVideo: true, generating: null, failed: false });
    assert.deepEqual(filmShotMediaSummary(shot(4, {
        imageVersions: [{ id: "image-v1", url: "https://example.com/a.png", createdAt: "2026-11-22T00:00:00.000Z" }],
        videoVersions: [{ id: "video-v1", url: "https://example.com/a.mp4", createdAt: "2026-11-22T00:00:00.000Z" }],
    })), { hasImage: true, hasVideo: true, generating: null, failed: false });
});

test("computes view statistics", () => {
    const entries = [
        entry("a", "scene-1", shot(4, { imageUrl: "https://example.com/a.png" })),
        entry("b", "scene-1", shot(2)),
        entry("c", "scene-2", shot(6, { videoUrl: "https://example.com/c.mp4" })),
    ];
    assert.deepEqual(filmShotViewStats(entries), { shots: 3, scenes: 2, duration: 12, images: 1, videos: 1 });
});

test("filters shots by scene, media state and keyword", () => {
    const entries = [
        entry("a", "scene-1", shot(4, { shotNo: "01", imageUrl: "https://example.com/a.png", description: "天台回头" })),
        entry("b", "scene-1", shot(2, { shotNo: "02", description: "短刀特写" }, { status: "loading", filmShotTaskKind: "video" })),
        entry("c", "scene-2", shot(6, { shotNo: "03", description: "雨停警灯" }, { status: "error" })),
    ];
    assert.deepEqual(filterFilmShotEntries(entries, { sceneId: "scene-1" }).map((item) => item.shot.id), ["a", "b"]);
    assert.deepEqual(filterFilmShotEntries(entries, { status: "image" }).map((item) => item.shot.id), ["a"]);
    assert.deepEqual(filterFilmShotEntries(entries, { status: "generating" }).map((item) => item.shot.id), ["b"]);
    assert.deepEqual(filterFilmShotEntries(entries, { status: "failed" }).map((item) => item.shot.id), ["c"]);
    assert.deepEqual(filterFilmShotEntries(entries, { query: "短刀" }).map((item) => item.shot.id), ["b"]);
    assert.deepEqual(filterFilmShotEntries(entries, { query: "雨停" }).map((item) => item.shot.id), ["c"]);
});

test("matches professional shot fields in keyword search", () => {
    const entries = [
        entry("a", "scene-1", shot(4, {
            soundDesign: { ambience: "雨声", sfx: "玻璃碎裂", music: "", dialogueTone: "" },
            performance: { objective: "留住对方", emotion: "压抑", subtext: "", bodyLanguage: "", intensity: 3 },
            transition: "硬切",
            coverage: "建立",
        })),
    ];
    assert.deepEqual(filterFilmShotEntries(entries, { query: "玻璃" }).map((item) => item.shot.id), ["a"]);
    assert.deepEqual(filterFilmShotEntries(entries, { query: "压抑" }).map((item) => item.shot.id), ["a"]);
    assert.deepEqual(filterFilmShotEntries(entries, { query: "硬切" }).map((item) => item.shot.id), ["a"]);
});

test("groups shots into 4 or 9 sized chunks", () => {
    const entries = Array.from({ length: 10 }, (_, index) => entry(String(index), "scene-1", shot(4)));
    assert.deepEqual(groupFilmShots(entries, 4).map((group) => group.length), [4, 4, 2]);
    assert.deepEqual(groupFilmShots(entries, 9).map((group) => group.length), [9, 1]);
});
