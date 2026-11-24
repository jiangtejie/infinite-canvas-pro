import assert from "node:assert/strict";
import test from "node:test";

import type { ComicCharacter, ComicPage, ComicProject } from "@/app/(user)/comic/types";
import { CanvasNodeType } from "../../types";
import { buildComicCanvasProject, type ComicCanvasProjectContext } from "../../utils/comic-canvas-project";
import { applyComicProject, selectComicProject } from "./comic-canvas-projection";

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
    characters: [],
    locations: [],
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
    ...patch,
});

test("projects book pages, chapters and cast from the canvas document", () => {
    const committed = applyComicProject(buildComicCanvasProject("雨夜", context), comicProject({
        chapters: [{ id: "ch1", title: "第一幕", summary: "", pages: [page("p1", "ch1"), page("p2", "ch1")] }],
        characters: [character("char-1", "沈迟")],
    }));
    const book = committed.nodes.find((node) => node.type === CanvasNodeType.Comic);
    assert.deepEqual(book?.metadata?.comicBook?.pageNodeIds, ["p1", "p2"]);
    assert.equal(committed.nodes.filter((node) => node.type === CanvasNodeType.ComicPage).length, 2);
    assert.equal(committed.nodes.find((node) => node.id === "p1")?.metadata?.comicPage?.chapterId, "ch1");
    assert.deepEqual(committed.comic?.chapterOrder, [{ id: "ch1", title: "第一幕" }]);
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
