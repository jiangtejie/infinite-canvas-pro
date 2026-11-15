import { createCanvasNode } from "@/app/(user)/canvas/[id]/lib/canvas-node-factory";
import { NODE_STATUS_SUCCESS } from "@/app/(user)/canvas/[id]/lib/canvas-node-constants";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "@/app/(user)/canvas/types";
import { fitNodeSize } from "@/app/(user)/canvas/utils/canvas-node-size";
import type { ComicImageRef, ComicPage, ComicProject } from "../types";
import { comicPageCompositionSize } from "./comic-project";
import { mapComicBookPagesToProjectPages } from "@/app/(user)/canvas/utils/comic-book-project-link";

const PAGE_MAX_WIDTH = 300;
const PAGE_MAX_HEIGHT = 420;
const PAGE_GAP_X = 48;
const PAGE_GAP_Y = 56;
const COMIC_WIDTH = 360;
const COMIC_HEIGHT = 320;
const GROUP_GAP = 240;
const GRID_GAP_Y = 80;

type ComicCanvasImportPlan = {
    nodes: CanvasNodeData[];
    pageCount: number;
    viewport: ViewportTransform;
};

type ComicCanvasUpdatePlan = ComicCanvasImportPlan & {
    comicNodeId: string;
    added: number;
    removed: number;
};

export function findLinkedComicCanvasNode(nodes: CanvasNodeData[], projectId: string) {
    return nodes.find((node) => node.type === CanvasNodeType.Comic && node.metadata?.comicBook?.comicProjectId === projectId);
}

export function buildComicCanvasImport(project: ComicProject, existingNodes: CanvasNodeData[] = []): ComicCanvasImportPlan {
    const pages = composedPages(project);
    if (!pages.length) throw new Error("还没有已合成的页面，先到页布局合成整页");
    const origin = importOrigin(existingNodes);
    const comicNode = createCanvasNode(CanvasNodeType.Comic, { x: origin.x + COMIC_WIDTH / 2, y: origin.y + COMIC_HEIGHT / 2 });
    comicNode.title = `${project.title || "漫画"} 漫画册`;
    const gridOrigin = { x: origin.x, y: origin.y + COMIC_HEIGHT + GRID_GAP_Y };
    const pageNodes = pages.map((page, index) => createPageNode(page, project, gridOrigin, index, Math.min(4, pages.length)));
    comicNode.metadata = {
        ...comicNode.metadata,
        comicBook: {
            pageNodeIds: pageNodes.map((node) => node.id),
            coverNodeId: pageNodes[0]?.id,
            format: project.format,
            direction: project.direction,
            comicProjectId: project.id,
            pageProjectIds: mapComicBookPagesToProjectPages(pageNodes.map((node) => node.id), pages),
        },
    };
    return {
        nodes: [comicNode, ...pageNodes],
        pageCount: pageNodes.length,
        viewport: { k: 0.9, x: 80 - origin.x * 0.9, y: 80 - origin.y * 0.9 },
    };
}

export function buildComicCanvasUpdate(project: ComicProject, existingNodes: CanvasNodeData[], comicNodeId: string): ComicCanvasUpdatePlan {
    const pages = composedPages(project);
    if (!pages.length) throw new Error("还没有已合成的页面，先到页布局合成整页");
    const comicNode = existingNodes.find((node) => node.id === comicNodeId);
    if (!comicNode || comicNode.type !== CanvasNodeType.Comic) throw new Error("没有找到要更新的漫画册");
    const book = comicNode.metadata?.comicBook;
    const oldPageIds = book?.pageNodeIds || [];
    const nodeById = new Map(existingNodes.map((node) => [node.id, node]));
    const replacements = new Map<string, CanvasNodeData>();
    const created: CanvasNodeData[] = [];
    const pageNodeIds: string[] = [];
    const overflowOrigin = importOrigin(existingNodes);

    pages.forEach((page, index) => {
        const oldNode = nodeById.get(oldPageIds[index] || "");
        if (oldNode?.type === CanvasNodeType.Image) {
            replacements.set(oldNode.id, updatePageNode(oldNode, page, project));
            pageNodeIds.push(oldNode.id);
            return;
        }
        const node = createPageNode(page, project, overflowOrigin, created.length, 4);
        created.push(node);
        pageNodeIds.push(node.id);
    });

    const ids = Array.from(new Set(pageNodeIds));
    const pageProjectIds = mapComicBookPagesToProjectPages(ids, pages);
    const oldCoverIndex = book?.coverNodeId ? oldPageIds.indexOf(book.coverNodeId) : -1;
    const coverNodeId = oldCoverIndex >= 0 ? ids[oldCoverIndex] || ids[0] : ids[0];
    const lettering = book?.lettering
        ? Object.fromEntries(Object.entries(book.lettering).filter(([pageId]) => ids.includes(pageId)))
        : undefined;
    const nextComic: CanvasNodeData = {
        ...comicNode,
        metadata: {
            ...comicNode.metadata,
            comicBook: {
                ...(book || {}),
                pageNodeIds: ids,
                coverNodeId,
                format: project.format,
                direction: project.direction,
                comicProjectId: project.id,
                pageProjectIds,
                lettering: lettering && Object.keys(lettering).length ? lettering : undefined,
            },
        },
    };
    replacements.set(comicNode.id, nextComic);
    return {
        nodes: [...existingNodes.map((node) => replacements.get(node.id) || node), ...created],
        pageCount: ids.length,
        comicNodeId,
        added: created.length,
        removed: oldPageIds.filter((pageId) => !ids.includes(pageId)).length,
        viewport: { k: 0.9, x: 120 - comicNode.position.x * 0.9, y: 120 - comicNode.position.y * 0.9 },
    };
}

function composedPages(project: ComicProject) {
    return project.chapters.flatMap((chapter) => chapter.pages).filter((page) => page.pageImage);
}

function createPageNode(page: ComicPage, project: ComicProject, gridOrigin: { x: number; y: number }, index: number, columns: number) {
    const image = page.pageImage as ComicImageRef;
    const natural = pageImageSize(image, project);
    const size = fitNodeSize(natural.width, natural.height, PAGE_MAX_WIDTH, PAGE_MAX_HEIGHT);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centerX = gridOrigin.x + column * (PAGE_MAX_WIDTH + PAGE_GAP_X) + size.width / 2;
    const centerY = gridOrigin.y + row * (PAGE_MAX_HEIGHT + PAGE_GAP_Y) + size.height / 2;
    const node = createCanvasNode(CanvasNodeType.Image, { x: centerX, y: centerY }, pageNodeMetadata(image, natural));
    node.title = page.title || `第 ${index + 1} 页`;
    node.width = size.width;
    node.height = size.height;
    node.position = { x: centerX - size.width / 2, y: centerY - size.height / 2 };
    return node;
}

function updatePageNode(existing: CanvasNodeData, page: ComicPage, project: ComicProject): CanvasNodeData {
    const image = page.pageImage as ComicImageRef;
    const natural = pageImageSize(image, project);
    const size = existing.metadata?.freeResize ? { width: existing.width, height: existing.height } : fitNodeSize(natural.width, natural.height, PAGE_MAX_WIDTH, PAGE_MAX_HEIGHT);
    const centerX = existing.position.x + existing.width / 2;
    const centerY = existing.position.y + existing.height / 2;
    return {
        ...existing,
        title: page.title || existing.title,
        width: size.width,
        height: size.height,
        position: { x: centerX - size.width / 2, y: centerY - size.height / 2 },
        metadata: pageNodeMetadata(image, natural, existing.metadata),
    };
}

function pageImageSize(image: ComicImageRef, project: ComicProject) {
    const fallback = comicPageCompositionSize(project.format);
    return { width: image.width || fallback.width, height: image.height || fallback.height };
}

function pageNodeMetadata(image: ComicImageRef, natural: { width: number; height: number }, metadata: CanvasNodeData["metadata"] = {}) {
    return {
        ...metadata,
        content: image.url,
        storageKey: image.storageKey,
        status: NODE_STATUS_SUCCESS,
        naturalWidth: natural.width,
        naturalHeight: natural.height,
        mimeType: "image/png",
        progress: 100,
        errorDetails: undefined,
        imageTaskId: undefined,
        imageTaskResultId: undefined,
        clientTaskId: undefined,
        taskBackend: undefined,
    };
}

function importOrigin(existingNodes: CanvasNodeData[]) {
    if (!existingNodes.length) return { x: 0, y: 0 };
    const maxX = Math.max(...existingNodes.map((node) => node.position.x + node.width));
    const minY = Math.min(...existingNodes.map((node) => node.position.y));
    return { x: maxX + GROUP_GAP, y: minY };
}
