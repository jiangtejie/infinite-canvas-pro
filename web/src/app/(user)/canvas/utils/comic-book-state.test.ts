import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import type { CanvasProject } from "../stores/use-canvas-store";
import { comicBookPageKeyDirection, comicImageReplacementCandidates, comicPageReplacementPayload, comicProjectCardSummary } from "./comic-book-state";

const pageNode = (): CanvasNodeData => ({
    id: "missing-page",
    type: CanvasNodeType.ComicPage,
    title: "缺失页",
    position: { x: 0, y: 0 },
    width: 300,
    height: 400,
    metadata: {
        comicPage: {
            chapterId: "chapter-1",
            title: "原页面",
            summary: "保留摘要",
            panels: [{ id: "panel-1", description: "原画面", dialogue: "原对白", caption: "", sfx: "", characterBindings: [] }],
            reviewStatus: "approved",
            reviewNotes: "保留审稿备注",
            pendingPanelTask: { panelIds: ["panel-1"], startedAt: 123 },
        },
    },
});

const imageNode = (): CanvasNodeData => ({
    id: "image-1",
    type: CanvasNodeType.Image,
    title: "替换图片",
    position: { x: 0, y: 0 },
    width: 900,
    height: 1200,
    metadata: { content: "data:image/png;base64,test", storageKey: "image:1", naturalWidth: 900, naturalHeight: 1200 },
});

test("comic replacement keeps page identity, panels and recovery state", () => {
    const payload = comicPageReplacementPayload([pageNode()], "missing-page", imageNode());
    assert.equal(payload.title, "原页面");
    assert.equal(payload.summary, "保留摘要");
    assert.equal(payload.panels[0]?.dialogue, "原对白");
    assert.equal(payload.reviewStatus, "draft");
    assert.deepEqual(payload.pendingPanelTask, { panelIds: ["panel-1"], startedAt: 123 });
    assert.deepEqual(payload.pageImage, { url: "data:image/png;base64,test", storageKey: "image:1", width: 900, height: 1200 });
});

test("comic replacement creates a page payload when the referenced node is absent", () => {
    const payload = comicPageReplacementPayload([], "lost-page", imageNode());
    assert.equal(payload.title, "替换图片");
    assert.equal(payload.chapterId, "");
    assert.deepEqual(payload.panels, []);
    assert.equal(payload.pageImage?.storageKey, "image:1");
});

test("comic replacement candidates include unreferenced images without relying on selection", () => {
    const panorama = { ...imageNode(), id: "panorama-1", type: CanvasNodeType.Panorama };
    const empty = { ...imageNode(), id: "empty-1", metadata: {} };
    const referenced = { ...imageNode(), id: "referenced-1" };
    const candidates = comicImageReplacementCandidates(
        [imageNode(), panorama, empty, referenced, pageNode()],
        ["referenced-1"],
    );
    assert.deepEqual(candidates.map((node) => node.id), ["image-1", "panorama-1"]);
});

test("comic project card follows book slots without treating uncomposed pages as missing", () => {
    const pages = ["p2", "p1", "p3"].map((id) => ({
        ...pageNode(),
        id,
        title: id,
        metadata: { comicPage: { ...pageNode().metadata!.comicPage!, pageImage: id === "p3" ? undefined : { url: `data:image/png;base64,${id}` } } },
    }));
    const project = {
        nodes: [
            { id: "book", type: CanvasNodeType.Comic, title: "漫画册", position: { x: 0, y: 0 }, width: 360, height: 320, metadata: { comicBook: { pageNodeIds: ["p2", "missing", "p1", "p3"], coverNodeId: "p1" } } },
            ...pages,
            { ...pageNode(), id: "unreferenced", title: "未入册" },
        ],
        comic: { bookNodeId: "book" },
    } as CanvasProject;
    const summary = comicProjectCardSummary(project);
    assert.equal(summary.pageCount, 4);
    assert.equal(summary.composedCount, 2);
    assert.equal(summary.missingCount, 1);
    assert.equal(summary.cover?.id, "p1");
    assert.deepEqual(summary.previews.map((node) => node.id), ["p1", "p2", "p3"]);
});

test("comic page arrow keys ignore form controls, editable content and export settings", () => {
    const target = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable });
    assert.equal(comicBookPageKeyDirection({ key: "ArrowLeft", target: target("DIV") }, false), -1);
    assert.equal(comicBookPageKeyDirection({ key: "ArrowRight", target: target("DIV") }, false), 1);
    assert.equal(comicBookPageKeyDirection({ key: "ArrowRight", target: target("INPUT") }, false), 0);
    assert.equal(comicBookPageKeyDirection({ key: "ArrowLeft", target: target("TEXTAREA") }, false), 0);
    assert.equal(comicBookPageKeyDirection({ key: "ArrowRight", target: target("SELECT") }, false), 0);
    assert.equal(comicBookPageKeyDirection({ key: "ArrowRight", target: target("DIV", true) }, false), 0);
    assert.equal(comicBookPageKeyDirection({ key: "ArrowRight", target: target("DIV") }, true), 0);
    assert.equal(comicBookPageKeyDirection({ key: "Enter", target: target("DIV") }, false), 0);
});
