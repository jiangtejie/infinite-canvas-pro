import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { selectFilmAssetView } from "./film-asset-view";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-22T00:00:00.000Z" });
const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 200, height: 100, metadata });
const scene = (id: string, name: string) => node(id, CanvasNodeType.Scene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name, location: "", time: "", mood: "" } });
const shot = (id: string) => node(id, CanvasNodeType.Shot, { filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
const character = () => ({ ...createFilmAsset("character", 1), name: "阿青", character: { ...createEmptyCharacterProfile(), board: appendSlotImage(createEmptyCharacterProfile().board, image("char-board")) } });
const location = () => ({ ...createFilmAsset("location", 1), name: "雨夜天台", concept: appendSlotImage(createFilmAsset("location", 1).concept, image("loc-concept")) });
const prop = () => ({ ...createFilmAsset("prop", 1), name: "录音笔" });
const costume = () => ({ ...createFilmAsset("costume", 1), name: "风衣" });
const style = () => ({ ...createFilmAsset("style", 1), name: "冷峻电影感", concept: appendSlotImage(createFilmAsset("style", 1).concept, image("style-concept")) });

const nodes: CanvasNodeData[] = [
    scene("scene1", "天台"),
    scene("scene2", "仓库"),
    shot("s1"), shot("s2"), shot("s3"),
    node("char", CanvasNodeType.FilmAsset, { filmAsset: { kind: "character", asset: character() } }),
    node("loc", CanvasNodeType.FilmAsset, { filmAsset: { kind: "location", asset: location() } }),
    node("prop", CanvasNodeType.FilmAsset, { filmAsset: { kind: "prop", asset: prop() } }),
    node("costume", CanvasNodeType.FilmAsset, { filmAsset: { kind: "costume", asset: costume() } }),
    node("style", CanvasNodeType.FilmAsset, { filmAsset: { kind: "style", asset: style() } }),
];
const connections: CanvasConnection[] = [
    { id: "scene1->s1", fromNodeId: "scene1", toNodeId: "s1", kind: "composition" },
    { id: "scene1->s2", fromNodeId: "scene1", toNodeId: "s2", kind: "composition" },
    { id: "scene2->s3", fromNodeId: "scene2", toNodeId: "s3", kind: "composition" },
    { id: "char->s1", fromNodeId: "char", toNodeId: "s1", kind: "binding", data: { source: "manual" } },
    { id: "char->s2", fromNodeId: "char", toNodeId: "s2", kind: "binding", data: { source: "manual" } },
    { id: "loc->s1", fromNodeId: "loc", toNodeId: "s1", kind: "binding", data: { source: "manual" } },
];

test("groups assets by kind with readiness and usage", () => {
    const view = selectFilmAssetView(nodes, connections);
    assert.equal(view.groups.character.length, 1);
    assert.equal(view.groups.character[0].ready, true);
    assert.equal(view.groups.character[0].usedShots, 2);
    assert.equal(view.groups.character[0].usedScenes, 1);
    assert.equal(view.groups.location[0].ready, true);
    assert.equal(view.groups.prop[0].ready, false);
    assert.equal(view.groups.costume[0].ready, false);
    assert.equal(view.groups.style[0].ready, true);
    assert.deepEqual(view.totals, { assets: 5, ready: 3, missing: 2, unused: 3 });
});

test("builds scene coverage and missing binding notes", () => {
    const view = selectFilmAssetView(nodes, connections);
    const scene1 = view.coverage.find((item) => item.sceneId === "scene1");
    const scene2 = view.coverage.find((item) => item.sceneId === "scene2");
    assert.deepEqual(scene1?.characters.map((item) => item.name), ["阿青"]);
    assert.deepEqual(scene1?.locations.map((item) => item.name), ["雨夜天台"]);
    assert.deepEqual(scene1?.missing, ["1 镜未绑定场景"]);
    assert.deepEqual(scene2?.missing, ["1 镜未绑定角色", "1 镜未绑定场景"]);
});

test("marks pending asset generation", () => {
    const pending = node("pending-char", CanvasNodeType.FilmAsset, {
        filmAsset: {
            kind: "character",
            asset: { ...createFilmAsset("character", 1), name: "待生成", pendingTask: { kind: "image", id: "task", startedAt: 1, target: "board" } },
        },
    });
    const view = selectFilmAssetView([pending], []);
    assert.equal(view.groups.character[0].pending, true);
    assert.equal(view.groups.character[0].ready, false);
});

test("marks missing reference on asset cards used by shots", () => {
    const view = selectFilmAssetView(nodes, [
        ...connections,
        { id: "prop->s2", fromNodeId: "prop", toNodeId: "s2", kind: "binding", data: { source: "manual" } },
    ]);
    assert.equal(view.groups.prop[0].ready, false);
    assert.equal(view.groups.prop[0].usedShots, 1);
    assert.equal(view.totals.unused, 2);
});
