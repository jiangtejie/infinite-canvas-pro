import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { normalizeConnection } from "./canvas-connections";
import { canAddFilmConnection, filmSequenceCheck } from "./film-connections";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});
const shot = (id: string) => node(id, CanvasNodeType.FilmShot, {
    filmShot: { shotNo: id, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" },
});
const scene = (id: string) => node(id, CanvasNodeType.FilmScene, {
    filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name: id, location: "", time: "", mood: "" },
});
const asset = (id: string, kind: "character" | "location" | "prop" | "style"): CanvasNodeData => {
    const payload = { asset: { id, name: id } as FilmAsset };
    if (kind === "character") return node(id, CanvasNodeType.FilmCharacter, { filmCharacter: payload });
    if (kind === "location") return node(id, CanvasNodeType.FilmLocation, { filmLocation: payload });
    if (kind === "prop") return node(id, CanvasNodeType.FilmProp, { filmProp: payload });
    return node(id, CanvasNodeType.FilmStyle, { filmStyle: payload });
};

const nodes = [
    asset("char", "character"),
    asset("loc1", "location"),
    asset("loc2", "location"),
    asset("prop", "prop"),
    asset("style", "style"),
    shot("shot"),
    scene("scene1"),
    scene("scene2"),
    node("script", CanvasNodeType.FilmScript, { filmScript: { text: "", parseSnapshots: [] } }),
];

test("character/location/prop/style nodes normalize to role-aware context edges", () => {
    assert.deepEqual(normalizeConnection("char", "shot", nodes, "source"), {
        fromNodeId: "char",
        toNodeId: "shot",
        kind: "context",
        data: { role: "character", source: "manual" },
    });
    assert.deepEqual(normalizeConnection("shot", "loc1", nodes, "source"), {
        fromNodeId: "loc1",
        toNodeId: "shot",
        kind: "context",
        data: { role: "location", source: "manual" },
    });
    assert.deepEqual(normalizeConnection("prop", "shot", nodes, "source")?.data, { role: "prop", source: "manual" });
    assert.deepEqual(normalizeConnection("style", "shot", nodes, "source")?.data, { role: "style", source: "manual" });
});

test("film nodes only normalize supported domain relationships", () => {
    assert.equal(normalizeConnection("char", "scene1", nodes, "source"), null);
    assert.equal(normalizeConnection("shot", "shot", nodes, "source"), null);
    assert.equal(normalizeConnection("script", "scene1", nodes, "source"), null);
});

test("normalizes scene composition and shot sequence directions", () => {
    assert.deepEqual(normalizeConnection("scene1", "shot", nodes, "source"), {
        fromNodeId: "scene1",
        toNodeId: "shot",
        kind: "composition",
    });
    assert.deepEqual(normalizeConnection("shot", "scene1", nodes, "source"), {
        fromNodeId: "scene1",
        toNodeId: "shot",
        kind: "composition",
    });
    const withNextShot = [...nodes, shot("shot2")];
    assert.deepEqual(normalizeConnection("shot2", "shot", withNextShot, "target"), {
        fromNodeId: "shot",
        toNodeId: "shot2",
        kind: "sequence",
    });
});

test("validates context roles and permits only one location per shot", () => {
    const existing: CanvasConnection[] = [
        { id: "char->shot", fromNodeId: "char", toNodeId: "shot", kind: "context", data: { role: "character", source: "manual" } },
        { id: "loc1->shot", fromNodeId: "loc1", toNodeId: "shot", kind: "context", data: { role: "location", source: "manual" } },
    ];
    const duplicateCharacter = { fromNodeId: "char", toNodeId: "shot", kind: "context" as const, data: { role: "character" as const, source: "manual" as const } };
    const secondLocation = { fromNodeId: "loc2", toNodeId: "shot", kind: "context" as const, data: { role: "location" as const, source: "manual" as const } };
    const wrongRole = { fromNodeId: "char", toNodeId: "shot2", kind: "context" as const, data: { role: "location" as const, source: "manual" as const } };

    assert.deepEqual(canAddFilmConnection(duplicateCharacter, nodes, existing), { ok: false, reason: "这两个节点已经连接" });
    assert.deepEqual(canAddFilmConnection(secondLocation, nodes, existing), { ok: false, reason: "每个镜头只能引用一个场景" });
    assert.equal(canAddFilmConnection(wrongRole, [...nodes, shot("shot2")], []).ok, false);
    assert.equal(canAddFilmConnection({ ...secondLocation, toNodeId: "scene1" }, nodes, []).ok, false);
});

test("validates composition endpoints and single scene ownership", () => {
    const existing: CanvasConnection[] = [{ id: "scene1->shot", fromNodeId: "scene1", toNodeId: "shot", kind: "composition" }];
    const secondScene = { fromNodeId: "scene2", toNodeId: "shot", kind: "composition" as const };

    assert.deepEqual(canAddFilmConnection(secondScene, nodes, existing), { ok: false, reason: "镜头已归属其他场次，先删除旧连线" });
    assert.equal(canAddFilmConnection({ ...secondScene, toNodeId: "script" }, nodes, []).ok, false);
    assert.equal(canAddFilmConnection({ ...secondScene, fromNodeId: "char" }, nodes, []).ok, false);
});

test("validates derived edge endpoints without imposing context or sequence constraints", () => {
    const valid = { fromNodeId: "script", toNodeId: "scene1", kind: "derived" as const, data: { source: "script-analysis" as const } };
    const invalid = { ...valid, toNodeId: "missing" };

    assert.deepEqual(canAddFilmConnection(valid, nodes, []), { ok: true });
    assert.equal(canAddFilmConnection(invalid, nodes, []).ok, false);
    assert.equal(canAddFilmConnection({ ...valid, toNodeId: "shot" }, nodes, [
        { id: "scene1->shot", fromNodeId: "scene1", toNodeId: "shot", kind: "composition" },
    ]).ok, true);
});

test("rejects sequence cycles and accepts a valid sequence", () => {
    const withNextShot = [...nodes, shot("shot2")];
    const existing: CanvasConnection[] = [{ id: "shot2->shot", fromNodeId: "shot2", toNodeId: "shot", kind: "sequence" }];
    const cycle = { fromNodeId: "shot", toNodeId: "shot2", kind: "sequence" as const };
    assert.equal(canAddFilmConnection(cycle, withNextShot, existing).ok, false);
    assert.equal(canAddFilmConnection(cycle, withNextShot, []).ok, true);
});

test("rejects a sequence self-loop before graph traversal", () => {
    assert.deepEqual(canAddFilmConnection({ fromNodeId: "shot", toNodeId: "shot", kind: "sequence" }, nodes, []), {
        ok: false,
        reason: "连续镜头不能连接自身",
    });
});

test("rejects a second predecessor or successor in the global film chain", () => {
    const withShots = [...nodes, shot("shot2"), shot("shot3")];
    const existing: CanvasConnection[] = [{ id: "shot->shot2", fromNodeId: "shot", toNodeId: "shot2", kind: "sequence" }];
    assert.equal(canAddFilmConnection({ fromNodeId: "shot", toNodeId: "shot3", kind: "sequence" }, withShots, existing).ok, false);
    assert.equal(canAddFilmConnection({ fromNodeId: "shot3", toNodeId: "shot2", kind: "sequence" }, withShots, existing).ok, false);
});

test("validates a normalized connection against a newly created film node", () => {
    const nextShot = shot("shot2");
    const connection = { fromNodeId: "shot", toNodeId: nextShot.id, kind: "sequence" as const };
    const existing: CanvasConnection[] = [{ id: "shot->shot-3", fromNodeId: "shot", toNodeId: "shot3", kind: "sequence" }];
    assert.deepEqual(canAddFilmConnection(connection, [...nodes, nextShot], existing), {
        ok: false,
        reason: "该镜头已有后继，请先删除旧顺序",
    });
});

test("reports non-shot sequence endpoints and branching in an existing graph", () => {
    const graph = [...nodes, shot("shot2"), shot("shot3")];
    const nonShot = filmSequenceCheck(graph, [{ id: "scene->shot", fromNodeId: "scene1", toNodeId: "shot", kind: "sequence" }]);
    assert.equal(nonShot.ok, false);
    const branching = filmSequenceCheck(graph, [
        { id: "shot->shot2", fromNodeId: "shot", toNodeId: "shot2", kind: "sequence" },
        { id: "shot->shot3", fromNodeId: "shot", toNodeId: "shot3", kind: "sequence" },
    ]);
    assert.equal(branching.ok, false);
    const valid = filmSequenceCheck(graph, [
        { id: "shot->shot2", fromNodeId: "shot", toNodeId: "shot2", kind: "sequence" },
        { id: "shot2->shot3", fromNodeId: "shot2", toNodeId: "shot3", kind: "sequence" },
    ]);
    assert.equal(valid.ok, true);
});
