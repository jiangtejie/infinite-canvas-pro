import { nanoid } from "nanoid";

import type { ComicChapter, ComicCharacter, ComicLocation, ComicPanel, ComicPanelLayout, ComicPage, ComicProject, ComicReviewStatus } from "../types";

type CreateComicProjectInput = {
    title: string;
    genre?: string;
    audience?: string;
    format?: ComicProject["format"];
    direction?: ComicProject["direction"];
    logline?: string;
};

export function createComicPanel(): ComicPanel {
    return { id: nanoid(), description: "", dialogue: "", caption: "", sfx: "" };
}

export function createComicPage(index = 1): ComicPage {
    return { id: nanoid(), title: `第 ${index} 页`, summary: "", panels: [createComicPanel()], reviewStatus: "draft", reviewNotes: "" };
}

export function createComicChapter(index = 1): ComicChapter {
    return { id: nanoid(), title: `第 ${index} 章`, summary: "", pages: [createComicPage(1)] };
}

export function createComicCharacter(index = 1): ComicCharacter {
    return { id: nanoid(), name: `角色 ${index}`, role: "", appearance: "", personality: "", wardrobe: "", expressions: "", notes: "" };
}

export function createComicLocation(index = 1): ComicLocation {
    return { id: nanoid(), name: `场景 ${index}`, description: "", atmosphere: "", notes: "" };
}

export function createComicProject(input: CreateComicProjectInput): ComicProject {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        title: input.title.trim() || "未命名漫画",
        status: "draft",
        stage: "concept",
        genre: input.genre?.trim() || "",
        audience: input.audience?.trim() || "",
        format: input.format || "page",
        direction: input.direction || "rtl",
        logline: input.logline?.trim() || "",
        synopsis: "",
        styleGuide: "",
        chapters: [createComicChapter(1)],
        characters: [],
        locations: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function comicStats(project: ComicProject) {
    const pages = project.chapters.flatMap((chapter) => chapter.pages);
    return {
        chapters: project.chapters.length,
        pages: pages.length,
        panels: pages.reduce((total, page) => total + page.panels.length, 0),
    };
}

type ComicPageIssue = { level: "error" | "warning"; message: string };

export function comicPageCompositionSize(format: ComicProject["format"]) {
    return format === "strip" ? { width: 1080, height: 1920 } : { width: 1600, height: 2133 };
}

export function comicComposedPageCount(project: ComicProject) {
    const pages = project.chapters.flatMap((chapter) => chapter.pages);
    return { total: pages.length, composed: pages.filter((page) => page.pageImage).length };
}

export function comicPanelRect(page: ComicPage, panel: ComicPanel, index: number): ComicPanelLayout {
    if (panel.layout) return panel.layout;
    const count = Math.max(1, page.panels.length);
    const gap = 0.02;
    const height = (1 - gap * (count + 1)) / count;
    return { x: 0.03, y: gap + index * (height + gap), w: 0.94, h: height };
}

export function equalVerticalLayouts(count: number): ComicPanelLayout[] {
    const gap = 0.02;
    const height = (1 - gap * (count + 1)) / Math.max(1, count);
    return Array.from({ length: count }, (_, index) => ({ x: 0.03, y: gap + index * (height + gap), w: 0.94, h: height }));
}

export function equalGridLayouts(count: number): ComicPanelLayout[] {
    const columns = count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / columns);
    const gap = 0.025;
    const width = (1 - gap * (columns + 1)) / columns;
    const height = (1 - gap * (rows + 1)) / rows;
    return Array.from({ length: count }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return { x: gap + column * (width + gap), y: gap + row * (height + gap), w: width, h: height };
    });
}

export function comicPageReviewStatus(page: ComicPage) {
    return page.reviewStatus || "draft";
}

export function resetComicReviewStatus(status?: ComicReviewStatus): ComicReviewStatus {
    return status === "approved" || status === "pending" ? "draft" : status || "draft";
}

export function comicPageIssues(page: ComicPage): ComicPageIssue[] {
    const issues: ComicPageIssue[] = [];
    if (!page.summary.trim()) issues.push({ level: "warning", message: "本页缺少叙事梗概" });
    if (!page.panels.length) issues.push({ level: "error", message: "本页没有页格" });
    page.panels.forEach((panel, index) => {
        if (!panel.description.trim()) issues.push({ level: "error", message: `第 ${index + 1} 格缺少画面描述` });
        if (!panel.dialogue.trim() && !panel.caption.trim() && !panel.sfx.trim()) issues.push({ level: "warning", message: `第 ${index + 1} 格没有对白、旁白或拟声，确认是无声演出` });
    });
    return issues;
}

export function comicReviewProgress(project: ComicProject) {
    const pages = project.chapters.flatMap((chapter) => chapter.pages);
    const counts = { draft: 0, pending: 0, approved: 0, changes: 0 };
    pages.forEach((page) => { counts[comicPageReviewStatus(page)] += 1; });
    return { total: pages.length, ...counts };
}

export function updateComicChapter(project: ComicProject, chapterId: string, patch: Partial<ComicChapter>): ComicProject {
    return { ...project, chapters: project.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...patch } : chapter) };
}

export function updateComicPage(project: ComicProject, chapterId: string, pageId: string, patch: Partial<ComicPage>): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => chapter.id === chapterId
            ? { ...chapter, pages: chapter.pages.map((page) => page.id === pageId ? { ...page, ...patch } : page) }
            : chapter),
    };
}

export function updateComicPanel(project: ComicProject, chapterId: string, pageId: string, panelId: string, patch: Partial<ComicPanel>): ComicProject {
    return {
        ...project,
        chapters: project.chapters.map((chapter) => chapter.id === chapterId
            ? { ...chapter, pages: chapter.pages.map((page) => page.id === pageId ? { ...page, panels: page.panels.map((panel) => panel.id === panelId ? { ...panel, ...patch } : panel) } : page) }
            : chapter),
    };
}

export function moveComicPanel(page: ComicPage, panelId: string, offset: number): ComicPage {
    const fromIndex = page.panels.findIndex((panel) => panel.id === panelId);
    const toIndex = fromIndex + offset;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= page.panels.length) return page;
    const panels = [...page.panels];
    const [moved] = panels.splice(fromIndex, 1);
    panels.splice(toIndex, 0, moved);
    return { ...page, panels };
}

export function serializeComicProject(project: ComicProject) {
    return JSON.stringify({ app: "infinite-canvas-comic", version: 1, exportedAt: new Date().toISOString(), project }, null, 2);
}

export function parseComicProjectBackup(text: string): ComicProject {
    const data = JSON.parse(text) as { project?: Partial<ComicProject> } | null;
    const source = data?.project;
    if (!source || typeof source.title !== "string" || !Array.isArray(source.chapters)) throw new Error("不是有效的漫画项目备份");
    const now = new Date().toISOString();
    return {
        ...createComicProject({ title: source.title, genre: source.genre, audience: source.audience, format: source.format, direction: source.direction, logline: source.logline }),
        ...source,
        id: source.id || nanoid(),
        status: source.status === "completed" ? "completed" : "draft",
        stage: source.stage === "script" ? "script" : source.stage === "cast" ? "cast" : source.stage === "layout" ? "layout" : source.stage === "review" ? "review" : "concept",
        chapters: source.chapters.map((chapter, chapterIndex) => ({
            id: chapter.id || nanoid(),
            title: chapter.title || `第 ${chapterIndex + 1} 章`,
            summary: chapter.summary || "",
            pages: (chapter.pages || []).map((page, pageIndex) => ({
                id: page.id || nanoid(),
                title: page.title || `第 ${pageIndex + 1} 页`,
                summary: page.summary || "",
                panels: (page.panels || []).map((panel) => ({
                    id: panel.id || nanoid(),
                    description: panel.description || "",
                    dialogue: panel.dialogue || "",
                    caption: panel.caption || "",
                    sfx: panel.sfx || "",
                    layout: panel.layout && [panel.layout.x, panel.layout.y, panel.layout.w, panel.layout.h].every(Number.isFinite)
                        ? { x: Math.min(1, Math.max(0, panel.layout.x)), y: Math.min(1, Math.max(0, panel.layout.y)), w: Math.min(1, Math.max(0.05, panel.layout.w)), h: Math.min(1, Math.max(0.05, panel.layout.h)) }
                        : undefined,
                    image: panel.image,
                    imageError: panel.imageError,
                })),
                reviewStatus: page.reviewStatus === "approved" || page.reviewStatus === "pending" || page.reviewStatus === "changes" ? page.reviewStatus : "draft",
                reviewNotes: page.reviewNotes || "",
                pageImage: page.pageImage,
            })),
        })),
        characters: (source.characters || []).map((character, index) => ({
            id: character.id || nanoid(),
            name: character.name || `角色 ${index + 1}`,
            role: character.role || "",
            appearance: character.appearance || "",
            personality: character.personality || "",
            wardrobe: character.wardrobe || "",
            expressions: character.expressions || "",
            notes: character.notes || "",
            image: character.image,
        })),
        locations: (source.locations || []).map((location, index) => ({
            id: location.id || nanoid(),
            name: location.name || `场景 ${index + 1}`,
            description: location.description || "",
            atmosphere: location.atmosphere || "",
            notes: location.notes || "",
            image: location.image,
        })),
        createdAt: source.createdAt || now,
        updatedAt: now,
    };
}
