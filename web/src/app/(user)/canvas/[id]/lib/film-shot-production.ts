import type { FilmShotBatchKind, FilmShotEntry } from "./film-studio-types";
import { filmFrameReady, filmVideoMode } from "./film-shot-video-frames";

export type FilmShotProductionStatus = "ready" | "done" | "busy" | "no-text" | "frames" | "failed";

export type FilmShotProductionItem = {
    shotId: string;
    shotNo: string;
    sceneId: string;
    sceneLabel: string;
    description: string;
    status: FilmShotProductionStatus;
    hasMedia: boolean;
    canGenerate: boolean;
    error: string;
};

export type FilmShotProductionGroup = {
    sceneId: string;
    label: string;
    items: FilmShotProductionItem[];
};

export type FilmShotProductionPlan = {
    kind: FilmShotBatchKind;
    groups: FilmShotProductionGroup[];
    items: FilmShotProductionItem[];
    totals: { shots: number; ready: number; done: number; blocked: number; failed: number };
};

export function planFilmShotProduction(shots: FilmShotEntry[], kind: FilmShotBatchKind): FilmShotProductionPlan {
    const items: FilmShotProductionItem[] = [];
    const groups = new Map<string, FilmShotProductionGroup>();
    for (const entry of shots) {
        const payload = entry.shot.metadata?.filmShot;
        const busy = entry.shot.metadata?.status === "loading" || entry.shot.metadata?.status === "stopping";
        const hasText = Boolean((payload?.prompt || payload?.description || "").trim());
        const framesBlocked = kind === "video" && filmVideoMode(payload) === "frames" && !filmFrameReady(payload?.firstFrame);
        const failed = entry.shot.metadata?.status === "error" && payload?.lastFailedTaskKind === kind;
        const hasMedia = kind === "image"
            ? Boolean(payload?.imageUrl || payload?.storageKey)
            : Boolean(payload?.videoUrl || payload?.videoStorageKey);
        const status: FilmShotProductionStatus = busy
            ? "busy"
            : !hasText
                ? "no-text"
                : framesBlocked
                    ? "frames"
                    : failed
                        ? "failed"
                        : hasMedia
                            ? "done"
                            : "ready";
        const item: FilmShotProductionItem = {
            shotId: entry.shot.id,
            shotNo: payload?.shotNo || entry.shot.title || "镜头",
            sceneId: entry.sceneId,
            sceneLabel: entry.sceneLabel,
            description: payload?.description || "",
            status,
            hasMedia,
            canGenerate: !busy && hasText && !framesBlocked,
            error: failed ? entry.shot.metadata?.errorDetails || payload?.errorMessage || "上次生成失败" : "",
        };
        items.push(item);
        const group = groups.get(entry.sceneId);
        if (group) group.items.push(item);
        else groups.set(entry.sceneId, { sceneId: entry.sceneId, label: entry.sceneLabel, items: [item] });
    }
    return {
        kind,
        groups: [...groups.values()],
        items,
        totals: {
            shots: items.length,
            ready: items.filter((item) => item.canGenerate && !item.hasMedia).length,
            done: items.filter((item) => item.hasMedia).length,
            blocked: items.filter((item) => !item.canGenerate).length,
            failed: items.filter((item) => item.status === "failed").length,
        },
    };
}

export function defaultFilmShotProductionSelection(plan: FilmShotProductionPlan) {
    return new Set(plan.items.filter((item) => item.canGenerate && !item.hasMedia).map((item) => item.shotId));
}
