import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type ComicLetterElement } from "@/app/(user)/canvas/types";
import { createCanvasNode } from "@/app/(user)/canvas/[id]/lib/canvas-node-factory";
import { createComicPage, createComicProject } from "./comic-project";
import { buildComicCanvasImport, buildComicCanvasUpdate, findLinkedComicCanvasNode } from "./comic-canvas-import";

test("comic canvas import only includes composed pages and wires a comic book", () => {
    const project = createComicProject({ title: "测试漫画", format: "strip", direction: "ltr" });
    const first = project.chapters[0]!.pages[0]!;
    const second = createComicPage(2);
    const third = createComicPage(3);
    first.pageImage = { url: "blob:first", storageKey: "image:first", width: 1080, height: 1920 };
    third.pageImage = { url: "blob:third", storageKey: "image:third", width: 1080, height: 1920 };
    project.chapters[0]!.pages = [first, second, third];

    const existing = createCanvasNode(CanvasNodeType.Text, { x: 500, y: 300 });
    existing.position = { x: 1000, y: 200 };
    existing.width = 420;
    existing.height = 240;
    const plan = buildComicCanvasImport(project, [existing]);
    assert.equal(plan.pageCount, 2);
    assert.equal(plan.nodes.length, 3);
    const comic = plan.nodes.find((node) => node.type === CanvasNodeType.Comic)!;
    const images = plan.nodes.filter((node) => node.type === CanvasNodeType.Image);
    assert.equal(images.length, 2);
    assert.deepEqual(comic.metadata?.comicBook?.pageNodeIds, images.map((node) => node.id));
    assert.equal(comic.metadata?.comicBook?.coverNodeId, images[0]!.id);
    assert.equal(comic.metadata?.comicBook?.comicProjectId, project.id);
    assert.equal(comic.metadata?.comicBook?.format, "strip");
    assert.equal(comic.metadata?.comicBook?.direction, "ltr");
    assert.equal(comic.metadata?.comicBook?.pageProjectIds?.[images[0]!.id], first.id);
    assert.equal(comic.metadata?.comicBook?.pageProjectIds?.[images[1]!.id], third.id);
    assert.equal(images[0]!.title, "第 1 页");
    assert.equal(images[1]!.title, "第 3 页");
    assert.equal(images[0]!.metadata?.content, "blob:first");
    assert.equal(images[0]!.metadata?.storageKey, "image:first");
    assert.equal(images[0]!.metadata?.naturalWidth, 1080);
    assert.equal(images[0]!.metadata?.status, "success");
    assert.ok(comic.position.x > existing.position.x + existing.width);
    assert.equal(images[0]!.position.x, comic.position.x);
    assert.ok(images[0]!.position.y > comic.position.y + comic.height);
    assert.equal(plan.viewport.k, 0.9);
    assert.ok(Number.isFinite(plan.viewport.x) && Number.isFinite(plan.viewport.y));
});

test("comic canvas import rejects a project without composed pages", () => {
    const project = createComicProject({ title: "空项目" });
    assert.throws(() => buildComicCanvasImport(project), /还没有已合成的页面/);
});

test("linked comic update reuses page nodes and keeps lettering and cover", () => {
    const project = createComicProject({ title: "更新漫画", format: "page", direction: "rtl" });
    const first = project.chapters[0]!.pages[0]!;
    const second = createComicPage(2);
    first.pageImage = { url: "blob:old-first", storageKey: "image:old-first", width: 800, height: 1200 };
    second.pageImage = { url: "blob:old-second", storageKey: "image:old-second", width: 800, height: 1200 };
    project.chapters[0]!.pages = [first, second];
    const base = buildComicCanvasImport(project);
    const comic = base.nodes.find((node) => node.type === CanvasNodeType.Comic)!;
    const oldPageIds = comic.metadata!.comicBook!.pageNodeIds;
    const letter: ComicLetterElement = { id: "letter-1", kind: "speech", text: "你好", x: 0.1, y: 0.1, width: 0.3, fontSize: 0.03, align: "left", tail: "right" };
    comic.metadata = { ...comic.metadata, comicBook: { ...comic.metadata!.comicBook!, coverNodeId: oldPageIds[1], lettering: { [oldPageIds[0]!]: [letter] } } };
    const oldFirst = base.nodes.find((node) => node.id === oldPageIds[0])!;
    const oldCenter = { x: oldFirst.position.x + oldFirst.width / 2, y: oldFirst.position.y + oldFirst.height / 2 };
    assert.equal(findLinkedComicCanvasNode(base.nodes, project.id)?.id, comic.id);

    first.title = "新第一页";
    first.pageImage = { url: "blob:new-first", storageKey: "image:new-first", width: 1080, height: 1920 };
    second.pageImage = { url: "blob:new-second", storageKey: "image:new-second", width: 1080, height: 1920 };
    project.format = "strip";
    project.direction = "ltr";
    const result = buildComicCanvasUpdate(project, base.nodes, comic.id);
    const nextComic = result.nodes.find((node) => node.id === comic.id)!;
    const nextFirst = result.nodes.find((node) => node.id === oldPageIds[0])!;
    assert.equal(result.pageCount, 2);
    assert.equal(result.added, 0);
    assert.equal(result.removed, 0);
    assert.equal(result.nodes.length, base.nodes.length);
    assert.deepEqual(nextComic.metadata?.comicBook?.pageNodeIds, oldPageIds);
    assert.equal(nextComic.metadata?.comicBook?.pageProjectIds?.[oldPageIds[0]!], first.id);
    assert.equal(nextComic.metadata?.comicBook?.pageProjectIds?.[oldPageIds[1]!], second.id);
    assert.equal(nextComic.metadata?.comicBook?.coverNodeId, oldPageIds[1]);
    assert.equal(nextComic.metadata?.comicBook?.format, "strip");
    assert.equal(nextComic.metadata?.comicBook?.direction, "ltr");
    assert.deepEqual(nextComic.metadata?.comicBook?.lettering?.[oldPageIds[0]!], [letter]);
    assert.equal(nextFirst.metadata?.content, "blob:new-first");
    assert.equal(nextFirst.metadata?.storageKey, "image:new-first");
    assert.equal(nextFirst.title, "新第一页");
    assert.equal(nextFirst.metadata?.naturalWidth, 1080);
    assert.equal(nextFirst.width, 236.25);
    assert.equal(nextFirst.height, 420);
    assert.equal(nextFirst.position.x + nextFirst.width / 2, oldCenter.x);
    assert.equal(nextFirst.position.y + nextFirst.height / 2, oldCenter.y);
});

test("linked comic update appends new pages and drops removed pages from the book", () => {
    const project = createComicProject({ title: "页数变化" });
    const first = project.chapters[0]!.pages[0]!;
    first.pageImage = { url: "blob:one", width: 800, height: 1200 };
    const base = buildComicCanvasImport(project);
    const comic = base.nodes.find((node) => node.type === CanvasNodeType.Comic)!;
    const oldPageId = comic.metadata!.comicBook!.pageNodeIds[0]!;

    const second = createComicPage(2);
    second.pageImage = { url: "blob:two", width: 800, height: 1200 };
    project.chapters[0]!.pages.push(second);
    const expanded = buildComicCanvasUpdate(project, base.nodes, comic.id);
    const expandedComic = expanded.nodes.find((node) => node.id === comic.id)!;
    assert.equal(expanded.added, 1);
    assert.equal(expanded.pageCount, 2);
    assert.equal(expandedComic.metadata?.comicBook?.pageNodeIds[0], oldPageId);
    assert.equal(expanded.nodes.length, base.nodes.length + 1);
    const addedPageId = expandedComic.metadata!.comicBook!.pageNodeIds[1]!;
    assert.notEqual(addedPageId, oldPageId);
    assert.equal(expandedComic.metadata?.comicBook?.pageProjectIds?.[addedPageId], second.id);
    assert.equal(expanded.nodes.find((node) => node.id === addedPageId)?.title, "第 2 页");
    expandedComic.metadata = { ...expandedComic.metadata, comicBook: { ...expandedComic.metadata!.comicBook!, lettering: { [addedPageId]: [{ id: "letter-2", kind: "caption", text: "旁白", x: 0.1, y: 0.1, width: 0.3, fontSize: 0.03, align: "left", tail: "none" }] } } };

    second.pageImage = undefined;
    const shrunk = buildComicCanvasUpdate(project, expanded.nodes, comic.id);
    const shrunkComic = shrunk.nodes.find((node) => node.id === comic.id)!;
    assert.equal(shrunk.removed, 1);
    assert.equal(shrunk.pageCount, 1);
    assert.deepEqual(shrunkComic.metadata?.comicBook?.pageNodeIds, [oldPageId]);
    assert.deepEqual(Object.keys(shrunkComic.metadata?.comicBook?.pageProjectIds || {}), [oldPageId]);
    assert.equal(shrunkComic.metadata?.comicBook?.lettering, undefined);
    assert.equal(shrunk.nodes.length, expanded.nodes.length);
});
