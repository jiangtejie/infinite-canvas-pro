import { nanoid } from "nanoid";

import { comicPanelRect } from "@/app/(user)/comic/utils/comic-project";
import type { ComicPage, ComicProject } from "@/app/(user)/comic/types";
import { CanvasNodeType, type CanvasComicBook, type CanvasNodeData, type ComicLetterElement } from "../types";
import type { ComicPageSlot } from "./comic-book-state";

export function mapComicBookPagesToProjectPages(pageNodeIds: string[], projectPages: ComicPage[]): Record<string, string> {
    return Object.fromEntries(pageNodeIds.slice(0, projectPages.length).map((nodeId, index) => [nodeId, projectPages[index]!.id]));
}

export function associateComicProject(book: CanvasComicBook, projectId: string, projectPages: ComicPage[]): CanvasComicBook {
    return {
        ...book,
        comicProjectId: projectId,
        pageProjectIds: mapComicBookPagesToProjectPages(book.pageNodeIds, projectPages),
    };
}

export function replaceMissingComicBookPage({ book, missingPageNodeId, replacementImageNode }: { book: CanvasComicBook; missingPageNodeId: string; replacementImageNode: CanvasNodeData }): { book: CanvasComicBook; replaced: boolean } {
    if (!book.pageNodeIds.includes(missingPageNodeId) || replacementImageNode.type !== CanvasNodeType.Image || !replacementImageNode.metadata?.content || book.pageNodeIds.includes(replacementImageNode.id)) {
        return { book, replaced: false };
    }
    const pageProjectIds = { ...(book.pageProjectIds || {}) };
    if (pageProjectIds[missingPageNodeId]) pageProjectIds[replacementImageNode.id] = pageProjectIds[missingPageNodeId];
    delete pageProjectIds[missingPageNodeId];
    const lettering = { ...(book.lettering || {}) };
    if (lettering[missingPageNodeId]) lettering[replacementImageNode.id] = lettering[missingPageNodeId];
    delete lettering[missingPageNodeId];
    return {
        book: {
            ...book,
            pageNodeIds: book.pageNodeIds.map((id) => id === missingPageNodeId ? replacementImageNode.id : id),
            coverNodeId: book.coverNodeId === missingPageNodeId ? replacementImageNode.id : book.coverNodeId,
            pageProjectIds,
            lettering,
        },
        replaced: true,
    };
}

export function buildComicLetteringSync({ book, pageSlots, project }: { book: CanvasComicBook; pageSlots: ComicPageSlot[]; project: ComicProject }) {
    const projectPages = new Map(project.chapters.flatMap((chapter) => chapter.pages).map((page) => [page.id, page]));
    const lettering = { ...(book.lettering || {}) };
    const pageProjectIds = { ...(book.pageProjectIds || {}) };
    let mappedPages = 0;
    let unmappedPages = 0;
    let updatedPages = 0;
    let overwrittenPages = 0;
    let emptyContentPages = 0;

    pageSlots.forEach((slot) => {
        if (slot.kind !== "available") return;
        const projectPageId = pageProjectIds[slot.pageNodeId];
        const projectPage = projectPageId ? projectPages.get(projectPageId) : undefined;
        if (!projectPage) {
            unmappedPages += 1;
            return;
        }
        mappedPages += 1;
        const elements: ComicLetterElement[] = [];
        projectPage.panels.forEach((panel, panelIndex) => {
            const rect = comicPanelRect(projectPage, panel, panelIndex);
            if (panel.dialogue.trim()) {
                elements.push({ id: nanoid(), kind: "speech", text: panel.dialogue, x: Math.min(0.88, Math.max(0, rect.x + rect.w * 0.1)), y: Math.min(0.88, Math.max(0, rect.y + rect.h * 0.45)), width: Math.min(0.9, Math.max(0.15, rect.w * 0.8)), fontSize: 0.03, align: "center", tail: "right", template: "oval", tailX: 0.75 });
            }
            if (panel.caption.trim()) {
                elements.push({ id: nanoid(), kind: "caption", text: panel.caption, x: Math.min(0.88, Math.max(0, rect.x + rect.w * 0.06)), y: Math.min(0.88, Math.max(0, rect.y + rect.h * 0.06)), width: Math.min(0.9, Math.max(0.15, rect.w * 0.86)), fontSize: 0.022, align: "left", tail: "none", template: "caption" });
            }
            if (panel.sfx.trim()) {
                elements.push({ id: nanoid(), kind: "sfx", text: panel.sfx, x: Math.min(0.88, Math.max(0, rect.x + rect.w * 0.58)), y: Math.min(0.88, Math.max(0, rect.y + rect.h * 0.08)), width: Math.min(0.4, Math.max(0.12, rect.w * 0.34)), fontSize: 0.05, align: "center", tail: "none", template: "boxed" });
            }
        });
        if (!elements.length) {
            emptyContentPages += 1;
            return;
        }
        if (lettering[slot.pageNodeId]?.length) overwrittenPages += 1;
        lettering[slot.pageNodeId] = elements;
        updatedPages += 1;
    });

    return { lettering, pageProjectIds, mappedPages, unmappedPages, updatedPages, overwrittenPages, emptyContentPages };
}
