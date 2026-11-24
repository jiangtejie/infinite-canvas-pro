import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { comicPageImage, resolveComicPageSlots } from "./comic-book-state";

function imageNode(id: string, content = "data:image/png;base64,test"): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 300, height: 420, metadata: { content } };
}

function comicPageNode(id: string, withImage = true): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.ComicPage,
        title: id,
        position: { x: 0, y: 0 },
        width: 300,
        height: 420,
        metadata: {
            comicPage: {
                title: id,
                summary: "",
                chapterId: "ch1",
                panels: [],
                reviewStatus: "draft",
                reviewNotes: "",
                ...(withImage ? { pageImage: { url: `https://example.com/${id}.png` } } : {}),
            },
        },
    };
}

function textNode(id: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Text, title: id, position: { x: 0, y: 0 }, width: 200, height: 100, metadata: { content: "not an image" } };
}

test("preserves missing comic page slots in book order", () => {
    const result = resolveComicPageSlots({
        pageNodeIds: ["image-a", "gone", "text-node", "empty-image", "image-b"],
        nodes: [imageNode("image-a"), textNode("text-node"), imageNode("empty-image", ""), imageNode("image-b")],
    });

    assert.deepEqual(result.pageSlots.map((slot) => slot.kind), ["available", "missing", "missing", "missing", "available"]);
    assert.deepEqual(result.missingPageIds, ["gone", "text-node", "empty-image"]);
    assert.deepEqual(result.validPages.map((page) => page.id), ["image-a", "image-b"]);
});

test("reads page images from comic pages and generic image pages", () => {
    assert.deepEqual(comicPageImage(comicPageNode("page-a")), { url: "https://example.com/page-a.png" });
    assert.deepEqual(comicPageImage(imageNode("image-a")), { url: "data:image/png;base64,test", storageKey: undefined });
    assert.equal(comicPageImage(comicPageNode("page-empty", false)), undefined);
});

test("recognizes comic page nodes with a composed page image", () => {
    const result = resolveComicPageSlots({
        pageNodeIds: ["page-a", "page-empty"],
        nodes: [comicPageNode("page-a"), comicPageNode("page-empty", false)],
    });

    assert.deepEqual(result.pageSlots.map((slot) => slot.kind), ["available", "missing"]);
    assert.deepEqual(result.missingPageIds, ["page-empty"]);
});
