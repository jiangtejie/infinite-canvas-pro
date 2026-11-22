import assert from "node:assert/strict";
import test from "node:test";

import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import type { CanvasProject } from "../../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { filmAssetBoundShotNumbers, filmCanvasLibraryUsageIndex } from "./film-library-usage";

const asset = { ...createFilmAsset("character", 1), name: "阿青", sourceLibraryAssetId: "library-1" };
const nodes: CanvasNodeData[] = [
    { id: "char", type: CanvasNodeType.FilmAsset, title: "阿青", position: { x: 0, y: 0 }, width: 200, height: 200, metadata: { filmAsset: { kind: "character", asset } } },
    { id: "shot", type: CanvasNodeType.Shot, title: "01", position: { x: 0, y: 0 }, width: 300, height: 200 },
];
const project = { id: "p1", title: "测试影视", nodes, connections: [{ id: "char->shot", fromNodeId: "char", toNodeId: "shot", kind: "binding", data: { source: "manual" } }] } as CanvasProject;

test("counts library copies and shot bindings from canvas documents", () => {
    const index = filmCanvasLibraryUsageIndex([project], "character");
    assert.deepEqual(index.get("library-1"), { projects: 1, copies: 1, bindings: 1, projectTitles: ["测试影视"] });
    assert.equal(filmCanvasLibraryUsageIndex([project], "location").size, 0);
});

test("lists bound shot numbers in global chain order", () => {
    const shot = (id: string, shotNo: string) => ({
        id,
        type: CanvasNodeType.Shot,
        title: shotNo,
        position: { x: 0, y: 0 },
        width: 300,
        height: 200,
        metadata: { filmShot: { shotNo, shotType: "", cameraMovement: "", duration: 4, description: "", dialogue: "", audio: "", prompt: "" } },
    } as CanvasNodeData);
    const graph = [shot("a", "01"), shot("b", "02"), shot("c", "03"), { id: "char2", type: CanvasNodeType.FilmAsset, title: "阿青", position: { x: 0, y: 0 }, width: 200, height: 200, metadata: { filmAsset: { kind: "character", asset } } } as CanvasNodeData];
    const links = [
        { id: "a->b", fromNodeId: "b", toNodeId: "c", kind: "sequence" as const },
        { id: "seq2", fromNodeId: "a", toNodeId: "b", kind: "sequence" as const },
        { id: "bind-c", fromNodeId: "char2", toNodeId: "c", kind: "binding" as const, data: { source: "manual" as const } },
        { id: "bind-a", fromNodeId: "char2", toNodeId: "a", kind: "binding" as const, data: { source: "manual" as const } },
    ];
    assert.deepEqual(filmAssetBoundShotNumbers(graph, links, "char2"), ["01", "03"]);
    assert.deepEqual(filmAssetBoundShotNumbers(graph, links, "missing"), []);
});
