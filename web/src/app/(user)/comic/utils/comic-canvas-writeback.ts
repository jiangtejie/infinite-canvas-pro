import type { CanvasComicBook, ComicLetterElement } from "@/app/(user)/canvas/types";
import type { ComicPanelLayout, ComicPage, ComicProject, ComicReviewStatus } from "../types";
import { comicPanelRect, resetComicReviewStatus } from "./comic-project";

type ComicCanvasWritebackResult = {
    project: ComicProject;
    updatedPages: number;
    updatedPanels: number;
    reorderedChapters: number;
    skippedLetters: number;
};

export function applyComicCanvasWriteback(project: ComicProject, book: CanvasComicBook): ComicCanvasWritebackResult {
    if (book.comicProjectId && book.comicProjectId !== project.id) throw new Error("漫画册不属于当前漫画项目");
    if (!book.pageProjectIds || !Object.keys(book.pageProjectIds).length) throw new Error("漫画册缺少项目页映射，请先发送或更新一次画布再回写");
    const pageById = new Map(project.chapters.flatMap((chapter) => chapter.pages).map((page) => [page.id, page]));
    const order = new Map<string, number>();
    book.pageNodeIds.forEach((nodeId, index) => {
        const pageId = book.pageProjectIds?.[nodeId];
        if (pageId && !order.has(pageId)) order.set(pageId, index);
    });
    const patches = new Map<string, { panels: ComicPage["panels"]; reviewStatus: ComicReviewStatus }>();
    let updatedPages = 0;
    let updatedPanels = 0;
    let skippedLetters = 0;

    for (const nodeId of book.pageNodeIds) {
        const pageId = book.pageProjectIds[nodeId];
        const page = pageId ? pageById.get(pageId) : undefined;
        const letters = (book.lettering?.[nodeId] || []).filter((letter) => letter.text.trim());
        if (!letters.length) continue;
        if (!page || !page.panels.length) {
            skippedLetters += letters.length;
            continue;
        }
        const dialogue = new Map<number, string[]>();
        const captions = new Map<number, string[]>();
        const sfx = new Map<number, string[]>();
        for (const letter of letters) {
            const panelIndex = letterPanelIndex(page, letter);
            if (panelIndex < 0) {
                skippedLetters += 1;
                continue;
            }
            const target = letter.kind === "caption" ? captions : letter.kind === "sfx" ? sfx : dialogue;
            const list = target.get(panelIndex) || [];
            list.push(letter.text.trim());
            target.set(panelIndex, list);
        }
        let changedPanels = 0;
        const panels = page.panels.map((panel, index) => {
            const dialogueText = dialogue.get(index)?.join("\n");
            const captionText = captions.get(index)?.join("\n");
            const sfxText = sfx.get(index)?.join("\n");
            if (dialogueText === undefined && captionText === undefined && sfxText === undefined) return panel;
            const next = { ...panel };
            if (dialogueText !== undefined && dialogueText !== panel.dialogue) next.dialogue = dialogueText;
            if (captionText !== undefined && captionText !== panel.caption) next.caption = captionText;
            if (sfxText !== undefined && sfxText !== panel.sfx) next.sfx = sfxText;
            if (next.dialogue === panel.dialogue && next.caption === panel.caption && next.sfx === panel.sfx) return panel;
            changedPanels += 1;
            return next;
        });
        if (!changedPanels) continue;
        updatedPages += 1;
        updatedPanels += changedPanels;
        patches.set(page.id, { panels, reviewStatus: resetComicReviewStatus(page.reviewStatus) });
    }

    let reorderedChapters = 0;
    const chapters = project.chapters.map((chapter) => {
        const pages = chapter.pages.map((page) => {
            const patch = patches.get(page.id);
            return patch ? { ...page, panels: patch.panels, reviewStatus: patch.reviewStatus } : page;
        });
        const slots = pages.flatMap((page, index) => order.has(page.id) ? [index] : []);
        const sorted = slots.map((index) => pages[index]!);
        sorted.sort((left, right) => (order.get(left.id) || 0) - (order.get(right.id) || 0));
        const next = [...pages];
        slots.forEach((slot, index) => { next[slot] = sorted[index]!; });
        const changed = next.some((page, index) => page.id !== pages[index]?.id);
        if (changed) reorderedChapters += 1;
        return changed ? { ...chapter, pages: next } : { ...chapter, pages };
    });

    if (!updatedPages && !reorderedChapters) return { project, updatedPages, updatedPanels, reorderedChapters, skippedLetters };
    return { project: { ...project, chapters }, updatedPages, updatedPanels, reorderedChapters, skippedLetters };
}

function letterPanelIndex(page: ComicPage, letter: ComicLetterElement) {
    const x = clamp(letter.x + letter.width / 2);
    const y = clamp(letter.y + Math.max(0.01, letter.fontSize * 0.7));
    const rects = page.panels.map((panel, index) => ({ index, rect: comicPanelRect(page, panel, index) }));
    const containing = rects.find((item) => pointInRect(x, y, item.rect));
    if (containing) return containing.index;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    rects.forEach(({ index, rect }) => {
        const distance = (x - rect.x - rect.w / 2) ** 2 + (y - rect.y - rect.h / 2) ** 2;
        if (distance >= bestDistance) return;
        best = index;
        bestDistance = distance;
    });
    return best;
}

function pointInRect(x: number, y: number, rect: ComicPanelLayout) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function clamp(value: number) {
    return Math.max(0, Math.min(1, value));
}
