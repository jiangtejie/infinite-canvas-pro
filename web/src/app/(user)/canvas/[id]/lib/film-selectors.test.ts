import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { selectActiveFilmShot, selectFilmSceneEntries, selectFilmShotBindings, selectFilmShotEntries, selectFilmStyleName } from "./film-selectors";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

const scene = (id: string, episodeId: string, name: string) => node(id, CanvasNodeType.Scene, {
    filmScene: { episodeId, episodeTitle: episodeId === "ep1" ? "第 1 集" : "第 2 集", name, location: "", time: "", mood: "" },
});
const shot = (id: string) => node(id, CanvasNodeType.Shot, { filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
const asset = (id: string, kind: "character" | "location" | "style") => node(id, CanvasNodeType.FilmAsset, { filmAsset: { kind, asset: { id, name: id } as FilmAsset } });

const nodes = [
    scene("scene1", "ep1", "场景 1"),
    scene("scene2", "ep2", "场景 2"),
    shot("shot1"),
    shot("shot2"),
    shot("shot3"),
    shot("shot4"),
    asset("char", "character"),
    asset("loc", "location"),
    asset("style", "style"),
];

const connections: CanvasConnection[] = [
    { id: "c1", fromNodeId: "scene1", toNodeId: "shot1", kind: "composition" },
    { id: "c2", fromNodeId: "scene1", toNodeId: "shot2", kind: "composition" },
    { id: "c3", fromNodeId: "scene2", toNodeId: "shot3", kind: "composition" },
    { id: "s1", fromNodeId: "shot2", toNodeId: "shot1", kind: "sequence" },
    { id: "b1", fromNodeId: "char", toNodeId: "shot1", kind: "binding", data: { source: "manual" } },
    { id: "b2", fromNodeId: "loc", toNodeId: "shot1", kind: "binding", data: { source: "manual" } },
];

test("groups scenes by episode and orders shots by sequence", () => {
    const scenes = selectFilmSceneEntries(nodes, connections);
    assert.deepEqual(scenes.map((item) => item.id), ["scene1", "scene2", "unassigned"]);
    assert.deepEqual(scenes[0].shots.map((item) => item.shot.id), ["shot2", "shot1"]);
    assert.deepEqual(scenes[2].shots.map((item) => item.shot.id), ["shot4"]);
});

test("selects the preferred shot, falls back to the scene's first shot, and handles empty scenes", () => {
    const scenes = selectFilmSceneEntries(nodes, connections);
    assert.equal(selectActiveFilmShot(scenes, "scene1", "shot1").shot?.shot.id, "shot1");
    assert.equal(selectActiveFilmShot(scenes, "scene1", "missing").shot?.shot.id, "shot2");
    assert.equal(selectActiveFilmShot(scenes, "unassigned", null).shot?.shot.id, "shot4");
    const emptyScene = scene("scene3", "ep3", "空场");
    const emptyScenes = selectFilmSceneEntries([...nodes, emptyScene], connections);
    const active = selectActiveFilmShot(emptyScenes, "scene3", null);
    assert.equal(active.scene?.id, "scene3");
    assert.equal(active.shot, null);
});

test("projects an interleaved global sequence while keeping scene grouping", () => {
    const interleavedNodes = [scene("scene-a", "ep1", "场景 A"), scene("scene-b", "ep1", "场景 B"), shot("a1"), shot("b1"), shot("a2")];
    const interleavedConnections: CanvasConnection[] = [
        { id: "a1-comp", fromNodeId: "scene-a", toNodeId: "a1", kind: "composition" },
        { id: "a2-comp", fromNodeId: "scene-a", toNodeId: "a2", kind: "composition" },
        { id: "b1-comp", fromNodeId: "scene-b", toNodeId: "b1", kind: "composition" },
        { id: "a1->b1", fromNodeId: "a1", toNodeId: "b1", kind: "sequence" },
        { id: "b1->a2", fromNodeId: "b1", toNodeId: "a2", kind: "sequence" },
    ];
    assert.deepEqual(selectFilmShotEntries(interleavedNodes, interleavedConnections).map((entry) => entry.shot.id), ["a1", "b1", "a2"]);
    const scenes = selectFilmSceneEntries(interleavedNodes, interleavedConnections);
    assert.deepEqual(scenes[0].shots.map((entry) => entry.shot.id), ["a1", "a2"]);
    assert.deepEqual(scenes[1].shots.map((entry) => entry.shot.id), ["b1"]);
});

test("collects binding chips and the style name", () => {
    const chips = selectFilmShotBindings(nodes, connections, "shot1");
    assert.deepEqual(chips.map((chip) => ({ id: chip.id, edgeId: chip.edgeId, kind: chip.kind, name: chip.name })), [
        { id: "char", edgeId: "b1", kind: "character", name: "char" },
        { id: "loc", edgeId: "b2", kind: "location", name: "loc" },
    ]);
    assert.equal(selectFilmStyleName(nodes), "style");
});
