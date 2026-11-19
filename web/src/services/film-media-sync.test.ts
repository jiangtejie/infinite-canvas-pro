import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmProject } from "@/lib/film/types";
import { applyFilmMediaPromotionsToLibrary, applyFilmMediaPromotionsToProjects, filmMediaNeedsPromotion, type FilmMediaReplacement } from "./film-media-sync";

const replacements = new Map<string, FilmMediaReplacement>([
    ["image:local", { url: "blob:new", storageKey: "server:local", width: 1024, height: 768 }],
    ["video:local", { url: "blob:video", storageKey: "server:video" }],
]);

const asset = (): FilmAsset => ({
    id: "c1", name: "角色", aliases: [], description: "", visualPrompt: "", status: "ready",
    concept: { images: [{ id: "i1", url: "blob:old", storageKey: "image:local" }], locked: false },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

test("项目媒体替换覆盖图片/视频字段并保留其他内容", () => {
    const project: FilmProject = {
        id: "p1", title: "项目", visualStyle: "", aspect: "16:9", stylePreset: "custom", stage: "storyboard", scriptText: "",
        episodes: [{
            id: "e1", title: "第1集", scenes: [{
                id: "s1", name: "1-1", location: "", time: "", mood: "",
                shots: [{
                    id: "sh1", shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "描述", dialogue: "", audio: "", prompt: "",
                    characterBindings: [], propBindings: [],
                    imageUrl: "blob:old", storageKey: "image:local",
                    videoUrl: "blob:video-old", videoStorageKey: "video:local",
                }],
            }],
        }],
        characters: [asset()], locations: [], props: [], costumes: [], createdAt: "", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const applied = applyFilmMediaPromotionsToProjects([project], replacements);
    assert.equal(applied.changed, true);
    const saved = applied.projects[0];
    assert.equal(saved.characters[0].concept.images[0].storageKey, "server:local");
    assert.equal(saved.characters[0].concept.images[0].url, "blob:new");
    assert.equal(saved.characters[0].concept.images[0].width, 1024);
    const shot = saved.episodes[0].scenes[0].shots[0];
    assert.equal(shot.storageKey, "server:local");
    assert.equal(shot.imageUrl, "blob:new");
    assert.equal(shot.videoStorageKey, "server:video");
    assert.equal(shot.videoUrl, "blob:video");
    assert.equal(shot.description, "描述");
    assert.notEqual(saved.updatedAt, project.updatedAt);
});

test("库媒体替换只更新命中条目", () => {
    const clean = { ...asset(), id: "c2", name: "未变化", concept: { images: [{ id: "i2", url: "blob:keep", storageKey: "server:keep" }], locked: false } };
    const library = { characters: [asset(), clean], locations: [], props: [], costumes: [], styles: [] };
    const applied = applyFilmMediaPromotionsToLibrary(library, replacements);
    assert.equal(applied.changed, true);
    assert.equal(applied.library.characters[0].concept.images[0].storageKey, "server:local");
    assert.equal(applied.library.characters[1], clean);
});

test("只有本地媒体才需要升级", () => {
    const local = { ...asset(), concept: { images: [{ id: "i1", url: "blob:old", storageKey: "image:local" }], locked: false } };
    const remote = { ...asset(), id: "c2", concept: { images: [{ id: "i2", url: "https://cdn.example.com/a.png", storageKey: "server:remote" }], locked: false } };
    assert.equal(filmMediaNeedsPromotion([], [local]), true);
    assert.equal(filmMediaNeedsPromotion([], [remote]), false);
});
