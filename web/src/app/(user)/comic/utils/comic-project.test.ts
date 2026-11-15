import assert from "node:assert/strict";
import test from "node:test";

import { comicComposedPageCount, comicPageCompositionSize, comicPageIssues, comicPanelRect, comicReviewProgress, comicStats, createComicCharacter, createComicLocation, createComicPanel, createComicPage, createComicProject, equalGridLayouts, equalVerticalLayouts, moveComicPanel, parseComicProjectBackup, resetComicReviewStatus, serializeComicProject, updateComicChapter, updateComicPage, updateComicPanel } from "./comic-project";

test("a new comic project starts with one chapter, one page and one panel", () => {
    const project = createComicProject({ title: "桂林两天", genre: "都市", format: "page", direction: "rtl" });
    assert.equal(project.title, "桂林两天");
    assert.equal(project.stage, "concept");
    assert.deepEqual(comicStats(project), { chapters: 1, pages: 1, panels: 1 });
    assert.equal(project.chapters[0]?.pages[0]?.panels.length, 1);
});

test("chapter, page and panel updates stay nested and ordered", () => {
    let project = createComicProject({ title: "测试" });
    const chapter = project.chapters[0]!;
    const page = chapter.pages[0]!;
    project = updateComicChapter(project, chapter.id, { title: "第一话" });
    project = updateComicPage(project, chapter.id, page.id, { summary: "开场" });
    const secondPanel = createComicPanel();
    project = updateComicPage(project, chapter.id, page.id, { panels: [...page.panels, secondPanel] });
    project = updateComicPanel(project, chapter.id, page.id, secondPanel.id, { dialogue: "你好" });
    const updatedPage = project.chapters[0]!.pages[0]!;
    assert.equal(project.chapters[0]!.title, "第一话");
    assert.equal(updatedPage.summary, "开场");
    assert.equal(updatedPage.panels[1]!.dialogue, "你好");
    const moved = moveComicPanel(updatedPage, secondPanel.id, -1);
    assert.equal(moved.panels[0]!.id, secondPanel.id);
});

test("editing content only resets approved or pending pages", () => {
    assert.equal(resetComicReviewStatus("approved"), "draft");
    assert.equal(resetComicReviewStatus("pending"), "draft");
    assert.equal(resetComicReviewStatus("changes"), "changes");
    assert.equal(resetComicReviewStatus("draft"), "draft");
    assert.equal(resetComicReviewStatus(), "draft");
});

test("review checks flag empty descriptions and count statuses", () => {
    const page = createComicPage(1);
    page.summary = "开场";
    page.panels[0]!.description = "广角校园";
    page.panels[0]!.dialogue = "早上好";
    assert.deepEqual(comicPageIssues(page), []);
    const issues = comicPageIssues({ ...page, summary: "", panels: [{ ...page.panels[0]!, description: "", dialogue: "", caption: "", sfx: "" }] });
    assert.equal(issues.filter((issue) => issue.level === "error").length, 1);
    assert.equal(issues.filter((issue) => issue.level === "warning").length, 2);
    let project = createComicProject({ title: "审稿" });
    const chapter = project.chapters[0]!;
    const pageOne = chapter.pages[0]!;
    project = updateComicChapter(project, chapter.id, { pages: [{ ...pageOne, reviewStatus: "approved" }, { ...createComicPage(2), reviewStatus: "changes" }, { ...createComicPage(3), reviewStatus: "pending" }] });
    assert.deepEqual(comicReviewProgress(project), { total: 3, draft: 0, pending: 1, approved: 1, changes: 1 });
});

test("panel layout auto-distributes and keeps explicit rectangles", () => {
    const page = createComicPage(1);
    page.panels = [createComicPanel(), createComicPanel()];
    const first = comicPanelRect(page, page.panels[0]!, 0);
    const second = comicPanelRect(page, page.panels[1]!, 1);
    assert.ok(first.y < second.y);
    assert.ok(first.h > 0 && second.h > 0);
    const explicit = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    assert.deepEqual(comicPanelRect(page, { ...page.panels[0]!, layout: explicit }, 0), explicit);
    const grid = equalGridLayouts(4);
    assert.ok(grid[0]!.x < grid[1]!.x);
    assert.equal(grid[0]!.y, grid[1]!.y);
    assert.ok(grid[0]!.y < grid[2]!.y);
    const vertical = equalVerticalLayouts(3);
    assert.ok(vertical[0]!.y < vertical[1]!.y && vertical[1]!.y < vertical[2]!.y);
});

test("character and location sheets survive backup round trip", () => {
    const project = createComicProject({ title: "设定" });
    const character = createComicCharacter(1);
    character.name = "林夏";
    character.appearance = "短发，校服";
    const location = createComicLocation(1);
    location.name = "旧校舍";
    const withCast = { ...project, characters: [character], locations: [location] };
    const restored = parseComicProjectBackup(serializeComicProject(withCast));
    assert.equal(restored.characters[0]?.name, "林夏");
    assert.equal(restored.characters[0]?.appearance, "短发，校服");
    assert.equal(restored.locations[0]?.name, "旧校舍");
});

test("backup round trip keeps chapters, pages and panels; invalid data is rejected", () => {
    const project = createComicProject({ title: "备份" });
    const restored = parseComicProjectBackup(serializeComicProject(project));
    assert.equal(restored.title, "备份");
    assert.deepEqual(comicStats(restored), comicStats(project));
    assert.throws(() => parseComicProjectBackup("{}"), /不是有效的漫画项目备份/);
    assert.throws(() => parseComicProjectBackup("null"), /不是有效的漫画项目备份/);
});

test("composed page image survives backup and uses format-specific canvas size", () => {
    const project = createComicProject({ title: "合成", format: "page" });
    const pageImage = { url: "blob:composed", storageKey: "image:composed", width: 1600, height: 2133 };
    project.chapters[0]!.pages[0]!.pageImage = pageImage;
    const restored = parseComicProjectBackup(serializeComicProject(project));
    assert.deepEqual(restored.chapters[0]?.pages[0]?.pageImage, pageImage);
    assert.deepEqual(comicPageCompositionSize("page"), { width: 1600, height: 2133 });
    assert.deepEqual(comicPageCompositionSize("strip"), { width: 1080, height: 1920 });
    assert.deepEqual(comicComposedPageCount(project), { total: 1, composed: 1 });
});
