import assert from "node:assert/strict";
import test from "node:test";

import { createFilmAsset } from "@/app/(user)/film/utils/film-edits";
import type { CanvasProject } from "../../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { filmCanvasLibraryUsageIndex } from "./film-library-usage";

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
