import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { arrangeFilmNodes, FILM_LAYOUT, orderFilmShots, orderSceneShots } from "./film-layout";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

const asset = (id: string, kind: "style" | "character"): CanvasNodeData["metadata"] => ({
    filmAsset: { kind, asset: { id, name: id } as FilmAsset },
});

const nodes = [
    node("style", CanvasNodeType.FilmAsset, asset("style", "style")),
    node("script", CanvasNodeType.Script),
    node("char", CanvasNodeType.FilmAsset, asset("char", "character")),
    node("scene1", CanvasNodeType.Scene, { filmScene: { episodeId: "episode-1", episodeTitle: "第 1 集", name: "场景 1", location: "", time: "", mood: "" } }),
    node("scene2", CanvasNodeType.Scene, { filmScene: { episodeId: "episode-2", episodeTitle: "第 2 集", name: "场景 2", location: "", time: "", mood: "" } }),
    node("shot1", CanvasNodeType.Shot),
    node("shot2", CanvasNodeType.Shot),
    node("shot3", CanvasNodeType.Shot),
];

const connections: CanvasConnection[] = [
    { id: "c1", fromNodeId: "scene1", toNodeId: "shot1", kind: "composition" },
    { id: "c2", fromNodeId: "scene1", toNodeId: "shot2", kind: "composition" },
    { id: "s1", fromNodeId: "shot2", toNodeId: "shot1", kind: "sequence" },
];

test("orders shots by sequence chain", () => {
    const ordered = orderSceneShots([nodes[5], nodes[6]], connections);
    assert.deepEqual(ordered.map((item) => item.id), ["shot2", "shot1"]);
});

test("orders every shot by the single global sequence chain", () => {
    const shot = (id: string, y: number) => ({ ...node(id, CanvasNodeType.Shot), position: { x: 0, y } });
    const a1 = shot("a1", 200);
    const a2 = shot("a2", 400);
    const b1 = shot("b1", 100);
    const b2 = shot("b2", 300);
    const chain: CanvasConnection[] = [
        { id: "a1->a2", fromNodeId: "a1", toNodeId: "a2", kind: "sequence" },
        { id: "a2->b1", fromNodeId: "a2", toNodeId: "b1", kind: "sequence" },
        { id: "b1->b2", fromNodeId: "b1", toNodeId: "b2", kind: "sequence" },
    ];
    assert.deepEqual(orderFilmShots([b2, a2, b1, a1], chain).map((item) => item.id), ["a1", "a2", "b1", "b2"]);
});

test("appends disconnected shots by position instead of dropping them", () => {
    const shot = (id: string, y: number) => ({ ...node(id, CanvasNodeType.Shot), position: { x: 0, y } });
    const orderly = shot("orderly", 0);
    const looseLate = shot("loose-late", 300);
    const looseEarly = shot("loose-early", 100);
    const chain: CanvasConnection[] = [{ id: "orderly->loose-late", fromNodeId: "orderly", toNodeId: "loose-late", kind: "sequence" }];
    assert.deepEqual(
        orderFilmShots([looseLate, looseEarly, orderly], chain).map((item) => item.id),
        ["orderly", "loose-late", "loose-early"],
    );
});

test("arranges shots inside a scene by the global chain across interleaved scenes", () => {
    const shot = (id: string, y: number) => ({ ...node(id, CanvasNodeType.Shot), position: { x: 0, y } });
    const scene = (id: string, name: string) => node(id, CanvasNodeType.Scene, { filmScene: { episodeId: "ep1", episodeTitle: "第 1 集", name, location: "", time: "", mood: "" } });
    const a1 = shot("a1", 500);
    const a2 = shot("a2", 0);
    const b1 = shot("b1", 0);
    const links: CanvasConnection[] = [
        { id: "a1-comp", fromNodeId: "scene-a", toNodeId: "a1", kind: "composition" },
        { id: "a2-comp", fromNodeId: "scene-a", toNodeId: "a2", kind: "composition" },
        { id: "b1-comp", fromNodeId: "scene-b", toNodeId: "b1", kind: "composition" },
        { id: "a1->b1", fromNodeId: "a1", toNodeId: "b1", kind: "sequence" },
        { id: "b1->a2", fromNodeId: "b1", toNodeId: "a2", kind: "sequence" },
    ];
    const arranged = arrangeFilmNodes([scene("scene-a", "A"), scene("scene-b", "B"), a1, a2, b1], links);
    const position = (id: string) => arranged.find((item) => item.id === id)?.position;
    assert.deepEqual(position("a1"), { x: 0, y: FILM_LAYOUT.sceneHeight });
    assert.deepEqual(position("a2"), { x: 0, y: FILM_LAYOUT.sceneHeight + FILM_LAYOUT.rowHeight });
    assert.equal(position("b1")?.x, FILM_LAYOUT.columnWidth);
});

test("arranges scenes in columns, shots below and assets on the left rail", () => {
    const arranged = arrangeFilmNodes(nodes, connections);
    const position = (id: string) => arranged.find((item) => item.id === id)?.position;
    assert.deepEqual(position("scene1"), { x: 0, y: 0 });
    assert.deepEqual(position("scene2"), { x: FILM_LAYOUT.columnWidth, y: 0 });
    assert.deepEqual(position("shot2"), { x: 0, y: FILM_LAYOUT.sceneHeight });
    assert.deepEqual(position("shot1"), { x: 0, y: FILM_LAYOUT.sceneHeight + FILM_LAYOUT.rowHeight });
    assert.deepEqual(position("shot3"), { x: FILM_LAYOUT.columnWidth * 2, y: 0 });
    assert.deepEqual(position("style"), { x: FILM_LAYOUT.assetX, y: -420 });
    assert.deepEqual(position("script"), { x: FILM_LAYOUT.assetX, y: FILM_LAYOUT.scriptY });
    assert.deepEqual(position("char"), { x: FILM_LAYOUT.assetX, y: 0 });
});
