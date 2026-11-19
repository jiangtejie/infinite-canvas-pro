import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmProject, FilmShot } from "@/lib/film/types";
import { createEmptyCharacterProfile } from "./film-character";
import { filmAssetReadiness } from "./film-asset-readiness";

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
const project = (shots: FilmShot[], overrides: Partial<FilmProject> = {}): FilmProject => ({
    id: "p1", title: "项目", visualStyle: "", aspect: "16:9", stylePreset: "custom", stage: "storyboard", scriptText: "",
    episodes: [{ id: "e1", title: "第1集", scenes: [{ id: "sc1", name: "1-1", location: "", time: "", mood: "", shots }] }],
    characters: [], locations: [], props: [], costumes: [], createdAt: "", updatedAt: "", ...overrides,
});

test("角色缺少身份包时标记缺参考", () => {
    const character = asset({ id: "c1", name: "阿青", character: createEmptyCharacterProfile() });
    const report = filmAssetReadiness(project([shot({ characterBindings: [{ characterId: "c1", source: "manual", characterNameSnapshot: "阿青", continuity: {} }] })], { characters: [character] }));
    assert.equal(report.checked, 1);
    assert.equal(report.ready, 0);
    assert.equal(report.missing[0].kind, "character");
    assert.match(report.missing[0].reason, /身份包/);
});

test("有身份包但未锁定只进提示不拦", () => {
    const profile = { ...createEmptyCharacterProfile(), master: slot("master", false) };
    const character = asset({ id: "c1", name: "阿青", character: profile });
    const report = filmAssetReadiness(project([shot({ characterBindings: [{ characterId: "c1", source: "manual", characterNameSnapshot: "阿青", continuity: {} }] })], { characters: [character] }));
    assert.equal(report.checked, 1);
    assert.equal(report.ready, 1);
    assert.equal(report.missing.length, 0);
    assert.equal(report.unlocked[0].name, "阿青");
});

test("服装、变体与道具缺概念图时分别标记，未绑定资产不检查", () => {
    const profile = {
        ...createEmptyCharacterProfile(),
        master: slot("master", true),
        states: [{ id: "st1", name: "正装", description: "", costumeId: "cos1", condition: "", heldPropIds: [], look: emptySlot }],
    };
    const character = asset({ id: "c1", name: "阿青", character: profile });
    const costume = asset({ id: "cos1", name: "白衬衫", concept: emptySlot });
    const prop = asset({ id: "p1", name: "旧信", concept: emptySlot });
    const variant = { id: "v1", name: "夜·雨", description: "", concept: emptySlot };
    const location = asset({ id: "l1", name: "咖啡馆", concept: slot("loc", true), location: { variants: [variant] } });
    const unused = asset({ id: "c2", name: "未出场角色", character: createEmptyCharacterProfile() });
    const report = filmAssetReadiness(project([shot({
        characterBindings: [{ characterId: "c1", stateId: "st1", source: "manual", characterNameSnapshot: "阿青", continuity: {} }],
        propBindings: [{ propId: "p1", propNameSnapshot: "旧信", source: "manual" }],
        locationId: "l1",
        locationVariantId: "v1",
    })], { characters: [character, unused], costumes: [costume], props: [prop], locations: [location] }));
    assert.equal(report.checked, 4);
    assert.equal(report.ready, 1);
    assert.deepEqual(report.missing.map((item) => item.kind).sort(), ["costume", "location", "prop"]);
    assert.equal(report.missing.some((item) => item.name.includes("未出场角色")), false);
});

test("已删除的绑定资产标记缺参考且没有跳转目标", () => {
    const report = filmAssetReadiness(project([shot({ characterBindings: [{ characterId: "gone", source: "ai", characterNameSnapshot: "旧角色", continuity: {} }] })]));
    assert.equal(report.missing[0].assetId, undefined);
    assert.match(report.missing[0].reason, /已删除/);
});
