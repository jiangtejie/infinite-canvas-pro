import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../types";
import type { CanvasProject } from "../stores/use-canvas-store";
import { buildComicCanvasProject, type ComicCanvasProjectContext } from "./comic-canvas-project";
import { comicCanvasProjects, generalCanvasProjects } from "./canvas-project-domain";

const context: ComicCanvasProjectContext = {
    id: "comic-1",
    now: "2026-11-24T00:00:00.000Z",
    viewport: { x: 0, y: 0, k: 1 },
    sidePanel: { open: false, width: 320 },
    agentPanel: { open: false, width: 464 },
};

test("builds a comic canvas project with one book node and comic meta", () => {
    const project = buildComicCanvasProject("雨夜", context);
    assert.equal(project.domain, "comic");
    assert.equal(project.comic?.bookNodeId, "comic-1-comic-book");
    assert.equal(project.comic?.stage, "concept");
    assert.equal(project.comic?.format, "page");
    assert.equal(project.comic?.direction, "rtl");
    const book = project.nodes.find((node) => node.type === CanvasNodeType.Comic);
    assert.equal(book?.id, project.comic?.bookNodeId);
    assert.deepEqual(book?.metadata?.comicBook?.pageNodeIds, []);
});

test("keeps comic projects out of the general canvas list", () => {
    const project = buildComicCanvasProject("雨夜", context) as CanvasProject;
    assert.deepEqual(comicCanvasProjects([project]).map((item) => item.id), ["comic-1"]);
    assert.deepEqual(generalCanvasProjects([project]), []);
});
