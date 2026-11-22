import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import type { FilmShotEntry } from "./film-studio-types";
import { buildFilmPreviewTimeline, filmPreviewClipAt, formatFilmPreviewTime } from "./film-animatic-preview";

const entry = (id: string, duration: number, media: Partial<FilmShotNodeData> = {}, sceneId = "scene-1", sceneLabel = "第 1 集 · 场景 1"): FilmShotEntry => ({
    shot: {
        id,
        type: CanvasNodeType.Shot,
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
                description: `${id} 描述`,
                dialogue: `${id} 台词`,
                audio: "",
                prompt: "",
                ...media,
            } as FilmShotNodeData,
        },
    } satisfies CanvasNodeData,
    sceneId,
    sceneLabel,
    episodeTitle: "第 1 集",
    index: 0,
});

test("builds clips with media priority, timing and scene ranges", () => {
    const timeline = buildFilmPreviewTimeline([
        entry("v", 4, { videoUrl: "https://example.com/v.mp4", imageUrl: "https://example.com/v.png" }),
        entry("i", 5, { imageUrl: "https://example.com/i.png" }),
        entry("none", 3, {}, "scene-2", "第 1 集 · 场景 2"),
        entry("last", 2, { storageKey: "image:last" }, "scene-2", "第 1 集 · 场景 2"),
    ]);
    assert.equal(timeline.totalDuration, 14);
    assert.deepEqual(timeline.clips.map((clip) => [clip.shotId, clip.media, clip.start, clip.end]), [
        ["v", "video", 0, 4],
        ["i", "image", 4, 9],
        ["none", "none", 9, 12],
        ["last", "image", 12, 14],
    ]);
    assert.deepEqual(timeline.scenes.map((scene) => [scene.sceneId, scene.start, scene.end]), [
        ["scene-1", 0, 9],
        ["scene-2", 9, 14],
    ]);
    assert.equal(timeline.videoCount, 1);
    assert.equal(timeline.imageCount, 2);
    assert.equal(timeline.missingCount, 1);
});

test("finds the clip at boundaries and clamps durations", () => {
    const timeline = buildFilmPreviewTimeline([
        entry("a", 0),
        entry("b", 0.2),
    ]);
    assert.deepEqual(timeline.clips.map((clip) => clip.duration), [4, 0.5]);
    assert.equal(filmPreviewClipAt(timeline, 0)?.shotId, "a");
    assert.equal(filmPreviewClipAt(timeline, 3.99)?.shotId, "a");
    assert.equal(filmPreviewClipAt(timeline, 4)?.shotId, "b");
    assert.equal(filmPreviewClipAt(timeline, 99)?.shotId, "b");
    assert.equal(filmPreviewClipAt(timeline, -5)?.shotId, "a");
    assert.equal(filmPreviewClipAt(buildFilmPreviewTimeline([]), 0), null);
});

test("formats preview time", () => {
    assert.equal(formatFilmPreviewTime(0), "0:00");
    assert.equal(formatFilmPreviewTime(65.8), "1:05");
    assert.equal(formatFilmPreviewTime(-2), "0:00");
});
