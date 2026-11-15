import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasComicBook, CanvasNodeData, ComicLetterElement } from "../types";
import { CanvasNodeType } from "../types";
import { resolveComicPageSlots } from "./comic-book-state";
import { createComicPage, createComicProject } from "@/app/(user)/comic/utils/comic-project";
import {
    associateComicProject,
    buildComicLetteringSync,
    mapComicBookPagesToProjectPages,
    replaceMissingComicBookPage,
} from "./comic-book-project-link";

function imageNode(id: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: id,
        position: { x: 0, y: 0 },
        width: 300,
        height: 420,
        metadata: { content: `data:image/png;base64,${id}` },
    };
}

function letter(text: string): ComicLetterElement {
    return { id: `letter-${text}`, kind: "speech", text, x: 0.1, y: 0.1, width: 0.3, fontSize: 0.03, align: "left", tail: "right" };
}

test("maps comic book pages to project pages in their explicit order", () => {
    const project = createComicProject({ title: "映射" });
    const pages = [project.chapters[0]!.pages[0]!, createComicPage(2), createComicPage(3)];

    assert.deepEqual(mapComicBookPagesToProjectPages(["node-b", "node-a"], pages), {
        "node-b": pages[0]!.id,
        "node-a": pages[1]!.id,
    });
});

test("associates a project without changing the book presentation state", () => {
    const project = createComicProject({ title: "关联" });
    const pages = [project.chapters[0]!.pages[0]!, createComicPage(2)];
    const book: CanvasComicBook = {
        pageNodeIds: ["node-b", "node-a"],
        coverNodeId: "node-a",
        format: "strip",
        direction: "ltr",
        lettering: { "node-a": [letter("已有贴字")] },
        exportPreset: { pageSize: "b5", dpi: 300, pageNumbers: true, titlePage: true, titlePageText: "封面" },
    };
    const original = structuredClone(book);

    const linked = associateComicProject(book, project.id, pages);

    assert.deepEqual(linked, {
        ...book,
        comicProjectId: project.id,
        pageProjectIds: { "node-b": pages[0]!.id, "node-a": pages[1]!.id },
    });
    assert.deepEqual(book, original);
});

test("syncs lettering by explicit page mapping instead of array position", () => {
    const project = createComicProject({ title: "贴字" });
    const first = project.chapters[0]!.pages[0]!;
    first.panels[0]!.dialogue = "第一页对白";
    const second = createComicPage(2);
    second.panels[0]!.caption = "第二页旁白";
    const third = createComicPage(3);
    project.chapters[0]!.pages = [first, second, third];
    const book: CanvasComicBook = {
        pageNodeIds: ["node-b", "node-a", "node-unmapped"],
        format: "page",
        direction: "rtl",
        pageProjectIds: { "node-b": first.id, "node-a": second.id },
        lettering: { "node-b": [letter("旧贴字")] },
    };
    const pageSlots = resolveComicPageSlots({
        pageNodeIds: book.pageNodeIds,
        nodes: [imageNode("node-b"), imageNode("node-a"), imageNode("node-unmapped")],
    }).pageSlots;

    const result = buildComicLetteringSync({ book, pageSlots, project });

    assert.equal(result.mappedPages, 2);
    assert.equal(result.unmappedPages, 1);
    assert.equal(result.updatedPages, 2);
    assert.equal(result.overwrittenPages, 1);
    assert.equal(result.emptyContentPages, 0);
    assert.equal(result.lettering["node-b"]?.[0]?.text, "第一页对白");
    assert.equal(result.lettering["node-a"]?.[0]?.text, "第二页旁白");
    assert.deepEqual(result.pageProjectIds, book.pageProjectIds);
    assert.equal(book.lettering?.["node-b"]?.[0]?.text, "旧贴字");
});

test("replaces a missing page in place and migrates its page data", () => {
    const oldLetter = letter("旧页贴字");
    const book: CanvasComicBook = {
        pageNodeIds: ["node-a", "gone", "node-b"],
        coverNodeId: "gone",
        format: "page",
        direction: "rtl",
        pageProjectIds: { gone: "project-page" },
        lettering: { gone: [oldLetter] },
    };
    const replacement = imageNode("replacement");

    const result = replaceMissingComicBookPage({ book, missingPageNodeId: "gone", replacementImageNode: replacement });

    assert.equal(result.replaced, true);
    assert.deepEqual(result.book.pageNodeIds, ["node-a", "replacement", "node-b"]);
    assert.equal(result.book.coverNodeId, "replacement");
    assert.equal(result.book.pageProjectIds?.replacement, "project-page");
    assert.deepEqual(result.book.lettering?.replacement, [oldLetter]);
    assert.equal(result.book.pageProjectIds?.gone, undefined);
    assert.equal(result.book.lettering?.gone, undefined);
    assert.deepEqual(book.pageNodeIds, ["node-a", "gone", "node-b"]);
});

test("rejects invalid or already referenced missing-page replacements", () => {
    const book: CanvasComicBook = { pageNodeIds: ["gone", "node-a"], format: "page", direction: "rtl" };
    const invalidResults = [
        replaceMissingComicBookPage({ book, missingPageNodeId: "unknown", replacementImageNode: imageNode("new") }),
        replaceMissingComicBookPage({ book, missingPageNodeId: "gone", replacementImageNode: { ...imageNode("new"), metadata: { content: "" } } }),
        replaceMissingComicBookPage({ book, missingPageNodeId: "gone", replacementImageNode: { ...imageNode("new"), type: CanvasNodeType.Text } }),
        replaceMissingComicBookPage({ book, missingPageNodeId: "gone", replacementImageNode: imageNode("node-a") }),
    ];

    invalidResults.forEach((result) => {
        assert.equal(result.replaced, false);
        assert.equal(result.book, book);
    });
});

test("keeps existing lettering when a mapped project page has no text", () => {
    const project = createComicProject({ title: "无声页" });
    const page = project.chapters[0]!.pages[0]!;
    const book: CanvasComicBook = {
        pageNodeIds: ["node-a"],
        format: "page",
        direction: "rtl",
        pageProjectIds: { "node-a": page.id },
        lettering: { "node-a": [letter("保留")] },
    };
    const pageSlots = resolveComicPageSlots({ pageNodeIds: book.pageNodeIds, nodes: [imageNode("node-a")] }).pageSlots;

    const result = buildComicLetteringSync({ book, pageSlots, project });

    assert.equal(result.mappedPages, 1);
    assert.equal(result.updatedPages, 0);
    assert.equal(result.overwrittenPages, 0);
    assert.equal(result.emptyContentPages, 1);
    assert.deepEqual(result.lettering["node-a"], book.lettering?.["node-a"]);
});
