import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { createEmptyCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { createFilmAsset } from "./film-asset-factory";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { EMPTY_FILM_CONTEXT_CENTER, selectFilmContextCenter } from "./film-context-center";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-22T00:00:00.000Z" });
const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 200, height: 100, metadata });
const scene = (id: string, name: string) => node(id, CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name, location: "", time: "", mood: "" } });
const shot = (id: string, shotNo: string) => node(id, CanvasNodeType.FilmShot, { filmShot: { shotNo, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
const composition = (sceneId: string, shotId: string): CanvasConnection => ({ id: `${sceneId}->${shotId}`, fromNodeId: sceneId, toNodeId: shotId, kind: "composition" });
const contextEdge = (fromNodeId: string, toNodeId: string, role: "character" | "location" | "prop" | "style", data?: { stateId?: string; variantId?: string }): CanvasConnection =>
    ({ id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId, kind: "context", data: { role, source: "manual", ...data } });

const characterAsset = (patch: Partial<FilmAsset> = {}): FilmAsset => ({
    ...createFilmAsset("character", 1),
    name: "沈迟",
    character: { ...createEmptyCharacterProfile(), board: appendSlotImage(createEmptyCharacterProfile().board, image("char-board")) },
    ...patch,
});
const locationAsset = (patch: Partial<FilmAsset> = {}): FilmAsset => ({
    ...createFilmAsset("location", 1),
    name: "雨夜天台",
    concept: appendSlotImage(createFilmAsset("location", 1).concept, image("loc-concept")),
    ...patch,
});
const propAsset = (patch: Partial<FilmAsset> = {}): FilmAsset => ({ ...createFilmAsset("prop", 1), name: "录音笔", ...patch });
const styleAsset = (name: string): FilmAsset => ({ ...createFilmAsset("style", 1), name, concept: appendSlotImage(createFilmAsset("style", 1).concept, image("style-concept")) });

const character = (id: string, asset: FilmAsset) => node(id, CanvasNodeType.FilmCharacter, { filmCharacter: { asset } });
const location = (id: string, asset: FilmAsset) => node(id, CanvasNodeType.FilmLocation, { filmLocation: { asset } });
const prop = (id: string, asset: FilmAsset) => node(id, CanvasNodeType.FilmProp, { filmProp: { asset } });
const style = (id: string, asset: FilmAsset) => node(id, CanvasNodeType.FilmStyle, { filmStyle: { asset } });

const project = (assetNodes: CanvasNodeData[], extra: CanvasNodeData[], edges: CanvasConnection[]) => {
    const nodes = [
        scene("scene1", "天台"),
        scene("scene2", "仓库"),
        shot("s1", "01"),
        shot("s2", "02"),
        shot("s3", "03"),
        ...assetNodes,
        ...extra,
    ];
    const connections: CanvasConnection[] = [
        composition("scene1", "s1"),
        composition("scene1", "s2"),
        composition("scene2", "s3"),
        { id: "s1->s2", fromNodeId: "s1", toNodeId: "s2", kind: "sequence" },
        { id: "s2->s3", fromNodeId: "s2", toNodeId: "s3", kind: "sequence" },
        ...edges,
    ];
    return { nodes, connections };
};

test("derives shot and scene usage only from context edges in whole-film order", () => {
    const characterNode = character("char", characterAsset());
    const { nodes, connections } = project([characterNode], [], [
        contextEdge("char", "s3", "character"),
        contextEdge("char", "s1", "character"),
        // 角色节点上的 style 角色边角色不匹配，不计入任何一组
        contextEdge("char", "s2", "style"),
    ]);
    const view = selectFilmContextCenter(nodes, connections);
    assert.deepEqual(Object.keys(view.groups), ["character", "location", "prop", "style"]);
    assert.deepEqual(view.groups.character[0].usedShots, [
        { id: "s1", shotNo: "01", sceneLabel: "第 1 集 · 天台" },
        { id: "s3", shotNo: "03", sceneLabel: "第 1 集 · 仓库" },
    ]);
    assert.deepEqual(view.groups.character[0].usedScenes, ["第 1 集 · 天台", "第 1 集 · 仓库"]);
    assert.deepEqual(view.totals, { assets: 1, ready: 1, missing: 0, unused: 0 });
});

test("reports role-specific missing references and stale state or variant bindings", () => {
    const characterNode = character("char", characterAsset({ character: createEmptyCharacterProfile() }));
    const locationNode = location("loc", locationAsset({ concept: { images: [], locked: false } }));
    const propNode = prop("prop", propAsset({ pendingTask: { kind: "image", id: "task-1", startedAt: 1, target: "concept" } }));
    const { nodes, connections } = project([characterNode, locationNode, propNode], [], [
        contextEdge("char", "s1", "character", { stateId: "gone" }),
        contextEdge("loc", "s2", "location", { variantId: "v-gone" }),
    ]);
    const view = selectFilmContextCenter(nodes, connections);
    const characterCard = view.groups.character[0];
    assert.equal(characterCard.ready, false);
    assert.deepEqual(characterCard.missingRefs, ["缺少角色参考板", "镜头 01 引用的造型状态已失效"]);
    assert.deepEqual(view.groups.location[0].missingRefs, ["镜头 02 引用的场景变体已失效"]);
    assert.equal(view.groups.prop[0].pending, true);
    assert.deepEqual(view.groups.prop[0].missingRefs, ["缺少概念图"]);
    assert.deepEqual(view.totals, { assets: 3, ready: 0, missing: 3, unused: 1 });
});

test("flags duplicate style nodes instead of silently keeping one", () => {
    const first = style("style-a", styleAsset("冷峻电影感"));
    const second = style("style-b", styleAsset("暖色胶片"));
    const view = selectFilmContextCenter([first, second], []);
    assert.equal(view.groups.style.length, 2);
    assert.deepEqual([...view.groups.style.map((card) => card.name)].sort(), ["冷峻电影感", "暖色胶片"].sort());
    assert.ok(view.issues.some((issue) => issue.level === "error" && issue.message.includes("风格圣经")), JSON.stringify(view.issues));
    assert.deepEqual(view.totals, { assets: 2, ready: 2, missing: 0, unused: 2 });
});

test("marks a character's used shots as impacted and keeps style global", () => {
    const characterNode = character("char", characterAsset());
    const styleNode = style("style", styleAsset("冷峻电影感"));
    const { nodes, connections } = project([characterNode, styleNode], [], [
        contextEdge("char", "s2", "character"),
    ]);
    const view = selectFilmContextCenter(nodes, connections);
    assert.deepEqual(view.groups.character[0].impactedShots.map((item) => item.shotNo), ["02"]);
    assert.deepEqual(view.groups.style[0].usedShots, []);
    assert.deepEqual(view.groups.style[0].impactedShots.map((item) => item.shotNo), ["01", "02", "03"]);
    assert.equal(view.totals.unused, 0);
});

test("warns when the style bible is missing and reports a style without concept art", () => {
    const withoutStyle = selectFilmContextCenter([], []);
    assert.ok(withoutStyle.issues.some((issue) => issue.level === "warning" && issue.message.includes("缺少风格圣经")));
    const bareStyle = node("style-bare", CanvasNodeType.FilmStyle, { filmStyle: { asset: { ...createFilmAsset("style", 1), name: "未出图风格" } } });
    const view = selectFilmContextCenter([bareStyle], []);
    assert.equal(view.groups.style[0].ready, false);
    assert.deepEqual(view.groups.style[0].missingRefs, ["缺少风格参考图"]);
    assert.deepEqual(view.totals, { assets: 1, ready: 0, missing: 1, unused: 1 });
});

test("ignores derived edges when counting context usage", () => {
    const characterNode = character("char", characterAsset());
    const { nodes, connections } = project([characterNode], [], [
        { id: "derived", fromNodeId: "char", toNodeId: "s1", kind: "derived", data: { source: "script-analysis" } },
    ]);
    const view = selectFilmContextCenter(nodes, connections);
    assert.deepEqual(view.groups.character[0].usedShots, []);
    assert.equal(view.totals.unused, 1);
});

test("keeps costumes out of project groups while preserving character state costume references", () => {
    const costumeState = { id: "st-1", name: "正装", description: "", costumeId: "cos-lib", condition: "", heldPropIds: [], look: { images: [], locked: false } };
    const characterNode = character("char", characterAsset({ character: { ...createEmptyCharacterProfile(), states: [costumeState] } }));
    const view = selectFilmContextCenter([characterNode], []);
    assert.deepEqual(Object.keys(view.groups), ["character", "location", "prop", "style"]);
    assert.deepEqual(view.groups.character[0].costumeRefs, [{ stateId: "st-1", stateName: "正装", costumeId: "cos-lib" }]);
    assert.deepEqual(EMPTY_FILM_CONTEXT_CENTER.groups.character, []);
});

test("checks the used location variant instead of requiring the base concept", () => {
    const base = createFilmAsset("location", 1);
    const readyVariant = { id: "v-ready", name: "雨夜", description: "", concept: appendSlotImage(createFilmAsset("location", 1).concept, image("variant-ready")) };
    const missingVariant = { id: "v-missing", name: "清晨", description: "", concept: createFilmAsset("location", 1).concept };
    const ready = location("loc-ready", { ...base, name: "天台", location: { variants: [readyVariant] } });
    const missing = location("loc-missing", { ...base, name: "仓库", location: { variants: [missingVariant] } });
    const { nodes, connections } = project([ready, missing], [], [
        contextEdge("loc-ready", "s1", "location", { variantId: "v-ready" }),
        contextEdge("loc-missing", "s2", "location", { variantId: "v-missing" }),
    ]);
    const view = selectFilmContextCenter(nodes, connections);
    const readyCard = view.groups.location.find((card) => card.nodeId === "loc-ready")!;
    const missingCard = view.groups.location.find((card) => card.nodeId === "loc-missing")!;
    assert.equal(readyCard.ready, true);
    assert.equal(readyCard.productionReady, true);
    assert.deepEqual(readyCard.missingRefs, []);
    assert.equal(missingCard.ready, false);
    assert.deepEqual(missingCard.missingRefs, ["镜头 02 引用的场景变体缺少概念图"]);
});

test("reports deleted and unillustrated costumes only for states referenced by shots", () => {
    const costume = { ...createFilmAsset("costume", 1), name: "礼服" };
    const deleted = { id: "st-deleted", name: "正装", description: "", costumeId: "cos-gone", condition: "", heldPropIds: [], look: { images: [], locked: false } };
    const unillustrated = { id: "st-empty", name: "礼服", description: "", costumeId: costume.id, condition: "", heldPropIds: [], look: { images: [], locked: false } };
    const unused = { id: "st-unused", name: "睡衣", description: "", costumeId: "cos-unused-gone", condition: "", heldPropIds: [], look: { images: [], locked: false } };
    const board = (id: string) => appendSlotImage(createEmptyCharacterProfile().board, image(id));
    const { nodes, connections } = project([
        character("char-a", characterAsset({ name: "沈迟", character: { ...createEmptyCharacterProfile(), board: board("char-a-board"), states: [deleted, unused] } })),
        character("char-b", characterAsset({ name: "林岚", character: { ...createEmptyCharacterProfile(), board: board("char-b-board"), states: [unillustrated] } })),
    ], [], [
        contextEdge("char-a", "s1", "character", { stateId: "st-deleted" }),
        contextEdge("char-b", "s2", "character", { stateId: "st-empty" }),
    ]);
    const view = selectFilmContextCenter(nodes, connections, [costume]);
    const first = view.groups.character.find((card) => card.nodeId === "char-a")!;
    const second = view.groups.character.find((card) => card.nodeId === "char-b")!;
    assert.deepEqual(first.missingRefs, ["造型「正装」引用的服装已删除"]);
    assert.deepEqual(second.missingRefs, ["造型「礼服」的服装缺少概念图"]);

    const readyCostume = { ...costume, concept: appendSlotImage(costume.concept, image("costume-ready")) };
    const readyView = selectFilmContextCenter(nodes, connections, [readyCostume]);
    const readyCard = readyView.groups.character.find((card) => card.nodeId === "char-b")!;
    assert.equal(readyCard.ready, true);
    assert.deepEqual(readyCard.missingRefs, []);
});

test("deduplicates scene labels by scene node when two scenes share a display label", () => {
    const propNode = prop("prop", propAsset());
    const nodes = [
        scene("scene-a", "天台"),
        scene("scene-b", "天台"),
        shot("s1", "01"),
        shot("s2", "02"),
        propNode,
    ];
    const view = selectFilmContextCenter(nodes, [
        composition("scene-a", "s1"),
        composition("scene-b", "s2"),
        contextEdge("prop", "s1", "prop"),
        contextEdge("prop", "s2", "prop"),
    ]);
    assert.equal(view.groups.prop[0].usedScenes.length, 2);
});
