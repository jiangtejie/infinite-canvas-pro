import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "../../types";
import { arrangeFilmDirectorBoard, buildFilmBoardRelations, FILM_LAYOUT, orderFilmShots, placeFilmNodes } from "./film-layout";

const TEST_SHOT_HEIGHT = 240;

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

test("orders scenes into stable columns by current position", () => {
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
    assert.deepEqual(positionOf(arranged, "shot-2"), { x: 0, y: FILM_LAYOUT.sceneHeight + TEST_SHOT_HEIGHT + FILM_LAYOUT.shotGap });
    assert.ok(positionOf(arranged, "shot-2").y > positionOf(arranged, "shot-1").y);
});

test("stacks default-size shots without overlapping after arrange", () => {
    const size = NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot];
    const defaultShot = (id: string): CanvasNodeData => ({ ...shot(id), width: size.width, height: size.height });
    const arranged = arrangeFilmDirectorBoard([
        scene("scene-1", "ep-1", "A"),
        defaultShot("shot-1"),
        defaultShot("shot-2"),
        defaultShot("shot-3"),
    ], [
        composition("scene-1", "shot-1"),
        composition("scene-1", "shot-2"),
        composition("scene-1", "shot-3"),
        sequence("shot-1", "shot-2"),
        sequence("shot-2", "shot-3"),
    ]);
    const positions = ["shot-1", "shot-2", "shot-3"].map((id) => positionOf(arranged, id));
    positions.slice(1).forEach((position, index) => {
        assert.ok(position.y >= positions[index].y + size.height, "adjacent shots must not overlap");
    });
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
    assert.ok(Math.abs(beatPosition.y - target.y) < TEST_SHOT_HEIGHT + FILM_LAYOUT.shotGap);
    assert.equal(connections.filter((edge) => edge.kind === "context").length, 1);
    assert.equal(connections.find((edge) => edge.id === "beat-1->shot-2")?.toNodeId, "shot-2");
});

test("shares first-wins composition and beat relations between layout and overlay", () => {
    const nodes = [scene("scene-a", "ep-1", "A"), scene("scene-b", "ep-2", "B"), shot("shot-1"), beat("beat-1")];
    const connections = [composition("scene-a", "shot-1"), composition("scene-b", "shot-1"), beatContext("beat-1", "shot-1")];
    const relations = buildFilmBoardRelations(nodes, connections);
    assert.equal(relations.ownerByShot.get("shot-1"), "scene-a");
    assert.equal(relations.beatTargetByBeat.get("beat-1"), "shot-1");
    assert.deepEqual(relations.beatsByShot.get("shot-1")?.map((item) => item.id), ["beat-1"]);
    const arranged = arrangeFilmDirectorBoard(nodes, connections);
    assert.equal(positionOf(arranged, "shot-1").x, 0);
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

test("splits a long scene into two shot columns without overlap", () => {
    const shots = Array.from({ length: 7 }, (_, index) => shot(`shot-${index + 1}`));
    const connections: CanvasConnection[] = [
        ...shots.map((item) => composition("scene-1", item.id)),
        ...shots.slice(1).map((item, index) => sequence(shots[index].id, item.id)),
    ];
    const arranged = arrangeFilmDirectorBoard([scene("scene-1", "ep-1", "A"), ...shots], connections);
    const positions = shots.map((item) => positionOf(arranged, item.id));
    const columnOffset = 360 + FILM_LAYOUT.shotColumnGap;
    positions.slice(0, 4).forEach((position) => assert.equal(position.x, 0, "left column keeps first half"));
    positions.slice(4).forEach((position) => assert.equal(position.x, columnOffset, "right column holds the rest"));
    assert.deepEqual(positions[4], { x: columnOffset, y: FILM_LAYOUT.sceneHeight }, "right column restarts at the scene top");
    for (let index = 1; index < 4; index += 1) {
        assert.ok(positions[index].y >= positions[index - 1].y + TEST_SHOT_HEIGHT, "left column shots must not overlap");
    }
    for (let index = 5; index < positions.length; index += 1) {
        assert.ok(positions[index].y >= positions[index - 1].y + TEST_SHOT_HEIGHT, "right column shots must not overlap");
    }
});

test("places appended shots into the two-column grid after arrange", () => {
    const baseShots = Array.from({ length: 7 }, (_, index) => shot(`shot-${index + 1}`));
    const connections: CanvasConnection[] = [
        ...baseShots.map((item) => composition("scene-1", item.id)),
        ...baseShots.slice(1).map((item, index) => sequence(baseShots[index].id, item.id)),
    ];
    const base = arrangeFilmDirectorBoard([scene("scene-1", "ep-1", "A"), ...baseShots], connections);
    const extra = shot("shot-8");
    const allConnections = [...connections, composition("scene-1", "shot-8"), sequence("shot-7", "shot-8")];
    const placed = placeFilmNodes(base, allConnections, [extra]);
    const fullyArranged = arrangeFilmDirectorBoard([...base, ...placed], allConnections);
    assert.deepEqual(positionOf(placed, "shot-8"), positionOf(fullyArranged, "shot-8"));
    assert.equal(positionOf(placed, "shot-8").x, 360 + FILM_LAYOUT.shotColumnGap);
});

test("places appended nodes on the same grid as a full arrangement", () => {
    const connections: CanvasConnection[] = [composition("scene-1", "shot-1"), composition("scene-2", "shot-2")];
    const base = arrangeFilmDirectorBoard([
        scene("scene-1", "ep-1", "A"),
        scene("scene-2", "ep-2", "B"),
        shot("shot-1"),
        shot("shot-2"),
        script("script-1"),
        assetNode("char-1", "character"),
    ], connections);
    const newScene = scene("scene-3", "ep-3", "C");
    const newShot = shot("shot-3");
    const newAsset = assetNode("char-2", "character");
    const allConnections = [...connections, composition("scene-3", "shot-3")];
    const frozen = JSON.stringify(base);
    const placed = placeFilmNodes(base, allConnections, [newScene, newShot, newAsset]);
    assert.equal(JSON.stringify(base), frozen, "placing must not move existing nodes");
    const fullyArranged = arrangeFilmDirectorBoard([...base, ...placed], allConnections);
    ["scene-3", "shot-3", "char-2"].forEach((id) => assert.deepEqual(positionOf(placed, id), positionOf(fullyArranged, id), `${id} must match a full arrange`));
});

test("keeps shots of appended scenes inside the new scene column", () => {
    const connections: CanvasConnection[] = [composition("scene-1", "shot-1")];
    const base = arrangeFilmDirectorBoard([scene("scene-1", "ep-1", "A"), shot("shot-1")], connections);
    const newScene = scene("scene-2", "ep-2", "B");
    const newShots = [shot("shot-2"), shot("shot-3")];
    const placed = placeFilmNodes(base, [...connections, composition("scene-2", "shot-2"), composition("scene-2", "shot-3"), sequence("shot-2", "shot-3")], [newScene, ...newShots]);
    const scenePosition = positionOf(placed, "scene-2");
    assert.equal(scenePosition.x, positionOf(base, "scene-1").x + FILM_LAYOUT.columnWidth);
    newShots.forEach((item) => assert.equal(positionOf(placed, item.id).x, scenePosition.x));
});

test("leaves generic nodes untouched and does not mutate input positions", () => {
    const generic = node("text-1", CanvasNodeType.Text, { content: "通用文本" }, { x: 123, y: 456 });
    const sceneNode = scene("scene-1", "ep-1", "A", { x: 40, y: 50 });
    const arranged = arrangeFilmDirectorBoard([sceneNode, generic, shot("shot-1")], [composition("scene-1", "shot-1")]);
    assert.deepEqual(positionOf(arranged, "text-1"), { x: 123, y: 456 });
    assert.deepEqual(sceneNode.position, { x: 40, y: 50 });
});
