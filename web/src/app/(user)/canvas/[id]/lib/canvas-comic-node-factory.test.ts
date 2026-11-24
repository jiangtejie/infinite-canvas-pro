import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";

test("creates a comic page node with a page payload", () => {
    const node = createCanvasNode(CanvasNodeType.ComicPage, { x: 0, y: 0 });
    assert.equal(node.type, CanvasNodeType.ComicPage);
    assert.equal(node.metadata?.comicPage?.title, "新页面");
    assert.deepEqual(node.metadata?.comicPage?.panels, []);
    assert.equal(node.metadata?.comicPage?.reviewStatus, "draft");
    assert.equal(node.metadata?.comicPage?.chapterId, "unassigned");
});
