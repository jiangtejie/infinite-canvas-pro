import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { createComicPage, createComicProject } from "@/app/(user)/comic/utils/comic-project";
import {
    resolveCanvasComicBookState,
    resolveComicBookPrimaryAction,
    resolveComicPageSlots,
    resolveComicProjectLinkState,
    resolveComicProjectProgress,
} from "./comic-book-state";

function comicNode(pageNodeIds: string[]): CanvasNodeData {
    return {
        id: "comic-1",
        type: CanvasNodeType.Comic,
        title: "测试漫画册",
        position: { x: 0, y: 0 },
        width: 360,
        height: 320,
        metadata: { comicBook: { pageNodeIds, format: "page", direction: "rtl" } },
    };
}

function imageNode(id: string, content = "data:image/png;base64,test"): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: id,
        position: { x: 0, y: 0 },
        width: 300,
        height: 420,
        metadata: { content },
    };
}

function projectNode(id: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Text,
        title: id,
        position: { x: 0, y: 0 },
        width: 200,
        height: 100,
        metadata: { content: "not an image" },
    };
}

test("preserves missing comic page slots in book order", () => {
    const result = resolveComicPageSlots({
        pageNodeIds: ["image-a", "gone", "text-node", "empty-image", "image-b"],
        nodes: [imageNode("image-a"), projectNode("text-node"), imageNode("empty-image", ""), imageNode("image-b")],
    });

    assert.deepEqual(result.pageSlots.map((slot) => slot.kind), ["available", "missing", "missing", "missing", "available"]);
    assert.deepEqual(result.missingPageIds, ["gone", "text-node", "empty-image"]);
    assert.deepEqual(result.validPages.map((page) => page.id), ["image-a", "image-b"]);
});

test("keeps project-link state independent from missing page slots", () => {
    const node = comicNode(["gone"]);
    const metadata = node.metadata!;
    const book = metadata.comicBook!;
    book.comicProjectId = "remote-project";
    const slots = resolveComicPageSlots({ pageNodeIds: book.pageNodeIds, nodes: [] });
    const project = resolveComicProjectLinkState({ projectId: book.comicProjectId, projects: [], projectsHydrated: true });

    assert.equal(project.kind, "project-missing");
    assert.deepEqual(slots.missingPageIds, ["gone"]);
});

test("does not report an unavailable project before comic store hydration", () => {
    assert.deepEqual(resolveComicProjectLinkState({ projectId: "project-1", projects: [], projectsHydrated: false }), { kind: "loading" });
    assert.deepEqual(resolveComicProjectLinkState({ projectId: undefined, projects: [], projectsHydrated: false }), { kind: "standalone" });
    assert.deepEqual(resolveComicProjectLinkState({ projectId: "project-1", projects: [], projectsHydrated: true }), { kind: "project-missing", projectId: "project-1" });
});

test("derives project counts only for the active production stage", () => {
    const project = createComicProject({ title: "进度" });
    const first = project.chapters[0]!.pages[0]!;
    const second = createComicPage(2);
    first.pageImage = { url: "blob:first" };
    first.reviewStatus = "approved";
    project.chapters[0]!.pages = [first, second];

    project.stage = "layout";
    assert.deepEqual(resolveComicProjectProgress(project), { stage: "layout", totalPages: 2, composedPages: 1 });
    project.stage = "review";
    assert.deepEqual(resolveComicProjectProgress(project), { stage: "review", totalPages: 2, approvedPages: 1 });
    project.stage = "script";
    assert.deepEqual(resolveComicProjectProgress(project), { stage: "script", totalPages: 2 });
});

test("chooses the next comic-book action without conflating project and canvas pages", () => {
    const standalone = { kind: "standalone" } as const;
    const empty = resolveComicPageSlots({ pageNodeIds: [], nodes: [] }).pageSlots;
    const missing = resolveComicPageSlots({ pageNodeIds: ["gone"], nodes: [] }).pageSlots;
    const onePage = resolveComicPageSlots({ pageNodeIds: ["image-a"], nodes: [imageNode("image-a")] }).pageSlots;
    const layoutProject = createComicProject({ title: "待合成" });
    layoutProject.stage = "layout";
    layoutProject.chapters[0]!.pages[0]!.pageImage = undefined;
    const reviewProject = createComicProject({ title: "待审" });
    reviewProject.stage = "review";
    reviewProject.chapters[0]!.pages[0]!.reviewStatus = "draft";

    assert.equal(resolveComicBookPrimaryAction({ project: standalone, pageSlots: empty, selectedImageCount: 2 }), "add-selected-pages");
    assert.equal(resolveComicBookPrimaryAction({ project: standalone, pageSlots: empty, selectedImageCount: 0 }), "open-book");
    assert.equal(resolveComicBookPrimaryAction({ project: { kind: "project-missing", projectId: "missing" }, pageSlots: missing, selectedImageCount: 0 }), "handle-missing-pages");
    assert.equal(resolveComicBookPrimaryAction({ project: { kind: "linked", project: layoutProject, progress: resolveComicProjectProgress(layoutProject) }, pageSlots: onePage, selectedImageCount: 0 }), "continue-layout");
    assert.equal(resolveComicBookPrimaryAction({ project: { kind: "linked", project: reviewProject, progress: resolveComicProjectProgress(reviewProject) }, pageSlots: onePage, selectedImageCount: 0 }), "continue-review");
    assert.equal(resolveComicBookPrimaryAction({ project: standalone, pageSlots: onePage, selectedImageCount: 0 }), "open-book");
});

test("uses the state resolver to combine project status and page slots", () => {
    const comic = comicNode(["image-a", "gone"]);
    comic.metadata!.comicBook!.comicProjectId = "project-1";
    const result = resolveCanvasComicBookState({
        node: comic,
        nodes: [comic, imageNode("image-a"), projectNode("text-node")],
        projects: [],
        projectsHydrated: true,
        selectedImageCount: 0,
    });

    assert.equal(result.project.kind, "project-missing");
    assert.deepEqual(result.pageSlots.map((slot) => slot.kind), ["available", "missing"]);
    assert.deepEqual(result.missingPageIds, ["gone"]);
    assert.equal(result.primaryAction, "handle-missing-pages");
});
