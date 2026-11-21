import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { normalizeConnection } from "./canvas-connections";
import { canAddFilmConnection } from "./film-connections";

const asset = (id: string, kind: "character" | "location" | "prop" | "costume" | "style"): CanvasNodeData => ({
    id,
    type: CanvasNodeType.FilmAsset,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: { filmAsset: { kind, asset: { id, name: id } as FilmAsset } },
});

const node = (id: string, type: CanvasNodeType): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: {},
});

const nodes = [
    asset("char", "character"),
    asset("loc1", "location"),
    asset("loc2", "location"),
    asset("prop", "prop"),
    asset("costume", "costume"),
    asset("style", "style"),
    node("shot", CanvasNodeType.Shot),
    node("scene1", CanvasNodeType.Scene),
    node("scene2", CanvasNodeType.Scene),
];

test("character/location/prop assets bind to shots in the asset direction", () => {
    assert.deepEqual(normalizeConnection("char", "shot", nodes, "source"), {
        fromNodeId: "char",
        toNodeId: "shot",
        kind: "binding",
        data: { source: "manual" },
    });
    assert.deepEqual(normalizeConnection("shot", "char", nodes, "source"), {
        fromNodeId: "char",
        toNodeId: "shot",
        kind: "binding",
        data: { source: "manual" },
    });
});

test("costume/style cannot connect and film nodes never fall back to generic rules", () => {
    assert.equal(normalizeConnection("costume", "shot", nodes, "source"), null);
    assert.equal(normalizeConnection("style", "shot", nodes, "source"), null);
    assert.equal(normalizeConnection("char", "scene1", nodes, "source"), null);
    assert.equal(normalizeConnection("shot", "shot", nodes, "source"), null);
});

test("scene composition and shot sequence directions", () => {
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
    const shot2 = node("shot2", CanvasNodeType.Shot);
    const withShot2 = [...nodes, shot2];
    assert.deepEqual(normalizeConnection("shot2", "shot", withShot2, "target"), {
        fromNodeId: "shot",
        toNodeId: "shot2",
        kind: "sequence",
    });
});

test("rejects duplicate binding, duplicate location and duplicate scene", () => {
    const existing: CanvasConnection[] = [
        { id: "e1", fromNodeId: "char", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
        { id: "e2", fromNodeId: "loc1", toNodeId: "shot", kind: "binding", data: { source: "manual" } },
        { id: "e3", fromNodeId: "scene1", toNodeId: "shot", kind: "composition" },
    ];
    assert.equal(canAddFilmConnection(normalizeConnection("char", "shot", nodes, "source")!, nodes, existing).ok, false);
    assert.equal(canAddFilmConnection(normalizeConnection("loc2", "shot", nodes, "source")!, nodes, existing).ok, false);
    assert.equal(canAddFilmConnection(normalizeConnection("scene2", "shot", nodes, "source")!, nodes, existing).ok, false);
});

test("rejects sequence cycles and accepts a valid sequence", () => {
    const shot2 = node("shot2", CanvasNodeType.Shot);
    const withShot2 = [...nodes, shot2];
    const existing: CanvasConnection[] = [{ id: "e1", fromNodeId: "shot2", toNodeId: "shot", kind: "sequence" }];
    const cycle = normalizeConnection("shot", "shot2", withShot2, "source")!;
    assert.equal(canAddFilmConnection(cycle, withShot2, existing).ok, false);

    const valid = normalizeConnection("shot", "shot2", withShot2, "source")!;
    assert.equal(canAddFilmConnection(valid, withShot2, []).ok, true);
});
