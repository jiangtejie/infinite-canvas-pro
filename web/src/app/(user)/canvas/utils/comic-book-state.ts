import type { ComicImageRef } from "@/app/(user)/comic/types";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export type ComicPageSlot =
    | { pageNodeId: string; kind: "available"; page: CanvasNodeData }
    | { pageNodeId: string; kind: "missing" };

export function comicPageImage(node: CanvasNodeData): ComicImageRef | undefined {
    if (node.type === CanvasNodeType.ComicPage) return node.metadata?.comicPage?.pageImage;
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return { url: node.metadata.content, storageKey: node.metadata.storageKey };
    return undefined;
}

export function resolveComicPageSlots({ pageNodeIds, nodes }: { pageNodeIds: string[]; nodes: CanvasNodeData[] }) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const pageSlots = pageNodeIds.map((pageNodeId): ComicPageSlot => {
        const page = nodeById.get(pageNodeId);
        return page && comicPageImage(page) ? { pageNodeId, kind: "available", page } : { pageNodeId, kind: "missing" };
    });
    const validPages = pageSlots.flatMap((slot) => slot.kind === "available" ? [slot.page] : []);
    const missingPageIds = pageSlots.flatMap((slot) => slot.kind === "missing" ? [slot.pageNodeId] : []);
    return { pageSlots, validPages, missingPageIds };
}
