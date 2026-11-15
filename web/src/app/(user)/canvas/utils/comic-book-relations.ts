import { CanvasNodeType, type CanvasNodeData } from "../types";

export function expandComicBookPageRelations({ activeNodeId, nodes, baseNodeIds, baseConnectionIds }: {
    activeNodeId: string | null;
    nodes: CanvasNodeData[];
    baseNodeIds: Set<string>;
    baseConnectionIds: Set<string>;
}) {
    const nodeIds = new Set(baseNodeIds);
    const connectionIds = new Set(baseConnectionIds);
    if (!activeNodeId) return { nodeIds, connectionIds };

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const comics = nodes.filter((node) => node.type === CanvasNodeType.Comic && node.metadata?.comicBook);
    const activeNode = nodeById.get(activeNodeId);
    const activeComic = activeNode?.type === CanvasNodeType.Comic ? activeNode : undefined;
    const activeComicIds = activeComic ? new Set([activeComic.id]) : new Set(comics.filter((comic) => comic.metadata!.comicBook!.pageNodeIds.includes(activeNodeId)).map((comic) => comic.id));

    comics.forEach((comic) => {
        const isRelated = activeComicIds.has(comic.id) || comic.metadata!.comicBook!.pageNodeIds.includes(activeNodeId);
        if (!isRelated) return;
        nodeIds.add(comic.id);
        comic.metadata!.comicBook!.pageNodeIds.forEach((pageNodeId) => {
            if (nodeById.has(pageNodeId)) nodeIds.add(pageNodeId);
        });
    });

    return { nodeIds, connectionIds };
}
