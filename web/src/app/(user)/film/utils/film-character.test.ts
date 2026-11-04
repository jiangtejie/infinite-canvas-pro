import assert from "node:assert/strict";
import test from "node:test";

import { CHARACTER_PART_DEFINITIONS, characterMasterImages, characterProgress, characterReferenceImages, createEmptyCharacterProfile } from "./film-character";
import type { FilmAsset } from "../types";

const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({ id: "c1", name: "沈星晴", description: "", visualPrompt: "", status: "idle", createdAt: "2026-01-01T00:00:00.000Z", ...overrides });

test("空角色档案包含六个部位", () => {
    const profile = createEmptyCharacterProfile();
    assert.equal(CHARACTER_PART_DEFINITIONS.length, 6);
    assert.deepEqual(Object.keys(profile.parts).sort(), ["face", "hair", "limbs", "lower", "middle", "upper"]);
    assert.equal(profile.masterLocked, false);
});

test("旧角色没有档案时回退到主图", () => {
    const images = characterMasterImages(asset({ imageUrl: "cover.png", storageKey: "image:1" }));
    assert.equal(images.length, 1);
    assert.equal(images[0].url, "cover.png");
});

test("参考图按部位顺序收集，可排除当前部位", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.images = [{ id: "f1", url: "face.png" }];
    profile.parts.upper.images = [{ id: "u1", url: "upper.png" }];
    const refs = characterReferenceImages(asset({ character: profile }), { includeMaster: true });
    assert.deepEqual(refs.map((item) => item.url), ["face.png", "upper.png"]);
    const excluded = characterReferenceImages(asset({ character: profile }), { excludePart: "face" });
    assert.deepEqual(excluded.map((item) => item.url), ["upper.png"]);
});

test("进度统计包含部位、锁定与合成图", () => {
    const profile = createEmptyCharacterProfile();
    profile.parts.face.images = [{ id: "f1", url: "face.png" }];
    profile.parts.face.locked = true;
    const progress = characterProgress(asset({ character: profile }));
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 6);
    assert.equal(progress.locked, 1);
    assert.equal(progress.master, 0);
});
