import assert from "node:assert/strict";
import test from "node:test";

import type { ComicCharacter, ComicPage, ComicProject } from "@/app/(user)/comic/types";
import { updateComicPage } from "@/app/(user)/comic/utils/comic-project";
import { CanvasNodeType, type ComicLetterElement } from "../../types";
import { buildComicCanvasProject, type ComicCanvasProjectContext } from "../../utils/comic-canvas-project";
import { applyComicPageReplacement, applyComicProject, applyComicProjectUpdate, selectComicProject } from "./comic-canvas-projection";

const context: ComicCanvasProjectContext = {
    id: "comic-1",
    now: "2026-11-24T00:00:00.000Z",
    viewport: { x: 0, y: 0, k: 1 },
    sidePanel: { open: false, width: 320 },
    agentPanel: { open: false, width: 464 },
};

const page = (id: string, chapterId: string, dialogue = ""): ComicPage => {
    void chapterId;
    return {
        id,
        title: id,
        summary: "",
        reviewStatus: "draft",
        reviewNotes: "",
        panels: [{ id: `${id}-panel`, description: "画面", dialogue, caption: "", sfx: "", characterBindings: [] }],
    };
};

const character = (id: string, name: string) => ({ id, name } as ComicCharacter);

const comicProject = (patch: Partial<ComicProject> = {}): ComicProject => ({
    id: "comic-1",
    title: "雨夜",
    status: "draft",
    stage: "script",
    genre: "悬疑",
    audience: "青年",
    format: "page",
    direction: "rtl",
    logline: "",
    synopsis: "",
    styleGuide: "",
    chapters: [],
    pageOrder: [],
    characters: [],
    locations: [],
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
    ...patch,
});

test("projects book pages, chapters and cast from the canvas document", () => {
    const committed = applyComicProject(buildComicCanvasProject("旧标题", context), comicProject({
        chapters: [{ id: "ch1", title: "第一幕", summary: "", pages: [page("p1", "ch1"), page("p2", "ch1")] }],
        characters: [character("char-1", "沈迟")],
    }));
    const book = committed.nodes.find((node) => node.type === CanvasNodeType.Comic);
    assert.equal(book?.title, "雨夜 漫画册");
    assert.deepEqual(book?.metadata?.comicBook?.pageNodeIds, ["p1", "p2"]);
    assert.equal(committed.nodes.filter((node) => node.type === CanvasNodeType.ComicPage).length, 2);
    assert.ok(committed.nodes.find((node) => node.id === "p1")!.position.x >= book!.position.x + book!.width);
    assert.equal(committed.nodes.find((node) => node.id === "p1")?.metadata?.comicPage?.chapterId, "ch1");
    assert.deepEqual(committed.comic?.chapterOrder, [{ id: "ch1", title: "第一幕", summary: "" }]);
    assert.deepEqual(committed.comic?.cast.characters.map((item) => item.name), ["沈迟"]);

    const view = selectComicProject(committed);
    assert.equal(view?.title, "雨夜");
    assert.deepEqual(view?.chapters.map((chapter) => [chapter.id, chapter.pages.map((item) => item.id)]), [["ch1", ["p1", "p2"]]]);
    assert.deepEqual(view?.characters.map((item) => item.name), ["沈迟"]);
});

test("commits panel edits back to the same comic page node", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一幕", summary: "", pages: [page("p1", "ch1")] }],
    }));
    const view = selectComicProject(canvas)!;
    const edited: ComicProject = {
        ...view,
        chapters: view.chapters.map((chapter) => ({
            ...chapter,
            pages: chapter.pages.map((item) => ({
                ...item,
                panels: item.panels.map((panel) => ({ ...panel, dialogue: "别回头" })),
                reviewStatus: "approved",
            })),
        })),
    };
    const committed = applyComicProject(canvas, edited);
    const pageNode = committed.nodes.find((node) => node.id === "p1");
    assert.equal(pageNode?.metadata?.comicPage?.panels[0].dialogue, "别回头");
    assert.equal(pageNode?.metadata?.comicPage?.reviewStatus, "approved");
    assert.deepEqual(selectComicProject(committed)?.chapters[0].pages[0].panels[0].dialogue, "别回头");
});

test("reorders, adds and removes pages from the book in one commit", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一幕", summary: "", pages: [page("p1", "ch1"), page("p2", "ch1")] }],
    }));
    const view = selectComicProject(canvas)!;
    const next: ComicProject = {
        ...view,
        pageOrder: ["p2", "p1", "p3"],
        chapters: view.chapters.map((chapter) => ({
            ...chapter,
            pages: [chapter.pages[1], chapter.pages[0], page("p3", "ch1")],
        })),
    };
    const committed = applyComicProject(canvas, next);
    const book = committed.nodes.find((node) => node.type === CanvasNodeType.Comic);
    assert.deepEqual(book?.metadata?.comicBook?.pageNodeIds, ["p2", "p1", "p3"]);
    assert.deepEqual(selectComicProject(committed)?.chapters[0].pages.map((item) => item.id), ["p2", "p1", "p3"]);
    assert.ok(committed.nodes.some((node) => node.id === "p3" && node.type === CanvasNodeType.ComicPage));
});

test("keeps pending panel recovery state on the page node", () => {
    const pending = { ...page("p1", "ch1"), pendingPanelTask: { panelIds: ["p1-panel"], startedAt: 123 } };
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一幕", summary: "", pages: [pending] }],
    }));
    const view = selectComicProject(canvas)!;
    assert.deepEqual(view.chapters[0].pages[0].pendingPanelTask, { panelIds: ["p1-panel"], startedAt: 123 });
    const next = applyComicProject(canvas, view);
    assert.deepEqual(selectComicProject(next)?.chapters[0].pages[0].pendingPanelTask, { panelIds: ["p1-panel"], startedAt: 123 });
});

test("keeps pages whose chapter is no longer listed under an unassigned chapter", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一幕", summary: "", pages: [page("p1", "ch1")] }],
    }));
    const orphan = {
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === "p1" ? { ...node, metadata: { ...node.metadata, comicPage: { ...node.metadata!.comicPage!, chapterId: "missing" } } } : node),
    };
    const view = selectComicProject(orphan)!;
    assert.equal(view.chapters[1].id, "unassigned");
    assert.deepEqual(view.chapters[1].pages.map((item) => item.id), ["p1"]);
});

test("preserves interleaved book page order across an unrelated workbench edit", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [
            { id: "ch1", title: "第一章", summary: "", pages: [page("p1", "ch1"), page("p3", "ch1")] },
            { id: "ch2", title: "第二章", summary: "", pages: [page("p2", "ch2")] },
        ],
    }));
    const interleaved = {
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === canvas.comic!.bookNodeId
            ? { ...node, metadata: { ...node.metadata, comicBook: { ...node.metadata!.comicBook!, pageNodeIds: ["p1", "p2", "p3"] } } }
            : node),
    };
    const view = selectComicProject(interleaved)!;
    const committed = applyComicProject(interleaved, { ...view, title: "雨夜·修订" });
    assert.deepEqual(committed.nodes.find((node) => node.id === committed.comic!.bookNodeId)?.metadata?.comicBook?.pageNodeIds, ["p1", "p2", "p3"]);
});

test("keeps missing page slots when workbench edits are committed", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一章", summary: "", pages: [page("p1", "ch1")] }],
    }));
    const withMissing = {
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === canvas.comic!.bookNodeId
            ? { ...node, metadata: { ...node.metadata, comicBook: { ...node.metadata!.comicBook!, pageNodeIds: ["p1", "lost-page"] } } }
            : node),
    };
    const view = selectComicProject(withMissing)!;
    const committed = applyComicProject(withMissing, { ...view, synopsis: "保留缺页提示" });
    assert.deepEqual(committed.nodes.find((node) => node.id === committed.comic!.bookNodeId)?.metadata?.comicBook?.pageNodeIds, ["p1", "lost-page"]);
});

test("preserves cover and lettering attached to missing page slots", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一章", summary: "", pages: [page("p1", "ch1"), page("p2", "ch1")] }],
    }));
    const withMissing = {
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === canvas.comic!.bookNodeId ? {
            ...node,
            metadata: {
                ...node.metadata,
                comicBook: {
                    ...node.metadata!.comicBook!,
                    pageNodeIds: ["p1", "lost-page"],
                    coverNodeId: "lost-page",
                    lettering: {
                        "p1": [{ id: "letter-1", kind: "caption", text: "第一页", x: 0.1, y: 0.1, width: 0.5, fontSize: 0.04, align: "left", tail: "none" }],
                        "lost-page": [{ id: "letter-2", kind: "speech", text: "缺页贴字", x: 0.2, y: 0.2, width: 0.5, fontSize: 0.04, align: "center", tail: "none" }],
                    } satisfies Record<string, ComicLetterElement[]>,
                },
            },
        } : node),
    };
    const committed = applyComicProject(withMissing, { ...selectComicProject(withMissing)!, title: "修订标题" });
    const book = committed.nodes.find((node) => node.id === committed.comic!.bookNodeId)!;
    assert.equal(book.metadata?.comicBook?.coverNodeId, "lost-page");
    assert.deepEqual(book.metadata?.comicBook?.lettering, {
        "p1": [{ id: "letter-1", kind: "caption", text: "第一页", x: 0.1, y: 0.1, width: 0.5, fontSize: 0.04, align: "left", tail: "none" }],
        "lost-page": [{ id: "letter-2", kind: "speech", text: "缺页贴字", x: 0.2, y: 0.2, width: 0.5, fontSize: 0.04, align: "center", tail: "none" }],
    });
});

test("replaces a non-page node in a missing slot without duplicating its id", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一章", summary: "", pages: [page("p1", "ch1")] }],
    }));
    const text = {
        id: "lost-page",
        type: CanvasNodeType.Text,
        title: "错误占用页槽",
        position: { x: 40, y: 60 },
        width: 200,
        height: 120,
        metadata: { content: "占位文本" },
    };
    const image = {
        id: "image-1",
        type: CanvasNodeType.Image,
        title: "补页图片",
        position: { x: 500, y: 300 },
        width: 900,
        height: 1200,
        metadata: { content: "data:image/png;base64,test", naturalWidth: 900, naturalHeight: 1200 },
    };
    const withMissing = {
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === canvas.comic!.bookNodeId ? {
            ...node,
            metadata: { ...node.metadata, comicBook: { ...node.metadata!.comicBook!, pageNodeIds: ["p1", "lost-page"] } },
        } : node),
        connections: [
            { id: "edge-in", fromNodeId: "p1", toNodeId: "lost-page" },
            { id: "edge-out", fromNodeId: "lost-page", toNodeId: canvas.comic!.bookNodeId },
            { id: "edge-keep", fromNodeId: "p1", toNodeId: canvas.comic!.bookNodeId },
        ],
    };
    const committed = applyComicPageReplacement({ ...withMissing, nodes: [...withMissing.nodes, text, image] }, "lost-page", "image-1");
    assert.equal(committed.nodes.filter((node) => node.id === "lost-page").length, 1);
    const replaced = committed.nodes.find((node) => node.id === "lost-page")!;
    assert.equal(replaced.type, CanvasNodeType.ComicPage);
    assert.deepEqual(replaced.position, text.position);
    assert.equal(replaced.metadata?.comicPage?.pageImage?.url, "data:image/png;base64,test");
    assert.deepEqual(committed.connections.map((connection) => connection.id), ["edge-keep"]);
});

test("round trips chapter summaries through comic metadata", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一章", summary: "主角收到失踪者来信", pages: [page("p1", "ch1")] }],
    }));
    assert.equal(selectComicProject(canvas)?.chapters[0]?.summary, "主角收到失踪者来信");
    assert.equal(canvas.comic?.chapterOrder[0]?.summary, "主角收到失踪者来信");
});

test("functional commits preserve unrelated edits made after an async task started", () => {
    const initial = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一章", summary: "", pages: [page("p1", "ch1")] }],
    }));
    const edited = applyComicProject(initial, { ...selectComicProject(initial)!, synopsis: "等待生成时编辑的梗概" });
    const staleView = selectComicProject(initial)!;
    const committed = applyComicProjectUpdate(edited, (current) => {
        assert.equal(current.synopsis, "等待生成时编辑的梗概");
        return updateComicPage(current, "ch1", "p1", { pendingPanelTask: { panelIds: ["p1-panel"], startedAt: 123 } });
    });
    assert.equal(selectComicProject(committed)?.synopsis, "等待生成时编辑的梗概");
    assert.deepEqual(selectComicProject(committed)?.chapters[0].pages[0].pendingPanelTask?.panelIds, ["p1-panel"]);
    assert.notEqual(committed, staleView);
});

test("comic domain keeps format and direction only on project metadata", () => {
    const canvas = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        format: "strip",
        direction: "ltr",
        chapters: [{ id: "ch1", title: "第一章", summary: "", pages: [page("p1", "ch1")] }],
    }));
    const book = canvas.nodes.find((node) => node.id === canvas.comic!.bookNodeId);
    assert.equal(book?.metadata?.comicBook?.format, undefined);
    assert.equal(book?.metadata?.comicBook?.direction, undefined);
    assert.equal(canvas.comic?.format, "strip");
    assert.equal(canvas.comic?.direction, "ltr");
});
