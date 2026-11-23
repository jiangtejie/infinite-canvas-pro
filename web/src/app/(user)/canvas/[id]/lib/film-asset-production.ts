import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { filmReferenceBoardTemplate } from "@/app/(user)/film/utils/film-reference-board-templates";
import type { CanvasConnection, CanvasNodeData } from "../../types";
import { selectFilmAssetView } from "./film-asset-view";
import type { FilmContextCenterRole } from "./film-context-center";

export type FilmAssetProductionItem = {
    nodeId: string;
    kind: FilmContextCenterRole;
    asset: FilmAsset;
    name: string;
    ready: boolean;
    pending: boolean;
    usedShots: number;
    usedScenes: number;
    templateId?: string;
    templateName?: string;
    targetLabel: string;
};

export type FilmAssetProductionPlan = {
    items: FilmAssetProductionItem[];
    totals: { assets: number; missing: number; ready: number; pending: number };
};

export type FilmAssetProductionStatus = "pending" | "running" | "success" | "failed";

export type FilmAssetProductionItemState = {
    nodeId: string;
    name: string;
    kind: FilmAssetKind;
    status: FilmAssetProductionStatus;
    error?: string;
};

export type FilmAssetProductionState = {
    running: boolean;
    total: number;
    completed: number;
    failed: number;
    currentIndex: number;
    currentNodeId: string;
    currentName: string;
    progress: number;
    items: FilmAssetProductionItemState[];
};

export const EMPTY_FILM_ASSET_PRODUCTION: FilmAssetProductionState = {
    running: false,
    total: 0,
    completed: 0,
    failed: 0,
    currentIndex: 0,
    currentNodeId: "",
    currentName: "",
    progress: 0,
    items: [],
};

export const EMPTY_FILM_ASSET_PRODUCTION_PLAN: FilmAssetProductionPlan = {
    items: [],
    totals: { assets: 0, missing: 0, ready: 0, pending: 0 },
};

const KIND_ORDER: Record<FilmContextCenterRole, number> = { character: 0, location: 1, prop: 2, style: 3 };

export function defaultFilmAssetProductionSelection(plan: FilmAssetProductionPlan) {
    return new Set(plan.items.filter((item) => !item.ready && !item.pending).map((item) => item.nodeId));
}

export function initialFilmAssetProductionSelection(plan: FilmAssetProductionPlan, preferred?: string[]) {
    return preferred
        ? new Set(plan.items.filter((item) => preferred.includes(item.nodeId) && !item.pending).map((item) => item.nodeId))
        : defaultFilmAssetProductionSelection(plan);
}

export function planFilmAssetProduction(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmAssetProductionPlan {
    const view = selectFilmAssetView(nodes, connections);
    const items = (Object.keys(view.groups) as FilmContextCenterRole[]).flatMap((kind) => view.groups[kind].map((item) => {
        const template = kind === "character" ? filmReferenceBoardTemplate(item.asset.referenceTemplateId) : null;
        return {
            nodeId: item.nodeId,
            kind,
            asset: item.asset,
            name: item.name,
            ready: item.productionReady,
            pending: item.pending,
            usedShots: item.usedShots,
            usedScenes: item.usedScenes,
            templateId: template?.id,
            templateName: template?.name,
            targetLabel: template ? `参考板 · ${template.name}` : kind === "style" ? "风格参考图" : "概念图",
        };
    }));
    items.sort((left, right) =>
        KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
        || Number(left.ready) - Number(right.ready)
        || right.usedShots - left.usedShots
        || left.name.localeCompare(right.name));
    return {
        items,
        totals: {
            assets: items.length,
            missing: items.filter((item) => !item.ready && !item.pending).length,
            ready: items.filter((item) => item.ready).length,
            pending: items.filter((item) => item.pending).length,
        },
    };
}
