import assert from "node:assert/strict";
import test from "node:test";

import { createComicCharacter, createComicLocation } from "./comic-project";
import { applyComicCharacterLibraryEntry, applyComicLocationLibraryEntry, comicLibraryEntryIsNewer } from "./comic-library-entry";

test("库条目更新晚于副本快照时才提示", () => {
    assert.equal(comicLibraryEntryIsNewer({ updatedAt: "2026-01-02T00:00:00.000Z" }, { sourceLibraryUpdatedAt: "2026-01-01T00:00:00.000Z" }), true);
    assert.equal(comicLibraryEntryIsNewer({ updatedAt: "2026-01-01T00:00:00.000Z" }, { sourceLibraryUpdatedAt: "2026-01-01T00:00:00.000Z" }), false);
    assert.equal(comicLibraryEntryIsNewer({ updatedAt: "2026-01-01T00:00:00.000Z" }, {}), true);
    assert.equal(comicLibraryEntryIsNewer(undefined, {}), false);
});

test("从库更新保留副本 id 与来源并刷新快照", () => {
    const copy = createComicCharacter(1);
    copy.id = "copy-1";
    copy.name = "旧名字";
    copy.sourceLibraryCharacterId = "library-1";
    copy.sourceLibraryUpdatedAt = "2026-01-01T00:00:00.000Z";
    const entry = { ...createComicCharacter(1), id: "library-1", name: "新名字", createdAt: "", updatedAt: "2026-01-02T00:00:00.000Z" };
    const updated = applyComicCharacterLibraryEntry(copy, entry);
    assert.equal(updated.id, "copy-1");
    assert.equal(updated.name, "新名字");
    assert.equal(updated.sourceLibraryCharacterId, "library-1");
    assert.equal(updated.sourceLibraryUpdatedAt, "2026-01-02T00:00:00.000Z");
    assert.equal(comicLibraryEntryIsNewer(entry, updated), false);
});

test("场景从库更新同样保留副本关系", () => {
    const copy = createComicLocation(1);
    copy.id = "location-copy";
    copy.sourceLibraryLocationId = "library-location";
    const entry = { ...createComicLocation(1), id: "library-location", name: "新场景", createdAt: "", updatedAt: "2026-01-02T00:00:00.000Z" };
    const updated = applyComicLocationLibraryEntry(copy, entry);
    assert.equal(updated.id, "location-copy");
    assert.equal(updated.name, "新场景");
    assert.equal(updated.sourceLibraryLocationId, "library-location");
    assert.equal(updated.sourceLibraryUpdatedAt, "2026-01-02T00:00:00.000Z");
});
