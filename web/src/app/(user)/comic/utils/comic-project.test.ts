import assert from "node:assert/strict";
import test from "node:test";

import { comicComposedPageCount, comicPageCompositionSize, comicPageIssues, comicPagesInBookOrder, comicPanelRect, comicReviewProgress, comicStats, createComicCharacter, createComicCharacterVariant, createComicLocation, createComicPanel, createComicPage, createComicProject, equalGridLayouts, equalVerticalLayouts, invalidateComicPageCompositions, invalidateComicPagesForCharacter, moveComicPanel, normalizeComicCharacter, normalizeComicProject, parseComicProjectBackup, recordComicPanelGenerationResult, removeComicCharacterFromProject, invalidateComicPagesForVariantChanges, removeComicPage, resetComicReviewStatus, serializeComicProject, updateComicChapter, updateComicPage, updateComicPanel } from "./comic-project";

test("legacy character and panel data normalize deterministically", () => {
    const legacy = {
        title: "旧项目",
        createdAt: "2026-01-01T00:00:00.000Z",
        chapters: [{ title: "第一章", pages: [{ title: "第一页", panels: [{ description: "林夏走进教室" }] }] }],
        characters: [{ name: "林夏", appearance: "短发，校服", personality: "冷静", wardrobe: "校服", expressions: "克制", notes: "怕水", image: { url: "blob:a", storageKey: "image:a" } }],
        locations: [],
    };
    const once = normalizeComicProject(legacy, "project-1");
    const twice = normalizeComicProject(once, "project-1");
    assert.deepEqual(twice, once);
    assert.equal(once.characters[0]?.visualIdentity.description, "短发，校服");
    assert.equal(once.characters[0]?.defaultLook.outfit, "校服");
    assert.equal(once.characters[0]?.behavior.personality, "冷静");
    assert.equal(once.characters[0]?.behavior.expressionBaseline, "克制");
    assert.equal(once.characters[0]?.references.primary?.id, "legacy:project-1:character:0:primary");
    assert.equal(once.characters[0]?.references.primary?.revision, 0);
    assert.equal(once.characters[0]?.references.primary?.slot.images[0]?.storageKey, "image:a");
    assert.deepEqual(once.chapters[0]?.pages[0]?.panels[0]?.characterBindings, []);
    assert.equal(once.chapters[0]?.pages[0]?.panels[0]?.image, undefined);
});

test("legacy library characters normalize without inventing bindings", () => {
    const normalized = normalizeComicCharacter({ name: "阿明", wardrobe: "夹克", image: { url: "blob:b" } }, "legacy:cast:0");
    assert.equal(normalized.defaultLook.outfit, "夹克");
    assert.equal(normalized.references.primary?.id, "legacy:cast:0:primary");
    assert.deepEqual(normalized.variants, []);
});

test("new characters and panels start with explicit empty consistency collections", () => {
    const character = createComicCharacter(1);
    assert.deepEqual(character.aliases, []);
    assert.deepEqual(character.references, {});
    assert.deepEqual(character.variants, []);
    assert.deepEqual(createComicPanel().characterBindings, []);
    assert.deepEqual(createComicPanel().characterSuggestions, []);
});

test("a new comic project starts with one chapter, one page and one panel", () => {
    const project = createComicProject({ title: "桂林两天", genre: "都市", format: "page", direction: "rtl" });
    assert.equal(project.title, "桂林两天");
    assert.equal(project.stage, "concept");
    assert.deepEqual(comicStats(project), { chapters: 1, pages: 1, panels: 1 });
    assert.equal(project.chapters[0]?.pages[0]?.panels.length, 1);
    assert.deepEqual(project.pageOrder, project.chapters[0]?.pages.map((page) => page.id));
});

test("failed panel generations remain recoverable until every target succeeds", () => {
    let project = createComicProject({ title: "续跑" });
    const chapter = project.chapters[0]!;
    const page = chapter.pages[0]!;
    const second = createComicPanel();
    project = updateComicPage(project, chapter.id, page.id, { panels: [...page.panels, second] });
    project = recordComicPanelGenerationResult(project, chapter.id, page.id, page.panels[0]!.id, { image: { url: "generated:a" } }, [second.id], 123);
    let updated = project.chapters[0]!.pages[0]!;
    assert.equal(updated.panels[0]!.image?.url, "generated:a");
    assert.deepEqual(updated.pendingPanelTask, { panelIds: [second.id], startedAt: 123 });
    project = recordComicPanelGenerationResult(project, chapter.id, page.id, second.id, { imageError: "生成失败" }, [second.id], 123);
    updated = project.chapters[0]!.pages[0]!;
    assert.equal(updated.panels[1]!.imageError, "生成失败");
    assert.deepEqual(updated.pendingPanelTask, { panelIds: [second.id], startedAt: 123 });
    project = recordComicPanelGenerationResult(project, chapter.id, page.id, second.id, { image: { url: "generated:b" }, imageError: undefined }, [], 123);
    assert.equal(project.chapters[0]!.pages[0]!.pendingPanelTask, undefined);
});

test("successful panel generation invalidates the composed page and drops deleted pending ids", () => {
    let project = createComicProject({ title: "生成收尾" });
    const chapter = project.chapters[0]!;
    const page = chapter.pages[0]!;
    const removed = createComicPanel();
    project = updateComicPage(project, chapter.id, page.id, {
        panels: [...page.panels, removed],
        pageImage: { url: "blob:old-page" },
        compositionContext: { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [], confirmedAt: "2026-01-01T00:00:00.000Z" },
        reviewStatus: "approved",
    });
    project = updateComicPage(project, chapter.id, page.id, { panels: [page.panels[0]!] });
    project = recordComicPanelGenerationResult(project, chapter.id, page.id, page.panels[0]!.id, { image: { url: "blob:new-panel" } }, [removed.id], 123);
    const updated = project.chapters[0]!.pages[0]!;
    assert.equal(updated.panels[0]!.image?.url, "blob:new-panel");
    assert.equal(updated.pageImage, undefined);
    assert.equal(updated.compositionContext, undefined);
    assert.equal(updated.reviewStatus, "draft");
    assert.equal(updated.pendingPanelTask, undefined);
});

test("page edits trim pending generation ids to existing panels", () => {
    let project = createComicProject({ title: "续跑裁剪" });
    const chapter = project.chapters[0]!;
    const page = chapter.pages[0]!;
    project = updateComicPage(project, chapter.id, page.id, { pendingPanelTask: { panelIds: [page.panels[0]!.id, "removed"], startedAt: 123 } });
    project = updateComicPage(project, chapter.id, page.id, { panels: page.panels });
    assert.deepEqual(project.chapters[0]!.pages[0]!.pendingPanelTask?.panelIds, [page.panels[0]!.id]);
});

test("chapter page replacement keeps the global page order in sync", () => {
    let project = createComicProject({ title: "页序" });
    const chapter = project.chapters[0]!;
    const second = { ...createComicPage(2), id: "page-2" };
    const third = { ...createComicPage(3), id: "page-3" };
    project = updateComicChapter(project, chapter.id, { pages: [second, third] });
    assert.deepEqual(project.pageOrder, ["page-2", "page-3"]);
    project = updateComicChapter(project, chapter.id, { pages: [third] });
    assert.deepEqual(project.pageOrder, ["page-3"]);
});

test("chapter page changes preserve interleaved positions and unrelated missing slots", () => {
    const first = { ...createComicPage(1), id: "p1" };
    const third = { ...createComicPage(3), id: "p3" };
    const other = { ...createComicPage(1), id: "p2" };
    const project = {
        ...createComicProject({ title: "跨章增删" }),
        chapters: [
            { id: "ch1", title: "第一章", summary: "", pages: [first, third] },
            { id: "ch2", title: "第二章", summary: "", pages: [other] },
        ],
        pageOrder: ["p1", "missing", "p2", "p3"],
    };
    const removed = updateComicChapter(project, "ch1", { pages: [third] });
    assert.deepEqual(removed.pageOrder, ["missing", "p2", "p3"]);

    const added = { ...createComicPage(2), id: "added" };
    const inserted = updateComicChapter(project, "ch1", { pages: [first, added, third] });
    assert.deepEqual(inserted.pageOrder, ["p1", "added", "missing", "p2", "p3"]);

    const replacement = { ...createComicPage(4), id: "replacement" };
    const replaced = updateComicChapter(project, "ch1", { pages: [replacement] });
    assert.deepEqual(replaced.pageOrder, ["replacement", "missing", "p2"]);
});

test("page deletion uses current chapter pages and keeps pages added while confirmation was open", () => {
    const project = createComicProject({ title: "删除确认" });
    const chapter = project.chapters[0]!;
    const removed = chapter.pages[0]!;
    const added = { ...createComicPage(3), id: "added-during-confirm" };
    const current = updateComicChapter(project, chapter.id, { pages: [...chapter.pages, added] });
    const next = removeComicPage(current, chapter.id, removed.id);
    assert.deepEqual(next.chapters[0]?.pages.map((page) => page.id), [added.id]);
    assert.deepEqual(next.pageOrder, [added.id]);
});

test("page lists follow interleaved book order across chapters and ignore missing slots", () => {
    const project = createComicProject({ title: "跨章页序" });
    const first = { ...createComicPage(1), id: "p1" };
    const second = { ...createComicPage(2), id: "p2" };
    const third = { ...createComicPage(3), id: "p3" };
    const unordered = { ...createComicPage(4), id: "p4" };
    const ordered = {
        ...project,
        chapters: [
            { id: "ch1", title: "第一章", summary: "", pages: [first, third] },
            { id: "ch2", title: "第二章", summary: "", pages: [second, unordered] },
        ],
        pageOrder: ["p2", "missing", "p1", "p3"],
    };
    assert.deepEqual(comicPagesInBookOrder(ordered).map((entry) => [entry.chapter.id, entry.page.id]), [["ch2", "p2"], ["ch1", "p1"], ["ch1", "p3"], ["ch2", "p4"]]);
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

test("global and character invalidation reset review even without a composed image", () => {
    const project = createComicProject({ title: "审稿失效" });
    const character = createComicCharacter(1);
    character.id = "c1";
    project.characters = [character];
    const page = project.chapters[0]!.pages[0]!;
    page.reviewStatus = "approved";
    page.panels[0]!.characterBindings = [{ characterId: "c1", source: "manual", characterNameSnapshot: character.name }];
    assert.equal(invalidateComicPageCompositions(project).chapters[0]?.pages[0]?.reviewStatus, "draft");
    assert.equal(invalidateComicPagesForCharacter(project, "c1").chapters[0]?.pages[0]?.reviewStatus, "draft");
    assert.equal(invalidateComicPagesForCharacter(project, "other").chapters[0]?.pages[0]?.reviewStatus, "approved");
});

test("character updates remove bindings to deleted variants and invalidate affected pages", () => {
    const project = createComicProject({ title: "变体失效" });
    const character = createComicCharacter(1);
    character.id = "c1";
    character.name = "林夏";
    character.variants = [
        { ...createComicCharacterVariant(1), id: "removed-variant" },
        { ...createComicCharacterVariant(2), id: "kept-variant" },
    ];
    const other = createComicCharacter(2);
    other.id = "c2";
    project.characters = [character, other];
    const page = project.chapters[0]!.pages[0]!;
    page.reviewStatus = "approved";
    page.pageImage = { url: "blob:page" };
    page.panels[0]!.characterBindings = [
        { characterId: "c1", variantId: "removed-variant", source: "manual", characterNameSnapshot: "林夏" },
        { characterId: "c1", variantId: "kept-variant", source: "manual", characterNameSnapshot: "林夏" },
        { characterId: "c1", source: "manual", characterNameSnapshot: "林夏" },
        { characterId: "c2", variantId: "other-variant", source: "manual", characterNameSnapshot: other.name },
    ];
    project.characters[0]!.variants = [character.variants[1]!];

    const next = invalidateComicPagesForCharacter(project, character.id);
    assert.deepEqual(next.chapters[0]!.pages[0]!.panels[0]!.characterBindings.map((binding) => [binding.characterId, binding.variantId]), [
        ["c1", "kept-variant"],
        ["c1", undefined],
        ["c2", "other-variant"],
    ]);
    assert.equal(next.chapters[0]!.pages[0]!.pageImage, undefined);
    assert.equal(next.chapters[0]!.pages[0]!.reviewStatus, "draft");
});

test("variant updates keep pages that only use the base look or retained variants", () => {
    const project = createComicProject({ title: "变体精确失效" });
    const character = createComicCharacter(1);
    character.id = "c1";
    character.variants = [{ ...createComicCharacterVariant(1), id: "kept-variant" }];
    const previous = { ...character, variants: [...character.variants, { ...createComicCharacterVariant(2), id: "removed-variant" }] };
    project.characters = [character];
    const base = { ...createComicPage(1), id: "base", reviewStatus: "approved" as const, pageImage: { url: "blob:base" } };
    base.panels[0]!.characterBindings = [{ characterId: "c1", source: "manual", characterNameSnapshot: character.name }];
    const kept = { ...createComicPage(2), id: "kept", reviewStatus: "approved" as const, pageImage: { url: "blob:kept" } };
    kept.panels[0]!.characterBindings = [{ characterId: "c1", variantId: "kept-variant", source: "manual", characterNameSnapshot: character.name }];
    const removed = { ...createComicPage(3), id: "removed", reviewStatus: "approved" as const, pageImage: { url: "blob:removed" } };
    removed.panels[0]!.characterBindings = [{ characterId: "c1", variantId: "removed-variant", source: "manual", characterNameSnapshot: character.name }];
    project.chapters[0]!.pages = [base, kept, removed];
    project.pageOrder = [base.id, kept.id, removed.id];
    const next = invalidateComicPagesForVariantChanges(project, "c1", previous);
    assert.deepEqual(next.chapters[0]!.pages.slice(0, 2), [base, kept]);
    assert.equal(next.chapters[0]!.pages[2]!.pageImage, undefined);
    assert.equal(next.chapters[0]!.pages[2]!.reviewStatus, "draft");
    assert.deepEqual(next.chapters[0]!.pages[2]!.panels[0]!.characterBindings, []);
});

test("removing a character clears only its bindings and invalidates affected pages", () => {
    const project = createComicProject({ title: "删除角色" });
    const removed = createComicCharacter(1);
    removed.id = "removed";
    removed.name = "林夏";
    removed.aliases = ["小夏"];
    const kept = createComicCharacter(2);
    kept.id = "kept";
    kept.name = "阿明";
    project.characters = [removed, kept];
    const first = project.chapters[0]!.pages[0]!;
    first.reviewStatus = "approved";
    first.pageImage = { url: "blob:first" };
    first.panels[0]!.characterBindings = [
        { characterId: "removed", source: "manual", characterNameSnapshot: "林夏" },
        { characterId: "kept", source: "manual", characterNameSnapshot: "阿明" },
    ];
    const second = { ...createComicPage(2), id: "second", reviewStatus: "changes" as const };
    second.panels[0]!.characterBindings = [{ characterId: "kept", source: "manual", characterNameSnapshot: "阿明" }];
    const third = { ...createComicPage(3), id: "third", reviewStatus: "approved" as const };
    third.panels[0]!.characterSuggestions = [{ characterName: "小夏", reason: "unknown-character" }];
    project.chapters[0]!.pages.push(second, third);

    const next = removeComicCharacterFromProject(project, removed);
    assert.deepEqual(next.characters.map((item) => item.id), ["kept"]);
    assert.deepEqual(next.chapters[0]!.pages[0]!.panels[0]!.characterBindings.map((item) => item.characterId), ["kept"]);
    assert.equal(next.chapters[0]!.pages[0]!.pageImage, undefined);
    assert.equal(next.chapters[0]!.pages[0]!.reviewStatus, "draft");
    assert.equal(next.chapters[0]!.pages[1]!.reviewStatus, "changes");
    assert.deepEqual(next.chapters[0]!.pages[1]!.panels[0]!.characterBindings.map((item) => item.characterId), ["kept"]);
    assert.deepEqual(next.chapters[0]!.pages[2]!.panels[0]!.characterSuggestions, []);
    assert.equal(next.chapters[0]!.pages[2]!.reviewStatus, "approved");
});

test("character and location sheets survive backup round trip", () => {
    const project = createComicProject({ title: "设定" });
    const character = createComicCharacter(1);
    character.name = "林夏";
    character.visualIdentity.description = "短发，校服";
    const location = createComicLocation(1);
    location.name = "旧校舍";
    const withCast = { ...project, characters: [character], locations: [location] };
    const restored = parseComicProjectBackup(serializeComicProject(withCast));
    assert.equal(restored.characters[0]?.name, "林夏");
    assert.equal(restored.characters[0]?.visualIdentity.description, "短发，校服");
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

test("character consistency data survives backup round trip", () => {
    const project = createComicProject({ title: "角色备份" });
    const character = createComicCharacter(1);
    character.id = "character-1";
    character.name = "林夏";
    character.aliases = ["小夏"];
    character.references.primary = { id: "character-1:primary", revision: 2, slot: { images: [{ id: "character-1:primary:image", url: "blob:portrait", storageKey: "image:portrait" }], activeImageId: "character-1:primary:image" } };
    character.variants = [{
        id: "variant-1",
        name: "校服",
        description: "故事前期",
        outfitOverride: "白衬衫与藏青百褶裙",
        referenceImage: { id: "variant-1:reference", revision: 1, slot: { images: [{ id: "variant-1:reference:image", url: "blob:uniform", storageKey: "image:uniform" }], activeImageId: "variant-1:reference:image" } },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    }];
    project.characters = [character];
    const page = project.chapters[0]!.pages[0]!;
    const panel = page.panels[0]!;
    panel.characterBindings = [{ characterId: "character-1", variantId: "variant-1", source: "manual", characterNameSnapshot: "林夏", variantNameSnapshot: "校服" }];
    panel.characterSuggestions = [{ characterName: "陌生人", reason: "unknown-character" }];
    panel.image = {
        url: "blob:panel",
        storageKey: "image:panel",
        generationContext: {
            inputSignature: "signature-1",
            compilerVersion: "1",
            prompt: "画面",
            references: [{ id: "character-1:primary", revision: "2", role: "character-primary" }],
            missingReferenceIds: [],
            model: "image-model",
            size: "1k",
            createdAt: "2026-01-01T00:00:00.000Z",
        },
    };
    page.pageImage = { url: "blob:page", storageKey: "image:page" };
    page.compositionContext = { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [], confirmedAt: "2026-01-01T00:00:00.000Z" };
    const restored = parseComicProjectBackup(serializeComicProject(project));
    assert.equal(restored.characters[0]?.references.primary?.id, "character-1:primary");
    assert.equal(restored.characters[0]?.references.primary?.revision, 2);
    assert.equal(restored.characters[0]?.variants[0]?.outfitOverride, "白衬衫与藏青百褶裙");
    assert.equal(restored.characters[0]?.variants[0]?.referenceImage?.slot.images[0]?.storageKey, "image:uniform");
    assert.deepEqual(restored.chapters[0]?.pages[0]?.panels[0]?.characterBindings, panel.characterBindings);
    assert.deepEqual(restored.chapters[0]?.pages[0]?.panels[0]?.characterSuggestions, panel.characterSuggestions);
    assert.deepEqual(restored.chapters[0]?.pages[0]?.panels[0]?.image?.generationContext, panel.image.generationContext);
    assert.deepEqual(restored.chapters[0]?.pages[0]?.compositionContext, page.compositionContext);
    assert.equal(restored.chapters[0]?.pages[0]?.pageImage?.storageKey, "image:page");
});

test("character invalidation clears only affected page compositions and keeps panel art", () => {
    const project = createComicProject({ title: "失效" });
    const character = createComicCharacter(1);
    character.id = "c1";
    project.characters = [character];
    const pageOne = project.chapters[0]!.pages[0]!;
    pageOne.panels[0]!.characterBindings = [{ characterId: "c1", source: "manual", characterNameSnapshot: "林夏" }];
    pageOne.panels[0]!.image = { url: "blob:keep" };
    pageOne.pageImage = { url: "blob:page1" };
    pageOne.compositionContext = { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [] };
    const pageTwo = createComicPage(2);
    pageTwo.pageImage = { url: "blob:page2" };
    pageTwo.compositionContext = { stalePanelIds: [], unrecordedPanelIds: [], incompletePanelIds: [] };
    project.chapters[0]!.pages.push(pageTwo);
    const targeted = invalidateComicPagesForCharacter(project, "c1");
    assert.equal(targeted.chapters[0]?.pages[0]?.pageImage, undefined);
    assert.equal(targeted.chapters[0]?.pages[0]?.compositionContext, undefined);
    assert.equal(targeted.chapters[0]?.pages[0]?.panels[0]?.image?.url, "blob:keep");
    assert.equal(targeted.chapters[0]?.pages[1]?.pageImage?.url, "blob:page2");
    const all = invalidateComicPageCompositions(project);
    assert.equal(all.chapters[0]?.pages[1]?.pageImage, undefined);
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
