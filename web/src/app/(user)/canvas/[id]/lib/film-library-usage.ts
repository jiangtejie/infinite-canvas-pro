import type { FilmAssetKind } from "@/lib/film/types";
import { EMPTY_FILM_LIBRARY_USAGE, type FilmLibraryUsage } from "@/app/(user)/film/utils/film-library";
import type { CanvasProject } from "../../stores/use-canvas-store";
import { CanvasNodeType } from "../../types";

export function filmCanvasLibraryUsageIndex(projects: CanvasProject[], kind: FilmAssetKind): Map<string, FilmLibraryUsage> {
    const index = new Map<string, FilmLibraryUsage>();
    const ensure = (libraryId: string) => {
        const current = index.get(libraryId);
        if (current) return current;
        const created: FilmLibraryUsage = { ...EMPTY_FILM_LIBRARY_USAGE, projectTitles: [] };
        index.set(libraryId, created);
        return created;
    };
    for (const project of projects) {
        const assetById = new Map(project.nodes.flatMap((node) => {
            const payload = node.type === CanvasNodeType.FilmAsset ? node.metadata?.filmAsset : undefined;
            return payload?.kind === kind ? [[node.id, payload.asset] as const] : [];
        }));
        if (!assetById.size) continue;
        const copyToLibrary = new Map<string, string>();
        for (const [nodeId, asset] of assetById) {
            if (!asset.sourceLibraryAssetId) continue;
            const usage = ensure(asset.sourceLibraryAssetId);
            usage.copies += 1;
            if (!usage.projectTitles.includes(project.title)) {
                usage.projects += 1;
                usage.projectTitles.push(project.title);
            }
            copyToLibrary.set(nodeId, asset.sourceLibraryAssetId);
        }
        if (!copyToLibrary.size || kind === "style") continue;
        const add = (libraryId?: string) => {
            if (!libraryId) return;
            const usage = index.get(libraryId);
            if (usage) usage.bindings += 1;
        };
        if (kind === "costume") {
            for (const asset of assetById.values()) {
                for (const state of asset.character?.states || []) {
                    add(state.costumeId ? copyToLibrary.get(state.costumeId) : undefined);
                }
            }
            continue;
        }
        const shotIds = new Set(project.nodes.filter((node) => node.type === CanvasNodeType.Shot).map((node) => node.id));
        for (const edge of project.connections) {
            if (edge.kind !== "binding" || !shotIds.has(edge.toNodeId)) continue;
            add(copyToLibrary.get(edge.fromNodeId));
        }
    }
    return index;
}
