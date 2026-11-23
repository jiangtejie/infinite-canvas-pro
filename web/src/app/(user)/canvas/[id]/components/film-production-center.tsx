"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clapperboard, Film, Loader2, Square, Video, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FilmAssetThumbnail } from "@/app/(user)/film/components/film-asset-thumbnail";
import type { FilmAssetProductionState } from "../lib/film-asset-production";
import type { FilmProductionKind, FilmProductionPlan, FilmProductionPlanItem } from "../lib/film-production-plan";
import type { FilmShotBatchKind, FilmShotBatchState } from "../lib/film-studio-types";
import { canvasStatusColors } from "../../lib/canvas-palette";

type ProductionTab = "all" | "assets" | "shots" | "failed" | "completed";
type StartTarget = { kind: FilmProductionKind; ids: string[] };

const TABS: Array<{ value: ProductionTab; label: string }> = [
    { value: "all", label: "全部" },
    { value: "assets", label: "资产" },
    { value: "shots", label: "镜头" },
    { value: "failed", label: "失败" },
    { value: "completed", label: "已完成" },
];

export function FilmProductionCenter({ theme, plan, assetState, shotBatch, initialAssetIds, initialShotIds, initialKind, onKindChange, onStartAssets, onStopAssets, onStartShots, onStopShots, onLocate, onClose }: {
    theme: CanvasTheme;
    plan: FilmProductionPlan;
    assetState: FilmAssetProductionState;
    shotBatch: FilmShotBatchState;
    initialAssetIds?: string[];
    initialShotIds?: string[];
    initialKind?: FilmProductionKind;
    onKindChange: (kind: FilmShotBatchKind) => void;
    onStartAssets: (nodeIds: string[]) => void;
    onStopAssets: () => void;
    onStartShots: (shotIds: string[], kind: FilmShotBatchKind) => void;
    onStopShots: () => void;
    onLocate: (target: "asset" | "shot", id: string) => void;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<ProductionTab>(() => initialAssetIds?.length ? "assets" : initialShotIds?.length ? "shots" : initialKind === "asset" ? "assets" : initialKind ? "shots" : "all");
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(() => new Set(plan.selected.assetIds));
    const [selectedShots, setSelectedShots] = useState<Set<string>>(() => new Set(plan.selected.shotIds));
    const planRef = useRef(plan);
    const previousKindRef = useRef(plan.shotKind);
    const assetWasRunningRef = useRef(false);
    const shotWasRunningRef = useRef(false);

    useEffect(() => {
        planRef.current = plan;
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const key = event.key.toLowerCase();
            if (!["1", "2", "3", "4", "s", "p", "m", "o", "c", "g", "v"].includes(key)) return;
            event.stopPropagation();
            if (/^\d$/.test(key)) event.preventDefault();
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, []);

    useEffect(() => {
        if (previousKindRef.current === plan.shotKind) return;
        previousKindRef.current = plan.shotKind;
        setSelectedShots(new Set(planRef.current.selected.shotIds));
    }, [plan.shotKind]);

    useEffect(() => {
        if (assetState.running) {
            assetWasRunningRef.current = true;
            return;
        }
        if (!assetWasRunningRef.current) return;
        assetWasRunningRef.current = false;
        const done = new Set(plan.assets.filter((item) => item.status === "done").map((item) => item.id));
        setSelectedAssets((prev) => new Set([...prev].filter((id) => !done.has(id))));
    }, [assetState.running, plan.assets]);

    useEffect(() => {
        if (shotBatch.running) {
            shotWasRunningRef.current = true;
            return;
        }
        if (!shotWasRunningRef.current) return;
        shotWasRunningRef.current = false;
        const done = new Set(plan.shots.filter((item) => item.status === "done").map((item) => item.id));
        setSelectedShots((prev) => new Set([...prev].filter((id) => !done.has(id))));
    }, [plan.shots, shotBatch.running]);

    const running = assetState.running || shotBatch.running;
    const activeItems = useMemo<FilmProductionPlanItem[]>(() => {
        const all: FilmProductionPlanItem[] = [...plan.assets, ...plan.shots];
        if (tab === "assets") return plan.assets;
        if (tab === "shots") return plan.shots;
        if (tab === "failed") return plan.failures;
        if (tab === "completed") return plan.completed;
        return all;
    }, [plan.assets, plan.completed, plan.failures, plan.shots, tab]);
    const groups = useMemo(() => {
        const map = new Map<string, { target: "asset" | "shot"; label: string; items: FilmProductionPlanItem[] }>();
        activeItems.forEach((item) => {
            const key = `${item.target}:${item.groupId}`;
            const current = map.get(key);
            if (current) current.items.push(item);
            else map.set(key, { target: item.target, label: item.target === "asset" ? `资产 · ${item.group}` : item.group, items: [item] });
        });
        return [...map.values()];
    }, [activeItems]);
    const selectedStartableAssets = plan.assets.filter((item) => selectedAssets.has(item.id) && item.canStart).map((item) => item.id);
    const selectedStartableShots = plan.shots.filter((item) => selectedShots.has(item.id) && item.canStart).map((item) => item.id);
    const selectableItems = activeItems.filter((item) => item.canStart && (tab === "failed" || item.status !== "done"));
    const allSelectable = selectableItems.length > 0 && selectableItems.every((item) => item.target === "asset" ? selectedAssets.has(item.id) : selectedShots.has(item.id));

    const toggle = (item: FilmProductionPlanItem) => {
        if (running || !item.canStart) return;
        if (item.target === "asset") setSelectedAssets((prev) => toggleSet(prev, item.id));
        else setSelectedShots((prev) => toggleSet(prev, item.id));
    };
    const toggleAll = () => {
        if (running) return;
        const assetIds = selectableItems.filter((item) => item.target === "asset").map((item) => item.id);
        const shotIds = selectableItems.filter((item) => item.target === "shot").map((item) => item.id);
        setSelectedAssets((prev) => toggleMany(prev, assetIds, !allSelectable));
        setSelectedShots((prev) => toggleMany(prev, shotIds, !allSelectable));
    };
    const selectGroup = (items: FilmProductionPlanItem[]) => {
        const assetIds = items.filter((item) => item.target === "asset" && item.canStart && item.status !== "done").map((item) => item.id);
        const shotIds = items.filter((item) => item.target === "shot" && item.canStart && item.status !== "done").map((item) => item.id);
        setSelectedAssets((prev) => new Set([...prev, ...assetIds]));
        setSelectedShots((prev) => new Set([...prev, ...shotIds]));
    };
    const start = (target: StartTarget) => {
        if (target.kind === "asset") onStartAssets(target.ids);
        else onStartShots(target.ids, target.kind);
    };

    return (
        <Modal open onCancel={running ? () => undefined : onClose} footer={null} closable={false} centered width="min(1040px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-base font-semibold"><Clapperboard className="size-4" style={{ color: theme.canvas.selectionStroke }} />制作中心</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>统一查看资产参考与镜头分镜图/视频；执行沿用现有队列、停止与刷新续跑。</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                            {(["image", "video"] as const).map((kind) => <button key={kind} type="button" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] disabled:opacity-40" style={{ background: plan.shotKind === kind ? theme.canvas.selectionSoft : undefined, color: plan.shotKind === kind ? theme.node.text : theme.node.muted }} disabled={running} onClick={() => onKindChange(kind)}>{kind === "image" ? <Film className="size-3" /> : <Video className="size-3" />}{kind === "image" ? "分镜图" : "视频"}</button>)}
                        </div>
                        {running ? null : <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭制作中心"><X className="size-4" /></button>}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex flex-wrap items-center gap-1">
                        {TABS.map((entry) => {
                            const count = entry.value === "all" ? plan.assets.length + plan.shots.length : entry.value === "assets" ? plan.assets.length : entry.value === "shots" ? plan.shots.length : entry.value === "failed" ? plan.failures.length : plan.completed.length;
                            return <button key={entry.value} type="button" className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: tab === entry.value ? theme.canvas.selectionStroke : theme.node.stroke, background: tab === entry.value ? theme.canvas.selectionSoft : undefined, color: tab === entry.value ? theme.node.text : theme.node.muted }} onClick={() => setTab(entry.value)}>{entry.label} {count}</button>;
                        })}
                    </div>
                    <span className="ml-auto flex flex-wrap items-center gap-1 text-[10px]" style={{ color: theme.node.muted }}>
                        {plan.queue.assetRemaining || plan.queue.shotRemaining ? <span className="rounded-full border px-2 py-0.5" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>续跑：资产 {plan.queue.assetRemaining} · 镜头 {plan.queue.shotRemaining}</span> : null}
                        {plan.warnings ? <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}><AlertTriangle className="size-2.5" />编译警告 {plan.warnings}</span> : null}
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>选中资产 {selectedAssets.size} · 镜头 {selectedShots.size}</span>
                        <button type="button" className="rounded-full border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: theme.node.stroke }} disabled={running || !selectableItems.length} onClick={toggleAll}>{allSelectable ? "取消全选" : "全选可执行"}</button>
                        <button type="button" className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }} disabled={running} onClick={() => { setSelectedAssets(new Set()); setSelectedShots(new Set()); }}>清空</button>
                    </span>
                </div>
                <div className="thin-scrollbar flex max-h-[60vh] min-h-[220px] flex-col gap-4 overflow-y-auto px-5 py-4">
                    {groups.map((group) => (
                        <section key={`${group.target}:${group.items[0]?.groupId}`} className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                <span className="font-medium tracking-[0.12em] uppercase">{group.label}</span>
                                <span>{group.items.length} 项</span>
                                <span>· 已完成 {group.items.filter((item) => item.status === "done").length}</span>
                                <button type="button" className="ml-auto rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-40" style={{ borderColor: theme.node.stroke }} disabled={running} onClick={() => selectGroup(group.items)}>选本组</button>
                            </div>
                            {group.items.map((item) => {
                                const checked = item.target === "asset" ? selectedAssets.has(item.id) : selectedShots.has(item.id);
                                const current = item.target === "asset"
                                    ? assetState.running && assetState.currentNodeId === item.id
                                    : shotBatch.running && shotBatch.currentShotId === item.id;
                                return (
                                    <div key={`${item.target}:${item.id}`} className="flex items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: checked || current ? theme.canvas.selectionStroke : theme.node.stroke, background: checked ? theme.canvas.selectionSoft : theme.node.fill }}>
                                        <input type="checkbox" className="mt-1" checked={checked} disabled={running || !item.canStart} onChange={() => toggle(item)} aria-label={`选择${item.target === "asset" ? "资产" : "镜头"} ${item.title}`} />
                                        {item.target === "asset" ? <FilmAssetThumbnail asset={item.asset} className="h-9 w-9 shrink-0 rounded-md" /> : null}
                                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                                            <span className="flex flex-wrap items-center gap-1.5">
                                                <span className="truncate text-xs font-medium">{item.title}</span>
                                                <StatusBadge theme={theme} status={item.status} />
                                                {item.reason && item.status !== "done" ? <span className="truncate text-[10px]" style={{ color: item.status === "failed" ? canvasStatusColors.error : theme.node.muted }}>{item.reason}</span> : null}
                                            </span>
                                            <span className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: theme.node.muted }}>
                                                <span className="truncate">{item.subtitle}</span>
                                                {!item.canStart && item.status !== "done" ? <span>不可执行</span> : null}
                                            </span>
                                        </span>
                                        {current ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" style={{ color: theme.canvas.selectionStroke }} /> : null}
                                        <button type="button" className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => onLocate(item.target, item.id)}>定位</button>
                                    </div>
                                );
                            })}
                        </section>
                    ))}
                    {!activeItems.length ? <div className="grid min-h-[170px] place-items-center text-sm" style={{ color: theme.node.muted }}>{emptyLabel(tab)}</div> : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        {assetState.running ? <ProgressRow label="资产" current={assetState.currentIndex} total={assetState.total} title={assetState.currentName} completed={assetState.completed} failed={assetState.failed} progress={assetState.progress} theme={theme} onStop={onStopAssets} /> : null}
                        {shotBatch.running ? <ProgressRow label={shotBatch.kind === "video" ? "镜头视频" : "镜头分镜图"} current={shotBatch.currentIndex} total={shotBatch.total} title={shotBatch.currentTitle} completed={shotBatch.completed} failed={shotBatch.failed} progress={shotBatch.total ? Math.round(((shotBatch.completed + shotBatch.failed) / shotBatch.total) * 100) : 0} theme={theme} onStop={onStopShots} /> : null}
                        {!running ? <span className="text-[11px]" style={{ color: theme.node.muted }}>开始后沿用现有执行清单与队列；关闭面板不会删除队列，刷新后仍可恢复。</span> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {running ? null : <>
                            <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={!selectedStartableAssets.length} onClick={() => start({ kind: "asset", ids: selectedStartableAssets })}>生成资产 {selectedStartableAssets.length}</button>
                            <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selectedStartableShots.length} onClick={() => start({ kind: plan.shotKind, ids: selectedStartableShots })}>生成镜头 {selectedStartableShots.length} · {plan.shotKind === "image" ? "分镜图" : "视频"}</button>
                            <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>关闭</button>
                        </>}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function StatusBadge({ theme, status }: { theme: CanvasTheme; status: FilmProductionPlanItem["status"] }) {
    if (status === "done") return <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: canvasStatusColors.success }}><CheckCircle2 className="size-2.5" />已完成</span>;
    if (status === "failed") return <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}><AlertTriangle className="size-2.5" />失败</span>;
    if (status === "busy") return <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}><Loader2 className="size-2.5 animate-spin" />生成中</span>;
    if (status === "blocked") return <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>不可执行</span>;
    return <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>可执行</span>;
}

function ProgressRow({ theme, label, current, total, title, completed, failed, progress, onStop }: { theme: CanvasTheme; label: string; current: number; total: number; title: string; completed: number; failed: number; progress: number; onStop: () => void }) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>{label} {current}/{total}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px]" style={{ color: theme.node.text }}>{title || "准备中"}</span>
                <span className="mt-1 flex items-center gap-2">
                    <span className="block h-1 flex-1 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                        <span className="block h-full rounded-full transition-all" style={{ width: `${Math.max(2, progress)}%`, background: theme.canvas.selectionStroke }} />
                    </span>
                    <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>成功 {completed} · 失败 {failed}</span>
                </span>
            </span>
            <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStop}><Square className="size-3" />停止</button>
        </div>
    );
}

function toggleSet(prev: Set<string>, id: string) {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

function toggleMany(prev: Set<string>, ids: string[], add: boolean) {
    const next = new Set(prev);
    ids.forEach((id) => add ? next.add(id) : next.delete(id));
    return next;
}

function emptyLabel(tab: ProductionTab) {
    if (tab === "failed") return "没有失败项。";
    if (tab === "completed") return "还没有已完成的资产或镜头。";
    if (tab === "assets") return "还没有上下文资产，先在上下文中心新建或从母版库导入。";
    if (tab === "shots") return "还没有镜头，先在导演板或镜头表创建。";
    return "还没有可制作的资产或镜头。";
}
