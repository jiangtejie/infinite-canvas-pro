import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { moveFilmShot, moveFilmShotAcrossScenes, reorderFilmShotSequence } from "./film-shot-reorder";

const filmNode = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});
const sceneNode = (id: string) => filmNode(id, CanvasNodeType.Scene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: id, location: "", time: "", mood: "" } });
const shotNode = (id: string) => filmNode(id, CanvasNodeType.Shot, { filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
const filmNodes = [sceneNode("scene-a"), sceneNode("scene-b"), shotNode("a1"), shotNode("a2"), shotNode("b1"), shotNode("b2")];
const filmConnections: CanvasConnection[] = [
    { id: "a1-comp", fromNodeId: "scene-a", toNodeId: "a1", kind: "composition" },
    { id: "a2-comp", fromNodeId: "scene-a", toNodeId: "a2", kind: "composition" },
    { id: "b1-comp", fromNodeId: "scene-b", toNodeId: "b1", kind: "composition" },
    { id: "b2-comp", fromNodeId: "scene-b", toNodeId: "b2", kind: "composition" },
    { id: "a1->a2", fromNodeId: "a1", toNodeId: "a2", kind: "sequence" },
    { id: "a2->b1", fromNodeId: "a2", toNodeId: "b1", kind: "sequence" },
    { id: "b1->b2", fromNodeId: "b1", toNodeId: "b2", kind: "sequence" },
];


test("moves a shot before or after a target", () => {
    assert.deepEqual(moveFilmShot(["a", "b", "c", "d"], "a", "c", true), ["b", "c", "a", "d"]);
    assert.deepEqual(moveFilmShot(["a", "b", "c", "d"], "d", "a", false), ["d", "a", "b", "c"]);
    assert.deepEqual(moveFilmShot(["a", "b", "c"], "b", "c", false), ["a", "b", "c"]);
    assert.equal(moveFilmShot(["a", "b"], "a", "a", true), null);
    assert.equal(moveFilmShot(["a", "b"], "a", "missing", true), null);
});

test("rebuilds the sequence chain and preserves other edges", () => {
    const connections: CanvasConnection[] = [
        { id: "a->b", fromNodeId: "a", toNodeId: "b", kind: "sequence" },
        { id: "b->c", fromNodeId: "b", toNodeId: "c", kind: "sequence" },
        { id: "c->x", fromNodeId: "c", toNodeId: "x", kind: "sequence" },
        { id: "scene->a", fromNodeId: "scene", toNodeId: "a", kind: "composition" },
    ];
    const next = reorderFilmShotSequence(["c", "a", "b"], connections);
    assert.deepEqual(
        next.map((edge) => `${edge.fromNodeId}->${edge.toNodeId}:${edge.kind}`).sort(),
        ["a->b:sequence", "c->a:sequence", "c->x:sequence", "scene->a:composition"],
    );
});

test("single shot adds no chain and keeps cross-scene edges", () => {
    const connections: CanvasConnection[] = [
        { id: "a->b", fromNodeId: "a", toNodeId: "b", kind: "sequence" },
        { id: "c->a", fromNodeId: "c", toNodeId: "a", kind: "sequence" },
    ];
    assert.deepEqual(reorderFilmShotSequence(["a"], connections), connections);
});

test("moves a shot across scenes and inserts it before a target in the global chain", () => {
    const result = moveFilmShotAcrossScenes(filmNodes, filmConnections, "a2", "scene-b", "b1", false);
    assert.ok(result);
    assert.deepEqual(
        result!.connections.filter((edge) => edge.kind === "composition" && edge.toNodeId === "a2").map((edge) => edge.fromNodeId),
        ["scene-b"],
    );
    assert.deepEqual(
        result!.connections.filter((edge) => edge.kind === "sequence").map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`),
        ["a1->a2", "a2->b1", "b1->b2"],
    );
});

test("moves a shot to the end of a target scene and preserves one composition edge", () => {
    const result = moveFilmShotAcrossScenes(filmNodes, filmConnections, "a1", "scene-b", null, true);
    assert.ok(result);
    assert.equal(result!.connections.filter((edge) => edge.kind === "composition" && edge.toNodeId === "a1").length, 1);
    assert.equal(result!.connections.find((edge) => edge.kind === "composition" && edge.toNodeId === "a1")?.fromNodeId, "scene-b");
    assert.deepEqual(
        result!.connections.filter((edge) => edge.kind === "sequence").map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`),
        ["a2->b1", "b1->b2", "b2->a1"],
    );
});

test("rejects invalid scenes, targets and self drops without mutating input", () => {
    assert.equal(moveFilmShotAcrossScenes(filmNodes, filmConnections, "a1", "scene-missing", null, true), null);
    assert.equal(moveFilmShotAcrossScenes(filmNodes, filmConnections, "missing", "scene-b", null, true), null);
    assert.equal(moveFilmShotAcrossScenes(filmNodes, filmConnections, "a1", "unassigned", null, true), null);
    assert.equal(moveFilmShotAcrossScenes(filmNodes, filmConnections, "a1", "scene-b", "missing", false), null);
    assert.equal(moveFilmShotAcrossScenes(filmNodes, filmConnections, "a1", "scene-b", "a1", false), null);
    assert.equal(filmNodes.length, 6);
    assert.equal(filmConnections.length, 7);
});
