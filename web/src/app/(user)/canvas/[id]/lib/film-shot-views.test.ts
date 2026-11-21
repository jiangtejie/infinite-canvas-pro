import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import type { FilmShotEntry } from "./film-studio-types";
import { filmShotMediaSummary, filmShotViewStats, filmTimelineBlocks } from "./film-shot-views";

const shot = (duration: number, patch: Partial<NonNullable<CanvasNodeData["metadata"]>["filmShot"]> = {}, metadata: Partial<NonNullable<CanvasNodeData["metadata"]>> = {}): CanvasNodeData => ({
    id: `shot-${duration}-${Object.keys(patch).join("-")}`,
    type: CanvasNodeType.Shot,
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

test("computes view statistics and timeline layout", () => {
    const entries = [
        entry("a", "scene-1", shot(4, { imageUrl: "https://example.com/a.png" })),
        entry("b", "scene-1", shot(2)),
        entry("c", "scene-2", shot(6, { videoUrl: "https://example.com/c.mp4" })),
    ];
    assert.deepEqual(filmShotViewStats(entries), { shots: 3, scenes: 2, duration: 12, images: 1, videos: 1 });
    const blocks = filmTimelineBlocks(entries, 56);
    assert.deepEqual(blocks.map((block) => ({ id: block.entry.shot.id, start: block.start, end: block.end, width: block.width })), [
        { id: "a", start: 0, end: 4, width: 224 },
        { id: "b", start: 4, end: 6, width: 112 },
        { id: "c", start: 6, end: 12, width: 336 },
    ]);
});
