import assert from "node:assert/strict";
import test from "node:test";

import type { FilmEpisode, FilmShot } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { buildFilmParseGraph, undoFilmParseGraph } from "./film-script-parse";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id, type, title: id, position: { x: 0, y: 0 }, width: 300, height: 200, metadata,
});
const filmShot = (id: string, shotNo: string): FilmShot => ({
    id,
    shotNo,
    shotType: "MS",
    cameraMovement: "固定",
    duration: 4,
    description: `${shotNo} 画面`,
    dialogue: "",
    audio: "",
    prompt: `${shotNo} prompt`,
    characterBindings: [],
    propBindings: [],
});
const episode: FilmEpisode = {
    id: "ep-1",
    title: "第 1 集",
    scenes: [{ id: "scene-1", name: "天台", location: "楼顶", time: "夜", mood: "压抑", shots: [filmShot("s1", "01"), filmShot("s2", "02")] }],
};
const script = node("script", CanvasNodeType.FilmScript, { filmScript: { text: "剧本", parseSnapshots: [] } });
const oldScene = node("old-scene", CanvasNodeType.FilmScene, { filmScene: { episodeId: "old", episodeTitle: "", name: "旧场", location: "", time: "", mood: "" } });
const oldShot = node("old-shot", CanvasNodeType.FilmShot, { filmShot: { ...filmShot("old", "09"), prompt: "旧镜头" } });
const oldEdge: CanvasConnection = { id: "old->old-shot", fromNodeId: "old-scene", toNodeId: "old-shot", kind: "composition" };

test("builds dedicated scene and shot nodes with composition/sequence edges and a snapshot", () => {
    const result = buildFilmParseGraph([episode], script, [script, oldScene, oldShot], [oldEdge], "overwrite");
    assert.equal(result.sceneCount, 1);
    assert.equal(result.shotCount, 2);
    assert.equal(result.removedNodeIds.length, 2);
    assert.deepEqual(result.nodes.map((item) => item.type).sort(), [CanvasNodeType.FilmScene, CanvasNodeType.FilmScript, CanvasNodeType.FilmShot, CanvasNodeType.FilmShot].sort());
    assert.deepEqual(result.connections.map((edge) => edge.kind).sort(), ["composition", "composition", "sequence"]);
    const snapshots = result.scriptPatch.parseSnapshots ?? [];
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].removedNodes?.length, 2);
    assert.equal(snapshots[0].nodes.length, 3);
});

test("links the last shot of a scene to the first shot of the next scene", () => {
    const twoScenes: FilmEpisode = {
        id: "ep-1",
        title: "第 1 集",
        scenes: [
            { id: "scene-1", name: "天台", location: "", time: "", mood: "", shots: [filmShot("a", "01"), filmShot("b", "02")] },
            { id: "scene-2", name: "仓库", location: "", time: "", mood: "", shots: [filmShot("c", "03")] },
        ],
    };
    const result = buildFilmParseGraph([twoScenes], script, [], [], "overwrite");
    assert.equal(result.connections.filter((edge) => edge.kind === "sequence").length, 2);
});

test("links appended scenes after the existing chain tail", () => {
    const result = buildFilmParseGraph([episode], script, [script, oldScene, oldShot], [oldEdge], "append");
    const createdShot = result.nodes.find((item) => item.type === CanvasNodeType.FilmShot && item.metadata?.filmShot?.prompt === "01 prompt");
    assert.ok(createdShot);
    assert.ok(result.connections.some((edge) => edge.kind === "sequence" && edge.fromNodeId === oldShot.id && edge.toNodeId === createdShot!.id));
});

test("undo removes generated nodes and restores overwritten nodes", () => {
    const result = buildFilmParseGraph([episode], script, [script, oldScene, oldShot], [oldEdge], "overwrite");
    const parsedScript: CanvasNodeData = {
        ...script,
        metadata: { ...script.metadata, filmScript: { ...script.metadata!.filmScript!, ...result.scriptPatch } },
    };
    const undone = undoFilmParseGraph(parsedScript, result.nodes, result.connections);
    assert.ok(undone);
    assert.deepEqual(undone.nodes.map((item) => item.id).sort(), [oldScene.id, oldShot.id, script.id].sort());
    assert.deepEqual(undone.connections.map((edge) => edge.id), [oldEdge.id]);
    assert.deepEqual(undone.scriptPatch.parseSnapshots, []);
});
