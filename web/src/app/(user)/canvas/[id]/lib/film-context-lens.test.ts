import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmSceneNodeData, type FilmShotNodeData } from "../../types";
import { selectFilmShotContextLens } from "./film-context-lens";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-22T00:00:00.000Z" });
const sceneNode = (id: string, patch: Partial<FilmSceneNodeData> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Scene,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: "天台", location: "旧城区", time: "深夜", mood: "暴雨", notes: "霓虹闪烁", ...patch } },
});
const shotNode = (id: string, patch: Partial<FilmShotNodeData> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Shot,
    title: id,
    position: { x: 0, y: 0 },
    width: 300,
    height: 180,
    metadata: { filmShot: { shotNo: id, shotType: "中景", cameraMovement: "推近", duration: 4, description: `${id} 描述`, dialogue: "", audio: "", prompt: `${id} 提示词`, ...patch } },
});
const assetNode = (id: string, kind: "character" | "location" | "prop" | "style", asset: FilmAsset): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmAsset,
    title: asset.name,
    position: { x: 0, y: 0 },
    width: 200,
    height: 200,
    metadata: { filmAsset: { kind, asset } },
});

const character = { ...createFilmAsset("character", 1), name: "沈迟", description: "调查记者", visualPrompt: "深色风衣" };
character.character = { ...character.character!, board: appendSlotImage(character.character!.board, image("board")) };
const location = { ...createFilmAsset("location", 1), name: "雨夜天台", description: "暴雨霓虹" };
location.concept = appendSlotImage(location.concept, image("location-concept"));
const prop = { ...createFilmAsset("prop", 1), name: "录音笔" };
prop.concept = appendSlotImage(prop.concept, image("prop-concept"));
const style = { ...createFilmAsset("style", 1), name: "冷峻电影感", visualPrompt: "冷调霓虹" };
style.concept = appendSlotImage(style.concept, image("style-concept"));

const sceneA = sceneNode("scene-a", { name: "前场" });
const sceneB = sceneNode("scene-b", { name: "后场" });
const prev = shotNode("01", { shotNo: "01", imageUrl: "https://example.com/prev.png" });
const target = shotNode("02", { shotNo: "02" });
const nodes = [
    sceneA, sceneB, prev, target,
    assetNode("char", "character", character),
    assetNode("loc", "location", location),
    assetNode("prop", "prop", prop),
    assetNode("style", "style", style),
];
const connections: CanvasConnection[] = [
    { id: "prev-comp", fromNodeId: "scene-a", toNodeId: prev.id, kind: "composition" },
    { id: "target-comp", fromNodeId: "scene-b", toNodeId: target.id, kind: "composition" },
    { id: "seq", fromNodeId: prev.id, toNodeId: target.id, kind: "sequence" },
    { id: "char-bind", fromNodeId: "char", toNodeId: target.id, kind: "binding", data: { source: "manual" } },
    { id: "loc-bind", fromNodeId: "loc", toNodeId: target.id, kind: "binding", data: { source: "manual" } },
    { id: "prop-bind", fromNodeId: "prop", toNodeId: target.id, kind: "binding", data: { source: "manual" } },
];

test("explains scene, bindings, style and the global previous shot", () => {
    const lens = selectFilmShotContextLens(nodes, connections, target.id, { medium: "image", maxReferences: 10 });
    assert.ok(lens);
    assert.equal(lens!.scene?.label, "第 1 集 · 后场");
    assert.equal(lens!.scene?.location, "旧城区");
    assert.equal(lens!.scene?.time, "深夜");
    assert.equal(lens!.scene?.mood, "暴雨");
    assert.equal(lens!.scene?.notes, "霓虹闪烁");
    assert.equal(lens!.styleName, "冷峻电影感");
    assert.equal(lens!.previousShot?.id, prev.id);
    assert.equal(lens!.previousShot?.shotNo, "01");
    assert.deepEqual(lens!.bindings.map((item) => `${item.kind}:${item.name}`), ["character:沈迟", "location:雨夜天台", "prop:录音笔"]);
    assert.ok(lens!.references.some((ref) => ref.role === "character-package"));
    assert.ok(lens!.references.some((ref) => ref.role === "previous-shot"));
    assert.equal(lens!.ready, true);
    assert.equal(lens!.compileError, null);
});

test("warns when the shot has no scene and when project style is missing", () => {
    const loose = shotNode("loose");
    const lens = selectFilmShotContextLens([loose], [], loose.id, { medium: "image", maxReferences: 10 });
    assert.ok(lens);
    assert.equal(lens!.scene, null);
    assert.equal(lens!.styleName, null);
    assert.ok(lens!.issues.some((issue) => issue.level === "warning" && issue.message.includes("未归属场次")));
    assert.ok(lens!.issues.some((issue) => issue.level === "warning" && issue.message.includes("风格圣经")));
});

test("marks a shot without text as not ready", () => {
    const empty = shotNode("empty", { description: "", prompt: "" });
    const lens = selectFilmShotContextLens([empty], [], empty.id, { medium: "image", maxReferences: 10 });
    assert.ok(lens);
    assert.equal(lens!.ready, false);
    assert.ok(lens!.issues.some((issue) => issue.level === "error" && issue.message.includes("缺少画面描述")));
});

test("surfaces compiler failures as a blocking error", () => {
    const lens = selectFilmShotContextLens(nodes, connections, target.id, { medium: "image", maxReferences: 0 });
    assert.ok(lens);
    assert.equal(lens!.ready, false);
    assert.ok(lens!.compileError?.includes("超出参考图上限"));
    assert.ok(lens!.issues.some((issue) => issue.level === "error" && issue.message.includes("超出参考图上限")));
});
