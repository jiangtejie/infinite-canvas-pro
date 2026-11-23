import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "../../types";
import { arrangeFilmDirectorBoard, FILM_LAYOUT, orderFilmShots } from "./film-layout";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}, position: Position = { x: 0, y: 0 }): CanvasNodeData => ({
    id,
    type,
    title: id,
    position,
    width: 360,
    height: 240,
    metadata,
});

const scene = (id: string, episodeId: string, name: string, position?: Position) =>
    node(id, CanvasNodeType.FilmScene, { filmScene: { episodeId, episodeTitle: episodeId, name, location: "", time: "", mood: "" } }, position);

const shot = (id: string, position?: Position) => node(id, CanvasNodeType.FilmShot, {}, position);

const assetNode = (id: string, role: "character" | "location" | "prop" | "style", position?: Position) => {
    const payload = { asset: { id, name: id } as FilmAsset };
    if (role === "character") return node(id, CanvasNodeType.FilmCharacter, { filmCharacter: payload }, position);
    if (role === "location") return node(id, CanvasNodeType.FilmLocation, { filmLocation: payload }, position);
    if (role === "prop") return node(id, CanvasNodeType.FilmProp, { filmProp: payload }, position);
    return node(id, CanvasNodeType.FilmStyle, { filmStyle: payload }, position);
};

const script = (id: string) => node(id, CanvasNodeType.FilmScript, { filmScript: { text: "", parseSnapshots: [] } });

const beat = (id: string) => node(id, CanvasNodeType.FilmBeat, { filmBeat: { title: id, mode: "grid9", prompt: "", frames: [], status: "idle", progress: 0 } });

const composition = (sceneId: string, shotId: string): CanvasConnection => ({ id: `${sceneId}->${shotId}`, fromNodeId: sceneId, toNodeId: shotId, kind: "composition" });

const sequence = (from: string, to: string): CanvasConnection => ({ id: `${from}->${to}`, fromNodeId: from, toNodeId: to, kind: "sequence" });

const beatContext = (beatId: string, shotId: string): CanvasConnection => ({
    id: `${beatId}->${shotId}`,
    fromNodeId: beatId,
    toNodeId: shotId,
    kind: "context",
    data: { role: "beat", source: "manual" },
});

function positionOf(nodes: CanvasNodeData[], id: string): Position {
    const found = nodes.find((item) => item.id === id);
    assert.ok(found, `missing node ${id}`);
    return found.position;
}

test("orders shots by the single global sequence chain", () => {
    const ordered = orderFilmShots([shot("b2"), shot("a2"), shot("b1"), shot("a1")], [
        sequence("a1", "a2"),
        sequence("a2", "b1"),
        sequence("b1", "b2"),
    ]);
    assert.deepEqual(ordered.map((item) => item.id), ["a1", "a2", "b1", "b2"]);
});

test("appends disconnected shots by position instead of dropping them", () => {
    const orderly = shot("orderly", { x: 0, y: 0 });
    const looseLate = shot("loose-late", { x: 0, y: 300 });
    const looseEarly = shot("loose-early", { x: 0, y: 100 });
    assert.deepEqual(
        orderFilmShots([looseLate, looseEarly, orderly], [sequence("orderly", "loose-late")]).map((item) => item.id),
        ["orderly", "loose-late", "loose-early"],
    );
});

test("orders scenes into stable columns by episode and position", () => {
    const arranged = arrangeFilmDirectorBoard([
        scene("scene-b", "ep-2", "B", { x: 0, y: 900 }),
        scene("scene-a2", "ep-1", "A2", { x: 0, y: 500 }),
        scene("scene-a1", "ep-1", "A1", { x: 0, y: 0 }),
    ], []);
    assert.deepEqual(positionOf(arranged, "scene-a1"), { x: 0, y: 0 });
    assert.deepEqual(positionOf(arranged, "scene-a2"), { x: FILM_LAYOUT.columnWidth, y: 0 });
    assert.deepEqual(positionOf(arranged, "scene-b"), { x: FILM_LAYOUT.columnWidth * 2, y: 0 });
});

test("orders shots by global sequence inside columns even when scenes interleave", () => {
    const arranged = arrangeFilmDirectorBoard([
        scene("scene-a", "ep-1", "A"),
        scene("scene-b", "ep-2", "B"),
        shot("shot-1", { x: 500, y: 700 }),
        shot("shot-2", { x: 20, y: 10 }),
        shot("shot-3", { x: 900, y: 100 }),
    ], [
        composition("scene-a", "shot-1"),
        composition("scene-b", "shot-3"),
        composition("scene-a", "shot-2"),
        sequence("shot-1", "shot-3"),
        sequence("shot-3", "shot-2"),
    ]);
    // 全片顺序 1 → 3 → 2：场次列内仍按 sequence 自上而下排列。
    assert.deepEqual(positionOf(arranged, "shot-1"), { x: 0, y: FILM_LAYOUT.sceneHeight });
    assert.deepEqual(positionOf(arranged, "shot-3"), { x: FILM_LAYOUT.columnWidth, y: FILM_LAYOUT.sceneHeight });
    assert.deepEqual(positionOf(arranged, "shot-2"), { x: 0, y: FILM_LAYOUT.sceneHeight + FILM_LAYOUT.rowHeight });
    assert.ok(positionOf(arranged, "shot-2").y > positionOf(arranged, "shot-1").y);
});

test("keeps script and context nodes in a context band outside the shot columns", () => {
    const connections: CanvasConnection[] = [composition("scene-1", "shot-1")];
    const frozen = JSON.stringify(connections);
    const arranged = arrangeFilmDirectorBoard([
        scene("scene-1", "ep-1", "A"),
        shot("shot-1"),
        script("script-1"),
        assetNode("style-1", "style"),
        assetNode("char-1", "character"),
        assetNode("loc-1", "location"),
        assetNode("prop-1", "prop"),
    ], connections);
    const contexts = ["script-1", "style-1", "char-1", "loc-1", "prop-1"].map((id) => positionOf(arranged, id));
    contexts.forEach((position) => assert.ok(position.x < 0, "context band must sit left of the shot columns"));
    assert.equal(new Set(contexts.map((position) => position.x)).size, 1, "context band shares one x");
    assert.equal(new Set(contexts.map((position) => position.y)).size, contexts.length, "context nodes stack without overlap");
    assert.ok(positionOf(arranged, "shot-1").x >= 0);
    assert.equal(JSON.stringify(connections), frozen, "arranging must not mutate edge data");
});

test("keeps beat nodes beside their context target shot", () => {
    const connections: CanvasConnection[] = [
        composition("scene-1", "shot-1"),
        composition("scene-1", "shot-2"),
        sequence("shot-1", "shot-2"),
        beatContext("beat-1", "shot-2"),
    ];
    const arranged = arrangeFilmDirectorBoard([scene("scene-1", "ep-1", "A"), shot("shot-1"), shot("shot-2"), beat("beat-1")], connections);
    const target = positionOf(arranged, "shot-2");
    const beatPosition = positionOf(arranged, "beat-1");
    assert.equal(beatPosition.x, target.x + FILM_LAYOUT.beatOffsetX);
    assert.ok(Math.abs(beatPosition.y - target.y) < FILM_LAYOUT.rowHeight);
    assert.equal(connections.filter((edge) => edge.kind === "context").length, 1);
    assert.equal(connections.find((edge) => edge.id === "beat-1->shot-2")?.toNodeId, "shot-2");
});

test("appends unassigned shots after the last scene column", () => {
    const arranged = arrangeFilmDirectorBoard([
        scene("scene-1", "ep-1", "A"),
        shot("shot-1"),
        shot("loose"),
    ], [composition("scene-1", "shot-1"), sequence("shot-1", "loose")]);
    assert.deepEqual(positionOf(arranged, "shot-1"), { x: 0, y: FILM_LAYOUT.sceneHeight });
    assert.deepEqual(positionOf(arranged, "loose"), { x: FILM_LAYOUT.columnWidth, y: 0 });
});

test("leaves generic nodes untouched and does not mutate input positions", () => {
    const generic = node("text-1", CanvasNodeType.Text, { content: "通用文本" }, { x: 123, y: 456 });
    const sceneNode = scene("scene-1", "ep-1", "A", { x: 40, y: 50 });
    const arranged = arrangeFilmDirectorBoard([sceneNode, generic, shot("shot-1")], [composition("scene-1", "shot-1")]);
    assert.deepEqual(positionOf(arranged, "text-1"), { x: 123, y: 456 });
    assert.deepEqual(sceneNode.position, { x: 40, y: 50 });
});
