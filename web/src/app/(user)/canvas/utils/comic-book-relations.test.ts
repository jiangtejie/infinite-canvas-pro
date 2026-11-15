import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { expandComicBookPageRelations } from "./comic-book-relations";

function imageNode(id: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 300, height: 420, metadata: { content: `data:image/png;base64,${id}` } };
}

function comicNode(id: string, pageNodeIds: string[]): CanvasNodeData {
    return { id, type: CanvasNodeType.Comic, title: id, position: { x: 0, y: 0 }, width: 360, height: 320, metadata: { comicBook: { pageNodeIds, format: "page", direction: "rtl" } } };
}

test("selecting a comic highlights its valid pages without synthetic connections", () => {
    const nodes = [comicNode("comic-1", ["image-a", "missing", "image-b"]), imageNode("image-a"), imageNode("image-b")];
    const result = expandComicBookPageRelations({ activeNodeId: "comic-1", nodes, baseNodeIds: new Set(["comic-1"]), baseConnectionIds: new Set(["connection-1"]) });

    assert.deepEqual([...result.nodeIds].sort(), ["comic-1", "image-a", "image-b"]);
    assert.deepEqual([...result.connectionIds], ["connection-1"]);
});

test("selecting a page highlights every comic that references it and their sibling pages", () => {
    const nodes = [
        comicNode("comic-1", ["image-a", "image-shared"]),
        comicNode("comic-2", ["image-shared", "image-c"]),
        imageNode("image-a"),
        imageNode("image-shared"),
        imageNode("image-c"),
    ];
    const result = expandComicBookPageRelations({ activeNodeId: "image-shared", nodes, baseNodeIds: new Set(["image-shared"]), baseConnectionIds: new Set() });

    assert.deepEqual([...result.nodeIds].sort(), ["comic-1", "comic-2", "image-a", "image-c", "image-shared"]);
    assert.equal(result.connectionIds.size, 0);
});

test("does not add unrelated nodes or missing page ids", () => {
    const nodes = [comicNode("comic-1", ["image-a", "gone"]), imageNode("image-a"), imageNode("other")];
    const result = expandComicBookPageRelations({ activeNodeId: "comic-1", nodes, baseNodeIds: new Set(), baseConnectionIds: new Set() });

    assert.deepEqual([...result.nodeIds].sort(), ["comic-1", "image-a"]);
    assert.equal(result.nodeIds.has("other"), false);
});
