import type { ComicChapter, ComicPage, ComicProject } from "@/app/(user)/comic/types";
import type { CanvasProject } from "../../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";
import type { CanvasComicMeta, ComicPageNodeData } from "./comic-graph-types";

type ComicPageEntry = { chapterId: string; page: ComicPage };

function orderedPageEntries(project: ComicProject): ComicPageEntry[] {
    return project.chapters.flatMap((chapter) => chapter.pages.map((page) => ({ chapterId: chapter.id, page })));
}

function pageNodePayload(entry: ComicPageEntry): ComicPageNodeData {
    const { id: _pageId, ...page } = entry.page;
    return { ...page, chapterId: entry.chapterId };
}

function comicPageFromNode(node: CanvasProject["nodes"][number]): ComicPage | null {
    const payload = node.metadata?.comicPage;
    if (!payload) return null;
    const { chapterId: _chapterId, ...page } = payload;
    return { ...page, id: node.id, title: page.title || node.title };
}

function pagePosition(index: number) {
    return { x: 120 + (index % 4) * 360, y: 120 + Math.floor(index / 4) * 480 };
}

export function selectComicProject(project: CanvasProject): ComicProject | null {
    const comic = project.comic;
    const book = project.nodes.find((node) => node.type === CanvasNodeType.Comic && node.id === comic?.bookNodeId);
    if (!comic || !book) return null;
    const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
    const pages = (book.metadata?.comicBook?.pageNodeIds || []).flatMap((id) => {
        const node = nodeById.get(id);
        const page = node ? comicPageFromNode(node) : null;
        const chapterId = node?.metadata?.comicPage?.chapterId || "";
        return page ? [{ page, chapterId }] : [];
    });
    const chapters: ComicChapter[] = comic.chapterOrder.map((chapter) => ({
        ...chapter,
        summary: "",
        pages: pages.filter((entry) => entry.chapterId === chapter.id).map((entry) => entry.page),
    }));
    const unassigned = pages.filter((entry) => !comic.chapterOrder.some((chapter) => chapter.id === entry.chapterId)).map((entry) => entry.page);
    if (unassigned.length) chapters.push({ id: "unassigned", title: "未分章", summary: "", pages: unassigned });
    return {
        id: project.id,
        title: project.title,
        status: comic.status,
        stage: comic.stage,
        genre: comic.genre,
        audience: comic.audience,
        format: comic.format,
        direction: comic.direction,
        targetPages: comic.targetPages,
        logline: comic.logline,
        synopsis: comic.synopsis,
        styleGuide: comic.styleGuide,
        chapters,
        characters: comic.cast.characters,
        locations: comic.cast.locations,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}

export function applyComicProject(project: CanvasProject, next: ComicProject): CanvasProject {
    const comic = project.comic;
    const book = project.nodes.find((node) => node.type === CanvasNodeType.Comic && node.id === comic?.bookNodeId);
    if (!comic || !book) return project;
    const entries = orderedPageEntries(next);
    const pageIds = new Set(entries.map((entry) => entry.page.id));
    const existingPages = new Map(project.nodes.filter((node) => node.type === CanvasNodeType.ComicPage).map((node) => [node.id, node]));
    const nextPages = entries.map((entry, index) => {
        const existing = existingPages.get(entry.page.id);
        const payload = pageNodePayload(entry);
        if (existing) {
            return { ...existing, title: entry.page.title || existing.title, metadata: { ...existing.metadata, comicPage: payload } };
        }
        const node = createCanvasNode(CanvasNodeType.ComicPage, { x: 0, y: 0 }, { comicPage: payload }, entry.page.id);
        node.title = entry.page.title || node.title;
        node.position = pagePosition(index);
        return node;
    });
    const removedIds = new Set([...existingPages.keys()].filter((id) => !pageIds.has(id)));
    const existingNodeIds = new Set(project.nodes.map((node) => node.id));
    const nextPageById = new Map(nextPages.map((node) => [node.id, node]));
    const pageNodeIds = entries.map((entry) => entry.page.id);
    const coverNodeId = book.metadata?.comicBook?.coverNodeId && pageIds.has(book.metadata.comicBook.coverNodeId)
        ? book.metadata.comicBook.coverNodeId
        : pageNodeIds[0];
    const lettering = book.metadata?.comicBook?.lettering
        ? Object.fromEntries(Object.entries(book.metadata.comicBook.lettering).filter(([pageId]) => pageIds.has(pageId)))
        : undefined;
    const bookMeta = book.metadata?.comicBook;
    const nextBook: CanvasNodeData = {
        ...book,
        title: `${next.title.trim() || "未命名漫画"} 漫画册`,
        metadata: {
            ...book.metadata,
            comicBook: {
                ...bookMeta,
                pageNodeIds,
                coverNodeId,
                format: bookMeta?.format ?? comic.format,
                direction: bookMeta?.direction ?? comic.direction,
                lettering: lettering && Object.keys(lettering).length ? lettering : undefined,
            },
        },
    };
    const nextComic: CanvasComicMeta = {
        ...comic,
        stage: next.stage,
        format: next.format,
        direction: next.direction,
        genre: next.genre,
        audience: next.audience,
        targetPages: next.targetPages,
        logline: next.logline,
        synopsis: next.synopsis,
        styleGuide: next.styleGuide,
        status: next.status,
        chapterOrder: next.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
        cast: { characters: next.characters, locations: next.locations },
    };
    return {
        ...project,
        title: next.title.trim() || project.title,
        updatedAt: new Date().toISOString(),
        nodes: [
            ...project.nodes
                .filter((node) => !(node.type === CanvasNodeType.ComicPage && removedIds.has(node.id)))
                .map((node) => node.id === book.id ? nextBook : nextPageById.get(node.id) || node),
            ...nextPages.filter((node) => !existingNodeIds.has(node.id)),
        ],
        connections: project.connections.filter((connection) => !removedIds.has(connection.fromNodeId) && !removedIds.has(connection.toNodeId)),
        comic: nextComic,
    };
}
