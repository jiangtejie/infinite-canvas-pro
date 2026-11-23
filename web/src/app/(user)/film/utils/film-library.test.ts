import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { applyFilmLibraryEntry, filmLibraryEntryIsNewer, findFilmLibraryEntry, upsertFilmLibraryAsset } from "./film-library";

const concept = { images: [], locked: false };
const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({
    id: "asset-1", name: "资产", aliases: [], description: "", visualPrompt: "", status: "idle", concept,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
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
