import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { createFilmAsset } from "./film-asset-factory";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { selectFilmAssetView } from "./film-asset-view";

const image = (id: string) => ({ id, url: `https://example.com/${id}.png`, createdAt: "2026-11-22T00:00:00.000Z" });
const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 200, height: 100, metadata });
const scene = (id: string, name: string) => node(id, CanvasNodeType.FilmScene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name, location: "", time: "", mood: "" } });
const shot = (id: string) => node(id, CanvasNodeType.FilmShot, { filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
const character = () => ({ ...createFilmAsset("character", 1), name: "阿青", character: { ...createEmptyCharacterProfile(), board: appendSlotImage(createEmptyCharacterProfile().board, image("char-board")) } });
const location = () => ({ ...createFilmAsset("location", 1), name: "雨夜天台", concept: appendSlotImage(createFilmAsset("location", 1).concept, image("loc-concept")) });
const prop = () => ({ ...createFilmAsset("prop", 1), name: "录音笔" });
const style = () => ({ ...createFilmAsset("style", 1), name: "冷峻电影感", concept: appendSlotImage(createFilmAsset("style", 1).concept, image("style-concept")) });

const nodes: CanvasNodeData[] = [
    scene("scene1", "天台"),
    scene("scene2", "仓库"),
    shot("s1"), shot("s2"), shot("s3"),
    node("char", CanvasNodeType.FilmCharacter, { filmCharacter: { asset: character() } }),
    node("loc", CanvasNodeType.FilmLocation, { filmLocation: { asset: location() } }),
    node("prop", CanvasNodeType.FilmProp, { filmProp: { asset: prop() } }),
    node("style", CanvasNodeType.FilmStyle, { filmStyle: { asset: style() } }),
];
const connections: CanvasConnection[] = [
    { id: "scene1->s1", fromNodeId: "scene1", toNodeId: "s1", kind: "composition" },
    { id: "scene1->s2", fromNodeId: "scene1", toNodeId: "s2", kind: "composition" },
    { id: "scene2->s3", fromNodeId: "scene2", toNodeId: "s3", kind: "composition" },
    { id: "char->s1", fromNodeId: "char", toNodeId: "s1", kind: "context", data: { role: "character", source: "manual" } },
    { id: "char->s2", fromNodeId: "char", toNodeId: "s2", kind: "context", data: { role: "character", source: "manual" } },
    { id: "loc->s1", fromNodeId: "loc", toNodeId: "s1", kind: "context", data: { role: "location", source: "manual" } },
];

test("groups context nodes by role with readiness and usage", () => {
    const view = selectFilmAssetView(nodes, connections);
    assert.deepEqual(Object.keys(view.groups), ["character", "location", "prop", "style"]);
    assert.equal(view.groups.character.length, 1);
    assert.equal(view.groups.character[0].ready, true);
    assert.equal(view.groups.character[0].usedShots, 2);
    assert.equal(view.groups.character[0].usedScenes, 1);
    assert.equal(view.groups.location[0].ready, true);
    assert.equal(view.groups.prop[0].ready, false);
    assert.equal(view.groups.style[0].ready, true);
    assert.deepEqual(view.totals, { assets: 4, ready: 3, missing: 1, unused: 1 });
});

test("counts usage only from context edges with a matching role", () => {
    const view = selectFilmAssetView(nodes, [
        ...connections,
        { id: "mismatch", fromNodeId: "prop", toNodeId: "s2", kind: "context", data: { role: "character", source: "manual" } },
    ]);
    assert.equal(view.groups.prop[0].usedShots, 0);
    assert.equal(view.totals.unused, 1);
});

test("marks pending asset generation", () => {
    const pending = node("pending-char", CanvasNodeType.FilmCharacter, {
        filmCharacter: {
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
        { id: "prop->s2", fromNodeId: "prop", toNodeId: "s2", kind: "context", data: { role: "prop", source: "manual" } },
    ]);
    assert.equal(view.groups.prop[0].ready, false);
    assert.equal(view.groups.prop[0].usedShots, 1);
    assert.equal(view.totals.unused, 0);
});
