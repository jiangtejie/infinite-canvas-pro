import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasComicBook } from "@/app/(user)/canvas/types";
import { createComicPage, createComicProject } from "./comic-project";
import { applyComicCanvasWriteback } from "./comic-canvas-writeback";

test("canvas writeback maps bubbles by panel position and reorders pages within chapters", () => {
    const project = createComicProject({ title: "回写" });
    const first = project.chapters[0]!.pages[0]!;
    first.reviewStatus = "approved";
    first.panels[0]!.layout = { x: 0, y: 0.02, w: 1, h: 0.45 };
    first.panels[0]!.dialogue = "旧对白";
    first.panels.push({ ...first.panels[0]!, id: "panel-bottom", dialogue: "", caption: "", sfx: "", layout: { x: 0, y: 0.52, w: 1, h: 0.46 } });
    const second = createComicPage(2);
    second.reviewStatus = "approved";
    second.panels[0]!.layout = { x: 0, y: 0, w: 1, h: 1 };
    project.chapters[0]!.pages = [first, second];
    const book: CanvasComicBook = {
        pageNodeIds: ["node-second", "node-first"],
        format: "page",
        direction: "rtl",
        comicProjectId: project.id,
        pageProjectIds: { "node-first": first.id, "node-second": second.id },
        lettering: {
            "node-first": [
                { id: "speech-1", kind: "speech", text: "新对白", x: 0.1, y: 0.1, width: 0.3, fontSize: 0.03, align: "left", tail: "right" },
                { id: "caption-1", kind: "caption", text: "新旁白", x: 0.1, y: 0.55, width: 0.3, fontSize: 0.03, align: "left", tail: "none" },
                { id: "sfx-1", kind: "sfx", text: "轰", x: 0.1, y: 0.75, width: 0.3, fontSize: 0.03, align: "left", tail: "none" },
            ],
        },
    };

    const result = applyComicCanvasWriteback(project, book);
    assert.equal(result.updatedPages, 1);
    assert.equal(result.updatedPanels, 2);
    assert.equal(result.reorderedChapters, 1);
    assert.equal(result.skippedLetters, 0);
    assert.deepEqual(result.project.chapters[0]!.pages.map((page) => page.id), [second.id, first.id]);
    const updatedFirst = result.project.chapters[0]!.pages.find((page) => page.id === first.id)!;
    const updatedSecond = result.project.chapters[0]!.pages.find((page) => page.id === second.id)!;
    assert.equal(updatedFirst.panels[0]!.dialogue, "新对白");
    assert.equal(updatedFirst.panels[1]!.caption, "新旁白");
    assert.equal(updatedFirst.panels[1]!.sfx, "轰");
    assert.equal(updatedFirst.reviewStatus, "draft");
    assert.equal(updatedSecond.reviewStatus, "approved");
});

test("canvas writeback without a page mapping is rejected", () => {
    const project = createComicProject({ title: "旧漫画册" });
    const book: CanvasComicBook = { pageNodeIds: ["node-1"], format: "page", direction: "rtl", comicProjectId: project.id };
    assert.throws(() => applyComicCanvasWriteback(project, book), /缺少项目页映射/);
});
