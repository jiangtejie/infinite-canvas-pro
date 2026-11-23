import type { FilmAsset } from "@/lib/film/types";
import type { CanvasConnection, CanvasNodeData } from "../../types";
import { selectFilmContextCenter, type FilmContextCenterRole } from "./film-context-center";

export type FilmAssetViewItem = {
    nodeId: string;
    kind: FilmContextCenterRole;
    asset: FilmAsset;
    name: string;
    description: string;
    ready: boolean;
    productionReady: boolean;
    pending: boolean;
    sourceLibraryAssetId?: string;
    usedShots: number;
    usedScenes: number;
    updatedAt: string;
};

export type FilmAssetView = {
    groups: Record<FilmContextCenterRole, FilmAssetViewItem[]>;
    totals: { assets: number; ready: number; missing: number; unused: number };
};

export const EMPTY_FILM_ASSET_VIEW: FilmAssetView = {
    groups: { character: [], location: [], prop: [], style: [] },
    totals: { assets: 0, ready: 0, missing: 0, unused: 0 },
};

/** 资产生产用的扁平投影：与上下文中心共用同一份专用节点与 context 边真相。 */
export function selectFilmAssetView(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmAssetView {
    const center = selectFilmContextCenter(nodes, connections);
    const groups: FilmAssetView["groups"] = { character: [], location: [], prop: [], style: [] };
    (Object.keys(center.groups) as FilmContextCenterRole[]).forEach((kind) => {
        groups[kind] = center.groups[kind].map((card) => ({
            nodeId: card.nodeId,
            kind,
            asset: card.asset,
            name: card.name,
            description: card.description,
            ready: card.ready,
            productionReady: card.productionReady,
            pending: card.pending,
            sourceLibraryAssetId: card.sourceLibraryAssetId,
            usedShots: card.usedShots.length,
            usedScenes: card.usedScenes.length,
            updatedAt: card.asset.updatedAt,
        }));
    });
    return { groups, totals: center.totals };
}
