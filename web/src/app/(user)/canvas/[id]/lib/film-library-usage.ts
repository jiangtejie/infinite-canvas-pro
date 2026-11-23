import type { FilmAssetKind } from "@/lib/film/types";
import { EMPTY_FILM_LIBRARY_USAGE, type FilmLibraryUsage } from "@/app/(user)/film/utils/film-library";
import type { CanvasProject } from "../../stores/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { orderFilmShots } from "./film-layout";
import { filmContextAsset, filmContextAssetKey, type FilmContextAssetKey } from "./film-node-patch";

const ASSET_KEY_BY_KIND: Record<Exclude<FilmAssetKind, "costume">, FilmContextAssetKey> = {
    character: "filmCharacter",
    location: "filmLocation",
    prop: "filmProp",
    style: "filmStyle",
};

/** 当前上下文节点被哪些镜头引用（只认 context 边，按全片链顺序返回镜号）。 */
export function filmAssetBoundShotNumbers(nodes: CanvasNodeData[], connections: CanvasConnection[], assetNodeId: string): string[] {
    const shotIds = new Set(connections
        .filter((edge) => edge.kind === "context" && edge.fromNodeId === assetNodeId)
        .map((edge) => edge.toNodeId));
    if (!shotIds.size) return [];
    return orderFilmShots(nodes.filter((node) => node.type === CanvasNodeType.FilmShot), connections)
        .filter((node) => shotIds.has(node.id))
        .map((node) => node.metadata?.filmShot?.shotNo || node.title || node.id);
}

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
        if (kind === "costume") {
            // 服装只在母版库；项目引用来自角色造型状态。
            const referenced = new Set<string>();
            for (const node of project.nodes) {
                const asset = filmContextAsset(node);
                if (!asset || filmContextAssetKey(node) !== "filmCharacter") continue;
                for (const state of asset.character?.states || []) {
                    if (!state.costumeId) continue;
                    ensure(state.costumeId).bindings += 1;
                    referenced.add(state.costumeId);
                }
            }
            referenced.forEach((libraryId) => {
                ensure(libraryId).projects += 1;
                ensure(libraryId).projectTitles.push(project.title);
            });
            continue;
        }
        const copyToLibrary = new Map<string, string>();
        for (const node of project.nodes) {
            const asset = filmContextAsset(node);
            if (!asset?.sourceLibraryAssetId || filmContextAssetKey(node) !== ASSET_KEY_BY_KIND[kind]) continue;
            const usage = ensure(asset.sourceLibraryAssetId);
            usage.copies += 1;
            if (!usage.projectTitles.includes(project.title)) {
                usage.projects += 1;
                usage.projectTitles.push(project.title);
            }
            copyToLibrary.set(node.id, asset.sourceLibraryAssetId);
        }
        if (!copyToLibrary.size || kind === "style") continue;
        const shotIds = new Set(project.nodes.filter((node) => node.type === CanvasNodeType.FilmShot).map((node) => node.id));
        for (const edge of project.connections) {
            if (edge.kind !== "context" || !shotIds.has(edge.toNodeId) || edge.data.role !== kind) continue;
            const libraryId = copyToLibrary.get(edge.fromNodeId);
            const usage = libraryId ? index.get(libraryId) : undefined;
            if (usage) usage.bindings += 1;
        }
    }
    return index;
}
