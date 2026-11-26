import assert from "node:assert/strict";
import test from "node:test";

import type { FilmEpisode, FilmScene, FilmStructurePlan } from "@/lib/film/types";
import { episodesFromSceneStoryboards, runFilmSceneStoryboards, upsertFilmAnalysisScene } from "./film-ai-scenes";

const plan = (): FilmStructurePlan => ({
    scriptHash: "hash",
    createdAt: "2026-11-26T00:00:00.000Z",
    scenes: [
        { episodeTitle: "第1集", sceneNo: 1, sceneName: "1-1 咖啡馆", purpose: "", beats: [], coverage: [], characters: [], estimatedDuration: 10 },
        { episodeTitle: "第1集", sceneNo: 2, sceneName: "1-2 仓库", purpose: "", beats: [], coverage: [], characters: [], estimatedDuration: 12 },
    ],
});

const scene = (name: string, description = name): FilmScene => ({
    id: `${name}-id`,
    name,
    location: "",
    time: "",
    mood: "",
    shots: [{
        id: `${name}-shot`,
        shotNo: "01",
        shotType: "中景",
        cameraMovement: "固定",
        duration: 4,
        description,
        dialogue: "",
        audio: "",
        prompt: description,
        characterBindings: [],
        propBindings: [],
    }],
});

const episodes = (): FilmEpisode[] => [{ id: "ep-1", title: "第1集", scenes: [scene("1-1 咖啡馆", "旧画面"), scene("1-2 仓库", "其他场")] }];

test("runs scene storyboards concurrently and records per-scene failures", async () => {
    const structure = plan();
    const run = await runFilmSceneStoryboards(structure, async (item) => {
        if (item.sceneName.includes("仓库")) throw new Error("模型超时");
        return scene(item.sceneName);
    }, { concurrency: 2 });
    assert.equal(run.aborted, false);
    assert.equal(run.scenes[0]?.name, "1-1 咖啡馆");
    assert.equal(run.scenes[1], null);
    assert.equal(Object.keys(run.errors).length, 1);
    assert.ok(run.errors["第1集::1-2 仓库"]?.includes("模型超时"));
    const assembled = episodesFromSceneStoryboards(structure, run.scenes);
    assert.equal(assembled[0].scenes.length, 1);
});

test("stops scheduling when the signal is aborted", async () => {
    const structure = plan();
    const controller = new AbortController();
    controller.abort();
    const run = await runFilmSceneStoryboards(structure, async (item) => scene(item.sceneName), { signal: controller.signal });
    assert.equal(run.aborted, true);
    assert.deepEqual(run.scenes, [null, null]);
});

test("replaces only the retried scene and keeps other scenes intact", () => {
    const structure = plan();
    const before = episodes();
    const retried = scene("1-1 咖啡馆", "新画面");
    const next = upsertFilmAnalysisScene(before, structure, structure.scenes[0], retried);
    assert.equal(next[0].scenes[0].shots[0].description, "新画面");
    assert.equal(next[0].scenes[0].id, "1-1 咖啡馆-id");
    assert.deepEqual(next[0].scenes[1], before[0].scenes[1]);
    assert.equal(before[0].scenes[0].shots[0].description, "旧画面");
});

test("inserts a previously failed scene at its plan position", () => {
    const structure = plan();
    const onlySecond: FilmEpisode[] = [{ id: "ep-1", title: "第1集", scenes: [scene("1-2 仓库")] }];
    const next = upsertFilmAnalysisScene(onlySecond, structure, structure.scenes[0], scene("1-1 咖啡馆"));
    assert.deepEqual(next[0].scenes.map((item) => item.name), ["1-1 咖啡馆", "1-2 仓库"]);
});
