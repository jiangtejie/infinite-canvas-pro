import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset } from "@/lib/film/types";
import { FILM_IMAGE_REFERENCE_LIMIT } from "@/app/(user)/film/utils/film-shot-generation";
import type { CanvasConnection, CanvasNodeData } from "../../types";
import { defaultFilmAssetProductionSelection, planFilmAssetProduction, type FilmAssetProductionPlan } from "./film-asset-production";
import { planFilmShotBatch } from "./film-batch-preflight";
import type { FilmContextCenterRole } from "./film-context-center";
import { selectFilmShotEntries } from "./film-selectors";
import { defaultFilmShotProductionSelection, planFilmShotProduction } from "./film-shot-production";
import type { FilmProductionKind, FilmShotBatchKind } from "./film-studio-types";

export type { FilmProductionKind } from "./film-studio-types";
export type FilmProductionStatus = "ready" | "done" | "busy" | "failed" | "blocked";

export type FilmProductionItem = {
    id: string;
    target: "asset" | "shot";
    kind: FilmProductionKind;
    title: string;
    subtitle: string;
    groupId: string;
    group: string;
    status: FilmProductionStatus;
    canStart: boolean;
    reason: string;
    selected: boolean;
};

export type FilmProductionAssetItem = FilmProductionItem & { target: "asset"; kind: "asset"; role: FilmContextCenterRole; asset: FilmAsset };
export type FilmProductionShotItem = FilmProductionItem & {
    target: "shot";
    kind: FilmShotBatchKind;
    /** 当前生成类型对应的媒体，用于制作中心缩略图。 */
    media?: { url?: string; storageKey?: string };
};
export type FilmProductionPlanItem = FilmProductionAssetItem | FilmProductionShotItem;

export type FilmProductionPlan = {
    shotKind: FilmShotBatchKind;
    assets: FilmProductionAssetItem[];
    shots: FilmProductionShotItem[];
    failures: FilmProductionPlanItem[];
    completed: FilmProductionPlanItem[];
    selected: { assetIds: string[]; shotIds: string[] };
    queue: { assetRemaining: number; shotRemaining: number; shotKind?: FilmShotBatchKind };
    warnings: number;
    totals: { assets: number; shots: number; ready: number; done: number; busy: number; failed: number; blocked: number };
};

export const EMPTY_FILM_PRODUCTION_PLAN: FilmProductionPlan = {
    shotKind: "image",
    assets: [],
    shots: [],
    failures: [],
    completed: [],
    selected: { assetIds: [], shotIds: [] },
    queue: { assetRemaining: 0, shotRemaining: 0 },
    warnings: 0,
    totals: { assets: 0, shots: 0, ready: 0, done: 0, busy: 0, failed: 0, blocked: 0 },
};

export type FilmProductionOptions = {
    assetIds?: string[];
    shotIds?: string[];
    entryKind?: FilmProductionKind;
    shotKind?: FilmShotBatchKind;
    imageMaxReferences?: number;
    videoMaxReferences?: number;
    assetQueue?: { remainingNodeIds: string[] } | null;
    shotQueue?: { remainingShotIds: string[]; kind: FilmShotBatchKind } | null;
    assetPlan?: FilmAssetProductionPlan;
    stylePresetId?: string;
    directorStyleId?: string;
};

/** 制作中心读模型：组合既有资产计划、镜头计划与批量预检，不创建第二套执行状态。 */
export function selectFilmProductionPlan(nodes: CanvasNodeData[], connections: CanvasConnection[], options: FilmProductionOptions = {}): FilmProductionPlan {
    const shotKind = options.shotKind ?? "image";
    const assetScope = options.assetIds !== undefined || options.entryKind === "asset";
    const shotScope = options.shotIds !== undefined || options.entryKind === "image" || options.entryKind === "video";
    const scoped = assetScope || shotScope;
    const assetPlan = options.assetPlan ?? planFilmAssetProduction(nodes, connections);
    const assetSelection = options.assetIds ? new Set(options.assetIds) : scoped && !assetScope ? new Set<string>() : defaultFilmAssetProductionSelection(assetPlan);
    const assets: FilmProductionAssetItem[] = assetPlan.items.map((item) => {
        const failed = item.asset.status === "failed" && Boolean(item.asset.errorMessage);
        const status: FilmProductionStatus = item.pending ? "busy" : failed ? "failed" : item.blocked ? "blocked" : item.ready ? "done" : "ready";
        return {
            id: item.nodeId,
            target: "asset",
            kind: "asset",
            role: item.kind,
            asset: item.asset,
            title: item.name,
            subtitle: `${item.targetLabel} · ${item.usedShots} 镜`,
            groupId: item.kind,
            group: FILM_ASSET_KIND_LABELS[item.kind],
            status,
            canStart: !item.pending && !item.blocked,
            reason: item.pending ? "生成中" : failed ? item.asset.errorMessage || "上次生成失败" : item.blocked ? item.blockedReason : item.ready ? "已有参考" : "",
            selected: assetSelection.has(item.nodeId),
        };
    });

    const entries = selectFilmShotEntries(nodes, connections);
    const shotById = new Map(entries.map((entry) => [entry.shot.id, entry.shot]));
    const shotPlan = planFilmShotProduction(entries, shotKind);
    const batch = planFilmShotBatch(nodes, connections, shotPlan.items.map((item) => item.shotId), shotKind, {
        maxReferences: shotKind === "image" ? options.imageMaxReferences ?? FILM_IMAGE_REFERENCE_LIMIT : options.videoMaxReferences ?? 8,
        stylePresetId: options.stylePresetId,
        directorStyleId: options.directorStyleId,
    });
    const readyIds = new Set(batch.ready.map((item) => item.shotId));
    const skips = new Map(batch.skipped.map((skip) => [skip.shotId, skip]));
    const shotSelection = options.shotIds ? new Set(options.shotIds) : scoped && !shotScope ? new Set<string>() : defaultFilmShotProductionSelection(shotPlan);
    const shots: FilmProductionShotItem[] = shotPlan.items.map((item) => {
        const skip = skips.get(item.shotId);
        const blocked = Boolean(skip && skip.reason !== "busy");
        const status: FilmProductionStatus = item.status === "busy"
            ? "busy"
            : blocked
                ? "blocked"
                : item.status === "failed"
                    ? "failed"
                    : item.hasMedia
                        ? "done"
                        : "ready";
        const payload = shotById.get(item.shotId)?.metadata?.filmShot;
        return {
            id: item.shotId,
            target: "shot",
            kind: shotKind,
            title: item.shotNo,
            subtitle: item.description || "没有画面描述",
            groupId: item.sceneId,
            group: item.sceneLabel,
            status,
            canStart: readyIds.has(item.shotId),
            reason: item.status === "busy" ? "生成中" : skip ? skip.message : item.status === "failed" ? item.error || "上次生成失败" : item.hasMedia ? "已生成" : "",
            selected: shotSelection.has(item.shotId),
            media: shotKind === "image"
                ? { url: payload?.imageUrl, storageKey: payload?.storageKey }
                : { url: payload?.videoUrl, storageKey: payload?.videoStorageKey },
        };
    });

    const items: FilmProductionPlanItem[] = [...assets, ...shots];
    return {
        shotKind,
        assets,
        shots,
        failures: items.filter((item) => item.status === "failed"),
        completed: items.filter((item) => item.status === "done"),
        selected: {
            assetIds: assets.filter((item) => item.selected).map((item) => item.id),
            shotIds: shots.filter((item) => item.selected).map((item) => item.id),
        },
        queue: {
            assetRemaining: options.assetQueue?.remainingNodeIds.length || 0,
            shotRemaining: options.shotQueue?.remainingShotIds.length || 0,
            ...(options.shotQueue ? { shotKind: options.shotQueue.kind } : {}),
        },
        warnings: batch.warnings,
        totals: {
            assets: assets.length,
            shots: shots.length,
            ready: items.filter((item) => item.status === "ready").length,
            done: items.filter((item) => item.status === "done").length,
            busy: items.filter((item) => item.status === "busy").length,
            failed: items.filter((item) => item.status === "failed").length,
            blocked: items.filter((item) => item.status === "blocked").length,
        },
    };
}
