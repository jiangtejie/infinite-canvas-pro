"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clapperboard, Crosshair, Film, Loader2, Square, Video, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FilmAssetThumbnail } from "@/app/(user)/film/components/film-asset-thumbnail";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { FilmAssetProductionState } from "../lib/film-asset-production";
import type { FilmProductionKind, FilmProductionPlan, FilmProductionPlanItem, FilmProductionAssetItem, FilmProductionShotItem } from "../lib/film-production-plan";
import type { FilmShotBatchKind, FilmShotBatchState } from "../lib/film-studio-types";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { CANVAS_DIALOG_SIZE } from "../../utils/canvas-dialog-size";
import { FilmStatusDot } from "./film-status-dot";

type ProductionTab = "all" | "assets" | "shots" | "failed" | "completed";
type StartTarget = { kind: FilmProductionKind; ids: string[] };

const TABS: Array<{ value: ProductionTab; label: string }> = [
    { value: "all", label: "全部" },
    { value: "assets", label: "资产" },
    { value: "shots", label: "镜头" },
    { value: "failed", label: "失败" },
    { value: "completed", label: "已完成" },
];

type ProductionGroup = { target: "asset" | "shot"; label: string; items: FilmProductionPlanItem[] };

const groupKeyOf = (group: ProductionGroup) => `${group.target}:${group.items[0]?.groupId ?? ""}`;

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
    const [groupFilter, setGroupFilter] = useState<string | null>(null);
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
    const groups = useMemo<ProductionGroup[]>(() => {
        const map = new Map<string, ProductionGroup>();
        activeItems.forEach((item) => {
            const key = `${item.target}:${item.groupId}`;
            const current = map.get(key);
            if (current) current.items.push(item);
            else map.set(key, { target: item.target, label: item.target === "asset" ? `资产 · ${item.group}` : item.group, items: [item] });
        });
        return [...map.values()];
    }, [activeItems]);
    const activeGroupKey = groupFilter && groups.some((group) => groupKeyOf(group) === groupFilter) ? groupFilter : null;
    const visibleGroups = activeGroupKey ? groups.filter((group) => groupKeyOf(group) === activeGroupKey) : groups;
    const selectedStartableAssets = plan.assets.filter((item) => selectedAssets.has(item.id) && item.canStart).map((item) => item.id);
    const selectedStartableShots = plan.shots.filter((item) => selectedShots.has(item.id) && item.canStart).map((item) => item.id);
    const selectableItems = activeItems.filter((item) => item.canStart && (tab === "failed" || item.status !== "done"));
    const allSelectable = selectableItems.length > 0 && selectableItems.every((item) => item.target === "asset" ? selectedAssets.has(item.id) : selectedShots.has(item.id));
    const tabCount = (value: ProductionTab) => value === "all" ? plan.assets.length + plan.shots.length : value === "assets" ? plan.assets.length : value === "shots" ? plan.shots.length : value === "failed" ? plan.failures.length : plan.completed.length;

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
    const changeTab = (value: ProductionTab) => {
        setTab(value);
        setGroupFilter(null);
    };

    return (
        <Modal open onCancel={running ? () => undefined : onClose} footer={null} closable={false} centered width={CANVAS_DIALOG_SIZE.xl} mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex max-h-[90vh] flex-col" style={{ color: theme.node.text }}>
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
                <div className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden" style={{ borderColor: theme.node.stroke }}>
                    {TABS.map((entry) => <button key={entry.value} type="button" className="shrink-0 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: tab === entry.value ? theme.canvas.selectionStroke : theme.node.stroke, background: tab === entry.value ? theme.canvas.selectionSoft : undefined, color: tab === entry.value ? theme.node.text : theme.node.muted }} onClick={() => changeTab(entry.value)}>{entry.label} {tabCount(entry.value)}</button>)}
                    {groups.length ? (
                        <select className="ml-1 shrink-0 rounded-full border bg-transparent px-2 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }} value={activeGroupKey ?? ""} onChange={(event) => setGroupFilter(event.target.value || null)} aria-label="筛选分组">
                            <option value="">全部分组</option>
                            {groups.map((group) => <option key={groupKeyOf(group)} value={groupKeyOf(group)}>{group.label}</option>)}
                        </select>
                    ) : null}
                </div>
                <div className="flex min-h-0 flex-1">
                    <aside className="thin-scrollbar hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3 md:flex" style={{ borderColor: theme.node.stroke }}>
                        <div className="flex flex-col gap-0.5">
                            {TABS.map((entry) => (
                                <button key={entry.value} type="button" className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs" style={{ background: tab === entry.value ? theme.canvas.selectionSoft : undefined, color: tab === entry.value ? theme.node.text : theme.node.muted }} onClick={() => changeTab(entry.value)}>
                                    <span>{entry.label}</span>
                                    <span className="font-mono text-[10px]">{tabCount(entry.value)}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="px-2.5 text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>分组</span>
                            {groups.map((group) => {
                                const key = groupKeyOf(group);
                                const active = key === activeGroupKey;
                                return <button key={key} type="button" className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px]" style={{ background: active ? theme.canvas.selectionSoft : undefined, color: active ? theme.node.text : theme.node.muted }} onClick={() => setGroupFilter(active ? null : key)}>
                                    <span className="truncate">{group.label}</span>
                                    <span className="shrink-0 font-mono text-[10px]">{group.items.length}</span>
                                </button>;
                            })}
                            {!groups.length ? <span className="px-2.5 text-[10px]" style={{ color: theme.node.muted }}>当前视图没有分组</span> : null}
                        </div>
                    </aside>
                    <main className="flex min-h-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2" style={{ borderColor: theme.node.stroke }}>
                            {plan.queue.assetRemaining || plan.queue.shotRemaining ? <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>续跑：资产 {plan.queue.assetRemaining} · 镜头 {plan.queue.shotRemaining}</span> : null}
                            {plan.warnings ? <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}><AlertTriangle className="size-2.5" />编译警告 {plan.warnings}</span> : null}
                            <span className="ml-auto flex flex-wrap items-center gap-1 text-[10px]" style={{ color: theme.node.muted }}>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>选中资产 {selectedAssets.size} · 镜头 {selectedShots.size}</span>
                                <button type="button" className="rounded-full border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: theme.node.stroke }} disabled={running || !selectableItems.length} onClick={toggleAll}>{allSelectable ? "取消全选" : "全选可执行"}</button>
                                <button type="button" className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }} disabled={running} onClick={() => { setSelectedAssets(new Set()); setSelectedShots(new Set()); }}>清空</button>
                            </span>
                        </div>
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
                            <div className="flex flex-col gap-5">
                                {visibleGroups.map((group) => (
                                    <section key={groupKeyOf(group)} className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                            <span className="font-medium tracking-[0.12em] uppercase">{group.label}</span>
                                            <span>{group.items.length} 项</span>
                                            <span>· 已完成 {group.items.filter((item) => item.status === "done").length}</span>
                                            <button type="button" className="ml-auto rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-40" style={{ borderColor: theme.node.stroke }} disabled={running} onClick={() => selectGroup(group.items)}>选本组</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                            {group.items.map((item) => {
                                                const checked = item.target === "asset" ? selectedAssets.has(item.id) : selectedShots.has(item.id);
                                                const current = item.target === "asset"
                                                    ? assetState.running && assetState.currentNodeId === item.id
                                                    : shotBatch.running && shotBatch.currentShotId === item.id;
                                                return item.target === "asset"
                                                    ? <ProductionAssetCard key={`asset:${item.id}`} theme={theme} item={item} checked={checked} running={running} current={current} onToggle={toggle} onLocate={() => onLocate(item.target, item.id)} />
                                                    : <ProductionShotCard key={`shot:${item.id}`} theme={theme} item={item} checked={checked} running={running} current={current} onToggle={toggle} onLocate={() => onLocate(item.target, item.id)} />;
                                            })}
                                        </div>
                                    </section>
                                ))}
                                {!visibleGroups.length ? <div className="grid min-h-[200px] place-items-center text-sm" style={{ color: theme.node.muted }}>{emptyLabel(tab)}</div> : null}
                            </div>
                        </div>
                    </main>
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

function ProductionAssetCard({ theme, item, checked, running, current, onToggle, onLocate }: { theme: CanvasTheme; item: FilmProductionAssetItem; checked: boolean; running: boolean; current: boolean; onToggle: (item: FilmProductionPlanItem) => void; onLocate: () => void }) {
    const disabled = running || !item.canStart;
    return (
        <div role="button" tabIndex={disabled ? -1 : 0} aria-pressed={checked} aria-label={`选择资产 ${item.title}`} className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border text-left transition ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`} style={{ borderColor: checked ? theme.canvas.selectionStroke : theme.node.stroke, background: theme.node.fill }} onClick={() => !disabled && onToggle(item)} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onToggle(item); } }}>
            <span className="relative block aspect-square w-full overflow-hidden" style={{ background: theme.node.panel }}>
                <FilmAssetThumbnail asset={item.asset} className="absolute inset-0 h-full w-full" />
                <CardSelection checked={checked} theme={theme} />
                <button type="button" className="absolute right-2 top-2 grid size-7 place-items-center rounded-full opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100" style={{ background: "rgba(0,0,0,0.42)", color: "#fff" }} onClick={(event) => { event.stopPropagation(); onLocate(); }} aria-label={`定位 ${item.title}`}><Crosshair className="size-3.5" /></button>
                {current ? <span className="absolute inset-0 grid place-items-center" style={{ background: "rgba(0,0,0,0.35)" }}><Loader2 className="size-5 animate-spin text-white" /></span> : null}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{item.title}</span>
                    <FilmStatusDot theme={theme} tone={item.status} />
                </span>
                <span className="truncate text-[10px]" style={{ color: theme.node.muted }}>{item.subtitle}</span>
                {item.reason && item.status !== "done" ? <span className="truncate text-[10px]" style={{ color: item.status === "failed" ? canvasStatusColors.error : theme.node.muted }}>{item.reason}</span> : null}
            </span>
        </div>
    );
}

function ProductionShotCard({ theme, item, checked, running, current, onToggle, onLocate }: { theme: CanvasTheme; item: FilmProductionShotItem; checked: boolean; running: boolean; current: boolean; onToggle: (item: FilmProductionPlanItem) => void; onLocate: () => void }) {
    const disabled = running || !item.canStart;
    const mediaSrc = useResolvedMediaSrc(item.media?.url, item.media?.storageKey, item.kind === "video" ? "media" : "image");
    return (
        <div role="button" tabIndex={disabled ? -1 : 0} aria-pressed={checked} aria-label={`选择镜头 ${item.title}`} className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border text-left transition ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`} style={{ borderColor: checked ? theme.canvas.selectionStroke : theme.node.stroke, background: theme.node.fill }} onClick={() => !disabled && onToggle(item)} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onToggle(item); } }}>
            <span className="relative block aspect-video w-full overflow-hidden" style={{ background: theme.node.panel }}>
                {mediaSrc ? (item.kind === "video"
                    ? <video src={mediaSrc} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                    : <img src={mediaSrc} alt={item.title} className="absolute inset-0 h-full w-full object-cover" />)
                    : <span className="absolute inset-0 grid place-items-center text-[10px]" style={{ color: theme.node.placeholder }}>{item.kind === "video" ? "无视频" : "无分镜图"}</span>}
                <CardSelection checked={checked} theme={theme} />
                <button type="button" className="absolute right-2 top-2 grid size-7 place-items-center rounded-full opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100" style={{ background: "rgba(0,0,0,0.42)", color: "#fff" }} onClick={(event) => { event.stopPropagation(); onLocate(); }} aria-label={`定位镜头 ${item.title}`}><Crosshair className="size-3.5" /></button>
                {current ? <span className="absolute inset-0 grid place-items-center" style={{ background: "rgba(0,0,0,0.35)" }}><Loader2 className="size-5 animate-spin text-white" /></span> : null}
                <span className="absolute bottom-1.5 left-2 rounded px-1 py-0.5 font-mono text-[10px]" style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}>{item.title}</span>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-1.5">
                    <FilmStatusDot theme={theme} tone={item.status} />
                    {item.reason && item.status !== "done" ? <span className="ml-auto truncate text-[10px]" style={{ color: item.status === "failed" ? canvasStatusColors.error : theme.node.muted }}>{item.reason}</span> : null}
                </span>
                <span className="truncate text-[10px]" style={{ color: theme.node.muted }}>{item.subtitle}</span>
            </span>
        </div>
    );
}

function CardSelection({ checked, theme }: { checked: boolean; theme: CanvasTheme }) {
    return <span className="absolute left-2 top-2 grid size-5 place-items-center rounded-full border transition" style={{ borderColor: checked ? theme.canvas.selectionStroke : "rgba(255,255,255,0.65)", background: checked ? theme.canvas.selectionStroke : "rgba(0,0,0,0.32)" }}>{checked ? <Check className="size-3 text-white" /> : null}</span>;
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
