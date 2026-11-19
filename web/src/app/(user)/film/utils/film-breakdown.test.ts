import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmProject, FilmShot } from "@/lib/film/types";
import { createEmptyCharacterProfile } from "./film-character";
import { buildFilmBreakdownTable } from "./film-breakdown";

const emptySlot = { images: [], locked: false };
const slot = (id: string, locked = false) => ({ images: [{ id: `${id}-img`, url: `${id}.png` }], locked });
const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({
    id: "a1", name: "资产", aliases: [], description: "", visualPrompt: "", status: "idle", concept: emptySlot,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});
const shot = (overrides: Partial<FilmShot> = {}): FilmShot => ({
    id: "s1", shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "",
    characterBindings: [], propBindings: [], ...overrides,
});

test("拆件表按集汇总解析与镜头绑定并标注状态", () => {
    const character = asset({ id: "c1", name: "阿青", character: { ...createEmptyCharacterProfile(), master: slot("master", true) } });
    const location = asset({ id: "l1", name: "咖啡馆", concept: slot("loc", true), location: { variants: [{ id: "v1", name: "夜·雨", description: "", concept: slot("var", false) }] } });
    const prop = asset({ id: "p1", name: "旧信", concept: emptySlot });
    const project: FilmProject = {
        id: "p1", title: "项目", visualStyle: "", aspect: "16:9", stylePreset: "custom", stage: "storyboard", scriptText: "",
        episodes: [{
            id: "e1", title: "第1集", scenes: [{
                id: "sc1", name: "1-1", location: "咖啡馆", time: "夜", mood: "",
                shots: [shot({
                    characterBindings: [{ characterId: "c1", source: "manual", characterNameSnapshot: "阿青", continuity: {} }],
                    propBindings: [{ propId: "p1", propNameSnapshot: "旧信", source: "manual" }],
                    locationId: "l1",
                    locationVariantId: "v1",
                })],
            }],
        }],
        characters: [character],
        locations: [location],
        props: [prop],
        costumes: [],
        scriptAnalysis: {
            schemaVersion: 1, parserVersion: "1", scriptHash: "hash",
            characters: [{ name: "阿青", aliases: [], role: "", description: "" }],
            relationships: [],
            scenes: [{
                sceneIndex: 0, episode: "第1集", heading: "1-1 咖啡馆 夜", sourceHash: "h",
                characters: ["阿青"], summary: "", mood: "", props: ["旧信"], productionNotes: [], beats: [], relationships: [],
                costumes: [{ character: "阿青", description: "白衬衫" }],
            }],
        },
        createdAt: "", updatedAt: "",
    };
    const table = buildFilmBreakdownTable(project);
    assert.deepEqual(table.episodes, ["第1集"]);
    const byName = (name: string) => table.rows.find((row) => row.name === name)!;
    assert.equal(byName("阿青").status, "ready");
    assert.equal(byName("阿青").cells["第1集"], "ready");
    assert.equal(byName("旧信").status, "missing");
    assert.equal(byName("咖啡馆 · 夜·雨").status, "unlocked");
    assert.equal(byName("咖啡馆 · 夜·雨").cells["第1集"], "unlocked");
    assert.equal(byName("阿青 · 白衬衫").status, "unbuilt");
    assert.equal(byName("阿青 · 白衬衫").cells["第1集"], "unbuilt");
});
