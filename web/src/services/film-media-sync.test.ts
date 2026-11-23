import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { applyFilmMediaPromotionsToLibrary, filmMediaNeedsPromotion, type FilmMediaReplacement } from "./film-media-sync";

const replacements = new Map<string, FilmMediaReplacement>([
    ["image:local", { url: "blob:new", storageKey: "server:local", width: 1024, height: 768 }],
    ["video:local", { url: "blob:video", storageKey: "server:video" }],
]);

const asset = (): FilmAsset => ({
    id: "c1", name: "角色", aliases: [], description: "", visualPrompt: "", status: "ready",
    concept: { images: [{ id: "i1", url: "blob:old", storageKey: "image:local" }], locked: false },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
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
    assert.equal(filmMediaNeedsPromotion([local]), true);
    assert.equal(filmMediaNeedsPromotion([remote]), false);
});
