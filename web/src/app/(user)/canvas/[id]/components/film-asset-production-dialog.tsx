"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Square, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAssetKind } from "@/lib/film/types";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { defaultFilmAssetProductionSelection, type FilmAssetProductionPlan, type FilmAssetProductionState } from "../lib/film-asset-production";

type Props = {
    theme: CanvasTheme;
    plan: FilmAssetProductionPlan;
    state: FilmAssetProductionState;
    onStart: (nodeIds: string[]) => void;
    onStop: () => void;
    onClose: () => void;
};

const KINDS: FilmAssetKind[] = ["character", "location", "prop", "costume", "style"];

export function FilmAssetProductionDialog({ theme, plan, state, onStart, onStop, onClose }: Props) {
    const [selected, setSelected] = useState<Set<string>>(() => defaultFilmAssetProductionSelection(plan));
    const finishedRef = useRef(false);
    useEffect(() => {
        if (state.running) {
            finishedRef.current = true;
            return;
        }
        if (!finishedRef.current) return;
        finishedRef.current = false;
        const success = new Set(state.items.filter((item) => item.status === "success").map((item) => item.nodeId));
        if (!success.size) return;
        setSelected((prev) => {
            const next = new Set(prev);
            success.forEach((nodeId) => next.delete(nodeId));
            return next;
        });
    }, [state.running, state.items]);

    useEffect(() => {
        const pending = new Set(plan.items.filter((item) => item.pending).map((item) => item.nodeId));
        if (!pending.size) return;
        setSelected((prev) => {
            const next = new Set(prev);
            let changed = false;
            pending.forEach((nodeId) => { if (next.delete(nodeId)) changed = true; });
            return changed ? next : prev;
        });
    }, [plan]);

    const toggle = (nodeId: string) => {
        if (state.running) return;
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    };
    const selectMissing = () => setSelected(defaultFilmAssetProductionSelection(plan));
    const queueItem = (nodeId: string) => state.items.find((item) => item.nodeId === nodeId);
    const selectedItems = plan.items.filter((item) => selected.has(item.nodeId) && !item.pending);
    const selectedCount = selectedItems.length;
    const failedCount = state.items.filter((item) => item.status === "failed").length;

    return (
        <Modal open onCancel={state.running ? () => undefined : onClose} footer={null} closable={false} centered width="min(820px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-4" style={{ color: canvasStatusColors.success }} />资产生产队列</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>角色生成参考板，场景 / 道具 / 服装 / 风格生成概念图；按顺序执行，结果追加为新版本。</div>
                    </div>
                    {state.running ? null : <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭资产生产队列"><X className="size-4" /></button>}
                </div>
                <div className="thin-scrollbar flex max-h-[64vh] flex-col gap-3 overflow-y-auto px-5 py-4">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>{plan.totals.assets} 项资产</span>
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: canvasStatusColors.error }}>缺参考 {plan.totals.missing}</span>
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已有参考 {plan.totals.ready}</span>
                        {plan.totals.pending ? <span className="rounded-full border px-2 py-0.5" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>生成中 {plan.totals.pending}</span> : null}
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已选 {selectedCount}</span>
                        <span className="ml-auto flex items-center gap-1">
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} disabled={state.running} onClick={selectMissing}>全选缺失</button>
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} disabled={state.running} onClick={() => setSelected(new Set())}>清空</button>
                        </span>
                    </div>
                    <div className="flex flex-col gap-3">
                        {KINDS.map((kind) => {
                            const items = plan.items.filter((item) => item.kind === kind);
                            if (!items.length) return null;
                            return (
                                <section key={kind} className="flex flex-col gap-2">
                                    <div className="text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{FILM_ASSET_KIND_LABELS[kind]} · {items.length}</div>
                                    {items.map((item) => {
                                        const queued = queueItem(item.nodeId);
                                        const checked = selected.has(item.nodeId);
                                        return (
                                            <label key={item.nodeId} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: checked ? theme.canvas.selectionStroke : theme.node.stroke, background: checked ? theme.canvas.selectionSoft : theme.node.fill }}>
                                                <input type="checkbox" className="mt-1" checked={checked} disabled={state.running || item.pending} onChange={() => toggle(item.nodeId)} aria-label={`选择资产 ${item.name}`} />
                                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <span className="truncate text-xs font-medium">{item.name}</span>
                                                        <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>{item.targetLabel}</span>
                                                        <StatusBadge theme={theme} ready={item.ready} pending={item.pending} queueItem={queued} />
                                                    </span>
                                                    <span className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: theme.node.muted }}>
                                                        <span>{item.usedShots} 镜 · {item.usedScenes} 场</span>
                                                        {queued?.error ? <span style={{ color: queueErrorColor(queued.status) }}>{queued.error}</span> : null}
                                                    </span>
                                                </span>
                                                {queued?.status === "running" ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" style={{ color: theme.canvas.selectionStroke }} /> : null}
                                                {queued?.status === "success" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" style={{ color: canvasStatusColors.success }} /> : null}
                                                {queued?.status === "failed" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: canvasStatusColors.error }} /> : null}
                                            </label>
                                        );
                                    })}
                                </section>
                            );
                        })}
                    </div>
                    {!plan.items.length ? <div className="grid min-h-[140px] place-items-center text-sm" style={{ color: theme.node.muted }}>还没有影视资产，先在资产视图新建或从剧本提取。</div> : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    {state.running ? (
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>正在 {state.currentIndex}/{state.total}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px]" style={{ color: theme.node.text }}>{state.currentName}</span>
                                <span className="mt-1 block h-1 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                                    <span className="block h-full rounded-full transition-all" style={{ width: `${Math.max(2, state.progress)}%`, background: theme.canvas.selectionStroke }} />
                                </span>
                            </span>
                        </div>
                    ) : (
                        <span className="text-[11px]" style={{ color: theme.node.muted }}>
                            {state.items.length ? `上次完成 ${state.completed} 项${failedCount ? ` · 失败 ${failedCount} 项，可重新勾选后开始` : ""}` : "选择资产后开始生产"}
                        </span>
                    )}
                    <div className="flex shrink-0 gap-2">
                        {state.running ? (
                            <button type="button" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStop}><Square className="size-3" />停止</button>
                        ) : (
                            <>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>关闭</button>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selectedCount} onClick={() => onStart(selectedItems.map((item) => item.nodeId))}>开始生产 {selectedCount} 项</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function StatusBadge({ theme, ready, pending, queueItem }: { theme: CanvasTheme; ready: boolean; pending: boolean; queueItem?: { status: string; error?: string } }) {
    const status = queueItem?.status;
    if (status === "success") return <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.success, color: canvasStatusColors.success }}>完成</span>;
    if (status === "failed") return <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}>失败</span>;
    if (status === "running") return <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }}>生成中</span>;
    if (status === "pending") return <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>排队中</span>;
    if (pending) return <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>后台生成中</span>;
    return <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: ready ? theme.node.stroke : canvasStatusColors.error, color: ready ? theme.node.muted : canvasStatusColors.error }}>{ready ? "已有参考" : "缺参考"}</span>;
}

function queueErrorColor(status: string) {
    return status === "failed" ? canvasStatusColors.error : undefined;
}
