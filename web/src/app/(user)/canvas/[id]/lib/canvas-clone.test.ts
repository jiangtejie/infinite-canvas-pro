import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { cloneCanvasNodes } from "./canvas-clone";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 200, height: 200, metadata });

test("cloning a comic with its pages remaps page and cover ids", () => {
    const imageOne = node("image-1", CanvasNodeType.Image, { content: "data:image/png;base64,a" });
    const imageTwo = node("image-2", CanvasNodeType.Image, { content: "data:image/png;base64,b" });
    const comic = node("comic-1", CanvasNodeType.Comic, { comicBook: { pageNodeIds: ["image-1", "image-2"], coverNodeId: "image-2", format: "page", direction: "rtl", lettering: { "image-1": [{ id: "letter-1", kind: "speech", text: "你好", x: 0.1, y: 0.1, width: 0.3, fontSize: 0.03, align: "left", tail: "right" }] } } });
    const result = cloneCanvasNodes([imageOne, imageTwo, comic], { offset: { x: 10, y: 10 } });
    const clonedComic = result.nodes.find((item) => item.type === CanvasNodeType.Comic)!;
    assert.deepEqual(clonedComic.metadata?.comicBook?.pageNodeIds, [result.idMap.get("image-1"), result.idMap.get("image-2")]);
    assert.equal(clonedComic.metadata?.comicBook?.coverNodeId, result.idMap.get("image-2"));
    assert.deepEqual(Object.keys(clonedComic.metadata?.comicBook?.lettering || {}), [result.idMap.get("image-1")]);
});

test("cloning a comic alone keeps existing page references", () => {
    const comic = node("comic-1", CanvasNodeType.Comic, { comicBook: { pageNodeIds: ["image-1"], format: "page", direction: "ltr" } });
    const result = cloneCanvasNodes([comic], { offset: { x: 10, y: 10 } });
    assert.deepEqual(result.nodes[0]!.metadata?.comicBook?.pageNodeIds, ["image-1"]);
});
