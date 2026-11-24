import type { ComicImageRef } from "@/app/(user)/comic/types";
import type { ComicPageNodeData } from "../[id]/lib/comic-graph-types";
import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export type ComicPageSlot =
    | { pageNodeId: string; kind: "available"; page: CanvasNodeData }
    | { pageNodeId: string; kind: "missing" };

export function comicPageImage(node: CanvasNodeData): ComicImageRef | undefined {
    if (node.type === CanvasNodeType.ComicPage) return node.metadata?.comicPage?.pageImage;
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return { url: node.metadata.content, storageKey: node.metadata.storageKey };
    return undefined;
}

export function comicPageReplacementPayload(nodes: CanvasNodeData[], missingPageNodeId: string, image: CanvasNodeData): ComicPageNodeData {
    const existing = nodes.find((node) => node.id === missingPageNodeId && node.type === CanvasNodeType.ComicPage)?.metadata?.comicPage;
    const pageImage: ComicImageRef = {
        url: image.metadata!.content!,
        storageKey: image.metadata?.storageKey,
        width: image.metadata?.naturalWidth,
        height: image.metadata?.naturalHeight,
    };
    return {
        ...existing,
        chapterId: existing?.chapterId || "",
        title: existing?.title || image.title || "未命名页面",
        summary: existing?.summary || "",
        panels: existing?.panels || [],
        reviewStatus: "draft",
        reviewNotes: existing?.reviewNotes || "",
        pageImage,
        compositionContext: undefined,
    };
}

export function comicImageReplacementCandidates(nodes: CanvasNodeData[], pageNodeIds: string[]) {
    const referenced = new Set(pageNodeIds);
    return nodes.filter((node) =>
        !referenced.has(node.id)
        && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Panorama)
        && Boolean(node.metadata?.content)
    );
}

export function comicBookPageKeyDirection(event: { key: string; target: unknown; defaultPrevented?: boolean }, exportSettingsOpen: boolean): -1 | 0 | 1 {
    if (exportSettingsOpen || event.defaultPrevented || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return 0;
    const target = event.target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null;
    if (!target || target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName || "") || target.closest?.("[contenteditable='true'], [role='slider']")) return 0;
    return event.key === "ArrowLeft" ? -1 : 1;
}

export function comicProjectCardSummary(project: CanvasProject) {
    const book = project.nodes.find((node) => node.type === CanvasNodeType.Comic && node.id === project.comic?.bookNodeId);
    const { pageSlots, validPages, missingPageIds } = resolveComicPageSlots({ pageNodeIds: book?.metadata?.comicBook?.pageNodeIds || [], nodes: project.nodes });
    const cover = validPages.find((node) => node.id === book?.metadata?.comicBook?.coverNodeId) || validPages[0];
    const previews = cover ? [cover, ...validPages.filter((node) => node.id !== cover.id)].slice(0, 3) : [];
    return {
        pageCount: pageSlots.length,
        composedCount: validPages.filter((node) => node.type === CanvasNodeType.ComicPage && node.metadata?.comicPage?.pageImage).length,
        missingCount: missingPageIds.length,
        cover,
        previews,
    };
}

export function resolveComicPageSlots({ pageNodeIds, nodes }: { pageNodeIds: string[]; nodes: CanvasNodeData[] }) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const pageSlots = pageNodeIds.map((pageNodeId): ComicPageSlot => {
        const page = nodeById.get(pageNodeId);
        return page && (page.type === CanvasNodeType.ComicPage || comicPageImage(page)) ? { pageNodeId, kind: "available", page } : { pageNodeId, kind: "missing" };
    });
    const validPages = pageSlots.flatMap((slot) => slot.kind === "available" ? [slot.page] : []);
    const missingPageIds = pageSlots.flatMap((slot) => slot.kind === "missing" ? [slot.pageNodeId] : []);
    return { pageSlots, validPages, missingPageIds };
}
