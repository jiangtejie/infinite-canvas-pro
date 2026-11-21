import assert from "node:assert/strict";
import test from "node:test";

import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { arrangeFilmNodes, FILM_LAYOUT, orderSceneShots } from "./film-layout";

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
