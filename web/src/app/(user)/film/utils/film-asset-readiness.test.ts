import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset, FilmShot } from "@/lib/film/types";
import type { FilmGraphReviewContext, FilmGraphReviewInput, FilmGraphReviewShot } from "@/app/(user)/canvas/[id]/lib/film-review-input";
import { createEmptyCharacterProfile } from "./film-character";
import { filmAssetReadiness } from "./film-asset-readiness";
import { selectFilmReviewInput } from "@/app/(user)/canvas/[id]/lib/film-review-input";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/app/(user)/canvas/types";

const emptySlot = { images: [], locked: false };
const slot = (id: string, locked = false) => ({ images: [{ id: `${id}-img`, url: `${id}.png` }], locked });
const asset = (overrides: Partial<FilmAsset> = {}): FilmAsset => ({
    id: "a1", name: "资产", aliases: [], description: "", visualPrompt: "", status: "idle", concept: emptySlot,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});
const shotData = (overrides: Partial<FilmShot> = {}): FilmShot => ({
    id: "s1", shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "",
    characterBindings: [], propBindings: [], ...overrides,
});
const context = (patch: Partial<FilmGraphReviewContext> & Pick<FilmGraphReviewContext, "role" | "name">): FilmGraphReviewContext => ({
    nodeId: `${patch.role}-node`, source: "manual", ...patch,
});
const reviewShot = (shot: FilmShot, contexts: FilmGraphReviewContext[] = []): FilmGraphReviewShot => ({
    id: shot.id, shot, contexts,
});
const reviewInput = (shots: FilmGraphReviewShot[], assets: Partial<FilmGraphReviewInput["assets"]> = {}): FilmGraphReviewInput => ({
    title: "项目", scenes: [], shots, contexts: shots.flatMap((item) => item.contexts.map((itemContext) => ({ ...itemContext, shotId: item.id }))),
    assets: { characters: [], locations: [], props: [], costumes: [], styles: [], ...assets },
});

test("graph review input is accepted without FilmProject or episodes", () => {
    const characterNode: CanvasNodeData = { id: "char-node", type: CanvasNodeType.FilmCharacter, title: "阿青", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: { filmCharacter: { asset: asset({ id: "c1", name: "阿青", character: createEmptyCharacterProfile() }) } } };
    const shotNode: CanvasNodeData = { id: "shot-node", type: CanvasNodeType.FilmShot, title: "01", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: { filmShot: { shotNo: "01", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } } };
    const connections: CanvasConnection[] = [{ id: "context", fromNodeId: "char-node", toNodeId: "shot-node", kind: "context", data: { role: "character", source: "manual" } }];
    const input = selectFilmReviewInput([characterNode, shotNode], connections);
    const report = filmAssetReadiness(input, ["shot-node"]);
    assert.equal(report.checked, 1);
    assert.equal(report.missing[0].name, "阿青");
});

test("角色缺少参考板时标记缺参考", () => {
    const character = asset({ id: "c1", name: "阿青", character: createEmptyCharacterProfile() });
    const report = filmAssetReadiness(reviewInput([reviewShot(shotData({ characterBindings: [] }), [context({ role: "character", name: "阿青", asset: character })])], { characters: [character] }), ["s1"]);
    assert.equal(report.checked, 1);
    assert.equal(report.ready, 0);
    assert.equal(report.missing[0].kind, "character");
    assert.match(report.missing[0].reason, /参考板/);
});

test("有参考板但未锁定只进提示不拦", () => {
    const profile = { ...createEmptyCharacterProfile(), board: slot("board", false) };
    const character = asset({ id: "c1", name: "阿青", character: profile });
    const report = filmAssetReadiness(reviewInput([reviewShot(shotData(), [context({ role: "character", name: "阿青", asset: character })])], { characters: [character] }), ["s1"]);
    assert.equal(report.checked, 1);
    assert.equal(report.ready, 1);
    assert.equal(report.missing.length, 0);
    assert.equal(report.unlocked[0].name, "阿青");
});

test("服装、变体与道具缺概念图时分别标记，未绑定资产不检查", () => {
    const profile = {
        ...createEmptyCharacterProfile(),
        board: slot("board", true),
        states: [{ id: "st1", name: "正装", description: "", costumeId: "cos1", condition: "", heldPropIds: [], look: emptySlot }],
    };
    const character = asset({ id: "c1", name: "阿青", character: profile });
    const costume = asset({ id: "cos1", name: "白衬衫", concept: emptySlot });
    const prop = asset({ id: "p1", name: "旧信", concept: emptySlot });
    const variant = { id: "v1", name: "夜·雨", description: "", concept: emptySlot };
    const location = asset({ id: "l1", name: "咖啡馆", concept: slot("loc", true), location: { variants: [variant] } });
    const unused = asset({ id: "c2", name: "未出场角色", character: createEmptyCharacterProfile() });
    const report = filmAssetReadiness(reviewInput([reviewShot(shotData(), [
        context({ role: "character", name: "阿青", asset: character, stateId: "st1" }),
        context({ role: "prop", name: "旧信", asset: prop }),
        context({ role: "location", name: "咖啡馆", asset: location, variantId: "v1" }),
    ])], { characters: [character, unused], costumes: [costume], props: [prop], locations: [location] }), ["s1"]);
    assert.equal(report.checked, 4);
    assert.equal(report.ready, 1);
    assert.deepEqual(report.missing.map((item) => item.kind).sort(), ["costume", "location", "prop"]);
    assert.equal(report.missing.some((item) => item.name.includes("未出场角色")), false);
});

test("聚合重复镜号时保留每个镜头节点的稳定 ID", () => {
    const character = asset({ id: "c1", name: "阿青", character: createEmptyCharacterProfile() });
    const shots = [
        reviewShot(shotData({ id: "shot-a", shotNo: "01" }), [context({ role: "character", name: "阿青", asset: character })]),
        reviewShot(shotData({ id: "shot-b", shotNo: "01" }), [context({ role: "character", name: "阿青", asset: character })]),
    ];
    const missingReport = filmAssetReadiness(reviewInput(shots, { characters: [character] }), ["shot-a", "shot-b"]);
    assert.deepEqual(missingReport.missing[0].shotNos, ["01"]);
    assert.deepEqual(missingReport.missing[0].shotIds, ["shot-a", "shot-b"]);

    const readyCharacter = asset({ id: "c1", name: "阿青", character: { ...createEmptyCharacterProfile(), board: slot("board", false) } });
    const unlockedReport = filmAssetReadiness(reviewInput(shots.map((item) => ({ ...item, contexts: [context({ role: "character", name: "阿青", asset: readyCharacter })] })), { characters: [readyCharacter] }), ["shot-a", "shot-b"]);
    assert.deepEqual(unlockedReport.unlocked[0].shotNos, ["01"]);
    assert.deepEqual(unlockedReport.unlocked[0].shotIds, ["shot-a", "shot-b"]);
});

test("已删除的绑定资产标记缺参考且没有跳转目标", () => {
    const report = filmAssetReadiness(reviewInput([reviewShot(shotData(), [context({ role: "character", name: "旧角色" })])]), ["s1"]);
    assert.equal(report.missing[0].assetId, undefined);
    assert.match(report.missing[0].reason, /已删除/);
});
