import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { getFilmQuickConnectActions } from "./film-node-registry";

const asset = (id: string, name: string): FilmAsset => ({
    id,
    name,
    aliases: [],
    description: `${name}设定`,
    visualPrompt: "",
    status: "idle",
    concept: { images: [], locked: false },
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
});

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 220,
    metadata,
});

const scene = node("scene-1", CanvasNodeType.FilmScene, {
    filmScene: { episodeId: "episode-1", episodeTitle: "第 1 集", name: "天台", location: "天台", time: "深夜", mood: "压迫" },
});
const shot = node("shot-1", CanvasNodeType.FilmShot, {
    filmShot: { shotNo: "01", shotType: "中景", cameraMovement: "推进", duration: 4, description: "", dialogue: "", audio: "", prompt: "" },
});
const character = node("character-1", CanvasNodeType.FilmCharacter, { filmCharacter: { asset: asset("character-asset", "沈迟") } });
const location = node("location-1", CanvasNodeType.FilmLocation, { filmLocation: { asset: asset("location-asset", "天台") } });
const style = node("style-1", CanvasNodeType.FilmStyle, { filmStyle: { asset: asset("style-asset", "风格圣经") } });

const composition: CanvasConnection = { id: "scene-1->shot-1", fromNodeId: "scene-1", toNodeId: "shot-1", kind: "composition" };
const contextEdge = (fromNodeId: string, role: "character" | "location" | "prop" | "style" | "beat"): CanvasConnection => ({
    id: `${fromNodeId}->shot-1`,
    fromNodeId,
    toNodeId: "shot-1",
    kind: "context",
    data: { role, source: "manual" },
});

const action = (source: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], id: string) => {
    const found = getFilmQuickConnectActions(source, nodes, connections).find((item) => item.id === id);
    assert.ok(found, `expected ${id} to be offered`);
    return found;
};

test("scene quick connect offers a new shot, beat and context actions", () => {
    assert.deepEqual(getFilmQuickConnectActions(scene, [scene], []).map((item) => item.id), [
        "create-shot",
        "create-beat",
        "add-character-context",
        "add-location-context",
        "add-prop-context",
        "add-style-context",
    ]);
});

test("shot quick connect hides a second location context", () => {
    const nodes = [scene, shot, location];
    const connections = [composition, contextEdge("location-1", "location")];
    const ids = getFilmQuickConnectActions(shot, nodes, connections).map((item) => item.id);

    assert.ok(ids.includes("add-character-context"));
    assert.ok(ids.includes("add-style-context"));
    assert.ok(!ids.includes("add-location-context"));
});

test("shot style context links the unique existing style node once", () => {
    const nodes = [scene, shot, style];
    const connections = [composition];
    const result = action(shot, nodes, connections, "add-style-context").create(nodes, connections);

    assert.ok("connections" in result);
    assert.equal(result.nodeId, "style-1");
    assert.equal(result.nodes.length, nodes.length);
    assert.deepEqual(result.connections.at(-1), {
        id: "style-1->shot-1",
        fromNodeId: "style-1",
        toNodeId: "shot-1",
        kind: "context",
        data: { role: "style", source: "manual" },
    });

    const linked = getFilmQuickConnectActions(shot, nodes, result.connections).map((item) => item.id);
    assert.ok(!linked.includes("add-style-context"));
});

test("shot context action links an existing character without creating a node", () => {
    const nodes = [scene, shot, character];
    const connections = [composition];
    const before = structuredClone(nodes);
    const result = action(shot, nodes, connections, "add-character-context").create(nodes, connections);

    assert.ok("connections" in result);
    assert.equal(result.nodeId, "character-1");
    assert.equal(result.nodes.length, before.length);
    assert.deepEqual(result.nodes, before);
    assert.deepEqual(result.connections.at(-1), {
        id: "character-1->shot-1",
        fromNodeId: "character-1",
        toNodeId: "shot-1",
        kind: "context",
        data: { role: "character", source: "manual" },
    });
});

test("shot context action creates a missing context node and its edge atomically", () => {
    const nodes = [scene, shot];
    const connections = [composition];
    const result = action(shot, nodes, connections, "add-prop-context").create(nodes, connections);

    assert.ok("connections" in result);
    assert.equal(result.nodes.length, nodes.length + 1);
    const created = result.nodes.find((item) => item.id === result.nodeId);
    assert.equal(created?.type, CanvasNodeType.FilmProp);
    assert.deepEqual(result.connections.at(-1), {
        id: `${result.nodeId}->shot-1`,
        fromNodeId: result.nodeId,
        toNodeId: "shot-1",
        kind: "context",
        data: { role: "prop", source: "manual" },
    });
});

test("scene context actions create or locate context nodes without inventing scene edges", () => {
    const created = action(scene, [scene], [], "add-character-context").create([scene], []);
    assert.ok("connections" in created);
    assert.equal(created.nodes.length, 2);
    assert.equal(created.connections.length, 0);
    assert.equal(created.nodes.find((item) => item.id === created.nodeId)?.type, CanvasNodeType.FilmCharacter);

    const existing = action(scene, [scene, character], [], "add-character-context").create([scene, character], []);
    assert.ok("connections" in existing);
    assert.equal(existing.nodes.length, 2);
    assert.equal(existing.connections.length, 0);
    assert.equal(existing.nodeId, "character-1");
});

test("style context only reuses the project's single style node", () => {
    const nodes = [scene, style];
    const result = action(scene, nodes, [], "add-style-context").create(nodes, []);
    assert.ok("connections" in result);
    assert.equal(result.nodeId, "style-1");
    assert.equal(result.nodes.length, nodes.length);
    assert.equal(result.connections.length, 0);

    const stale = action(scene, nodes, [], "add-style-context").create([scene], []);
    assert.deepEqual(stale, { error: "项目需要且只能有一个风格圣经节点" });
});

test("scene create-shot reuses the shot domain command", () => {
    const result = action(scene, [scene], [], "create-shot").create([scene], []);

    assert.ok("connections" in result);
    const created = result.nodes.find((item) => item.id === result.nodeId);
    assert.equal(created?.type, CanvasNodeType.FilmShot);
    assert.deepEqual(result.connections.map((edge) => ({ from: edge.fromNodeId, to: edge.toNodeId, kind: edge.kind })), [
        { from: "scene-1", to: result.nodeId, kind: "composition" },
    ]);
});

test("shot create-shot inserts a subsequent shot in the global sequence", () => {
    const second = node("shot-2", CanvasNodeType.FilmShot, { filmShot: { shotNo: "02", shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } });
    const nodes = [scene, shot, second];
    const connections = [composition, { id: "shot-1->shot-2", fromNodeId: "shot-1", toNodeId: "shot-2", kind: "sequence" } as CanvasConnection];
    const result = action(shot, nodes, connections, "create-shot").create(nodes, connections);

    assert.ok("connections" in result);
    const sequence = result.connections.filter((edge) => edge.kind === "sequence").map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`);
    assert.deepEqual(sequence, ["shot-1->" + result.nodeId, result.nodeId + "->shot-2"]);
});

test("character create-character-state adds a state inside the character node", () => {
    const withProfile = node("character-2", CanvasNodeType.FilmCharacter, {
        filmCharacter: {
            asset: {
                ...asset("character-2-asset", "林雾"),
                character: { board: { images: [], locked: false }, propIds: [], states: [] },
            },
        },
    });
    const result = action(withProfile, [withProfile], [], "create-character-state").create([withProfile], []);

    assert.ok("connections" in result);
    assert.equal(result.nodeId, "character-2");
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].metadata?.filmCharacter?.asset.character?.states.length, 1);
    assert.equal(result.connections.length, 0);
});

test("invalid actions return a domain error and no partial graph", () => {
    const createShot = action(scene, [scene], [], "create-shot");
    const missingScene = createShot.create([], []);
    assert.ok("error" in missingScene);
    assert.ok(!("nodes" in missingScene));

    const linkCharacter = action(shot, [scene, shot, character], [composition], "add-character-context");
    const missingShot = linkCharacter.create([character], []);
    assert.ok("error" in missingShot);
    assert.ok(!("nodes" in missingShot));

    const createBeat = action(shot, [scene, shot], [composition], "create-beat");
    const missingSource = createBeat.create([], []);
    assert.deepEqual(missingSource, { error: "源节点已不存在" });
});

test("empty canvas offers film defaults and stops offering a second script", () => {
    assert.deepEqual(getFilmQuickConnectActions(null, [scene], []).map((item) => item.id), [
        "create-script",
        "create-scene",
        "create-character",
        "create-location",
        "create-prop",
        "create-beat",
    ]);

    const script = node("script-1", CanvasNodeType.FilmScript, { filmScript: { text: "", parseSnapshots: [] } });
    assert.deepEqual(getFilmQuickConnectActions(null, [script, scene], []).map((item) => item.id), [
        "create-scene",
        "create-character",
        "create-location",
        "create-prop",
        "create-beat",
    ]);
});

test("context source create-shot creates a shot and links the context", () => {
    const nodes = [scene, character];
    const result = action(character, nodes, [], "create-shot").create(nodes, []);

    assert.ok("connections" in result);
    assert.equal(result.nodes.find((item) => item.id === result.nodeId)?.type, CanvasNodeType.FilmShot);
    assert.deepEqual(
        result.connections.filter((edge) => edge.kind === "composition").map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`),
        [`scene-1->${result.nodeId}`],
    );
    const context = result.connections.find((edge) => edge.kind === "context");
    assert.ok(context);
    assert.equal(context.fromNodeId, "character-1");
    assert.equal(context.toNodeId, result.nodeId);
    assert.equal(context.data?.role, "character");
});

test("invalid actions return an error without mutating the input graph", () => {
    const nodes = [scene];
    const connections = [composition];
    const beforeNodes = structuredClone(nodes);
    const beforeConnections = structuredClone(connections);

    const result = action(shot, [scene, shot], [composition], "create-beat").create(nodes, connections);

    assert.deepEqual(result, { error: "源节点已不存在" });
    assert.deepEqual(nodes, beforeNodes);
    assert.deepEqual(connections, beforeConnections);
});

test("non-film source offers no film quick connect actions", () => {
    const text = node("text-1", CanvasNodeType.Text, { content: "hello" });
    assert.deepEqual(getFilmQuickConnectActions(text, [text], []), []);
});
