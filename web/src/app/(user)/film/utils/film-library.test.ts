import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmProject, FilmShot } from "@/lib/film/types";
import { createEmptyCharacterProfile } from "./film-character";
import { applyFilmLibraryEntry, filmLibraryEntryIsNewer, filmLibraryUsage, filmLibraryUsageIndex, findFilmLibraryEntry, upsertFilmLibraryAsset } from "./film-library";

const concept = { images: [], locked: false };
const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({
    id: "asset-1", name: "资产", aliases: [], description: "", visualPrompt: "", status: "idle", concept,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});
const shot = (overrides: Partial<FilmShot> = {}): FilmShot => ({
    id: "s1", shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "",
    characterBindings: [], propBindings: [], ...overrides,
});
const project = (overrides: Partial<FilmProject> = {}): FilmProject => ({
    id: "p1", title: "项目", visualStyle: "", aspect: "16:9", stylePreset: "custom", stage: "script", scriptText: "",
    episodes: [], characters: [], locations: [], props: [], costumes: [], createdAt: "", updatedAt: "", ...overrides,
});

test("库条目按来源 id 命中并判断更新", () => {
    const copy = asset({ id: "copy-1", sourceLibraryAssetId: "lib-1", updatedAt: "2026-01-01T00:00:00.000Z" });
    const entry = asset({ id: "lib-1", updatedAt: "2026-01-02T00:00:00.000Z" });
    assert.equal(findFilmLibraryEntry([entry], copy)?.id, "lib-1");
    assert.equal(findFilmLibraryEntry([entry], { ...copy, sourceLibraryAssetId: undefined }), undefined);
    assert.equal(filmLibraryEntryIsNewer(entry, copy), true);
    assert.equal(filmLibraryEntryIsNewer(entry, { ...copy, updatedAt: "2026-01-03T00:00:00.000Z" }), false);
});

test("从库更新保留副本 id 与来源", () => {
    const copy = asset({ id: "copy-1", sourceLibraryAssetId: "lib-1", createdAt: "2026-01-01T00:00:00.000Z" });
    const entry = asset({ id: "lib-1", name: "新库名称", description: "库内容" });
    const next = applyFilmLibraryEntry(copy, entry);
    assert.equal(next.id, "copy-1");
    assert.equal(next.sourceLibraryAssetId, "lib-1");
    assert.equal(next.name, "新库名称");
    assert.equal(next.createdAt, "2026-01-01T00:00:00.000Z");
    assert.notEqual(next.updatedAt, entry.updatedAt);
});

test("使用统计覆盖副本数与镜头 / 造型绑定数", () => {
    const costumeCopy = asset({ id: "cos-copy", sourceLibraryAssetId: "lib-cos" });
    const characterCopy = asset({
        id: "char-copy",
        sourceLibraryAssetId: "lib-char",
        character: { ...createEmptyCharacterProfile(), states: [{ id: "st1", name: "正装", description: "", costumeId: "cos-copy", condition: "", heldPropIds: [], look: { images: [], locked: false } }] },
    });
    const propCopy = asset({ id: "prop-copy", sourceLibraryAssetId: "lib-prop" });
    const locationCopy = asset({ id: "loc-copy", sourceLibraryAssetId: "lib-loc" });
    const projects = [
        project({
            id: "p1", title: "项目一",
            characters: [characterCopy],
            costumes: [costumeCopy],
            props: [propCopy],
            locations: [locationCopy],
            episodes: [{
                id: "e1", title: "第1集", scenes: [{
                    id: "sc1", name: "1-1", location: "", time: "", mood: "",
                    shots: [
                        shot({ id: "sh1", characterBindings: [{ characterId: "char-copy", source: "manual", characterNameSnapshot: "甲", continuity: {} }], propBindings: [{ propId: "prop-copy", propNameSnapshot: "信", source: "manual" }], locationId: "loc-copy" }),
                        shot({ id: "sh2", characterBindings: [{ characterId: "char-copy", source: "ai", characterNameSnapshot: "甲", continuity: {} }] }),
                    ],
                }],
            }],
        }),
        project({ id: "p2", title: "项目二", costumes: [costumeCopy] }),
    ];
    assert.deepEqual(filmLibraryUsage(projects, "lib-char", "character"), { projects: 1, copies: 1, bindings: 2, projectTitles: ["项目一"] });
    assert.deepEqual(filmLibraryUsage(projects, "lib-cos", "costume"), { projects: 2, copies: 2, bindings: 1, projectTitles: ["项目一", "项目二"] });
    assert.deepEqual(filmLibraryUsage(projects, "lib-prop", "prop"), { projects: 1, copies: 1, bindings: 1, projectTitles: ["项目一"] });
    assert.deepEqual(filmLibraryUsage(projects, "lib-loc", "location"), { projects: 1, copies: 1, bindings: 1, projectTitles: ["项目一"] });
});

test("重复存入同一项目副本只保留一条并原地更新", () => {
    const copy = asset({ id: "copy-1", name: "旧名称", sourceLibraryAssetId: undefined });
    const first = upsertFilmLibraryAsset([], copy, "2026-01-01T00:00:00.000Z");
    assert.equal(first.mode, "created");
    assert.equal(first.library.length, 1);
    const second = upsertFilmLibraryAsset(first.library, { ...copy, name: "新名称" }, "2026-01-02T00:00:00.000Z");
    assert.equal(second.mode, "updated");
    assert.equal(second.library.length, 1);
    assert.equal(second.library[0].id, first.library[0].id);
    assert.equal(second.library[0].name, "新名称");
    assert.equal(second.library[0].sourceLibraryAssetId, "copy-1");
    assert.equal(second.library[0].updatedAt, "2026-01-02T00:00:00.000Z");
});

test("从库导入的副本再次存入会更新原库条目", () => {
    const entry = asset({ id: "lib-1", name: "库条目" });
    const copy = { ...asset({ id: "copy-1", name: "项目副本" }), sourceLibraryAssetId: "lib-1" };
    const result = upsertFilmLibraryAsset([entry], copy, "2026-01-03T00:00:00.000Z");
    assert.equal(result.mode, "updated");
    assert.equal(result.library.length, 1);
    assert.equal(result.library[0].id, "lib-1");
    assert.equal(result.library[0].name, "项目副本");
});

test("使用统计索引与单条查询结果一致", () => {
    const characterCopy = asset({ id: "char-copy", sourceLibraryAssetId: "lib-char" });
    const projects = [project({ id: "p1", title: "项目一", characters: [characterCopy] })];
    const index = filmLibraryUsageIndex(projects, "character");
    assert.deepEqual(index.get("lib-char"), filmLibraryUsage(projects, "lib-char", "character"));
    assert.equal(index.has("missing"), false);
});
