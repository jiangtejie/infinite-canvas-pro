"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clapperboard, Film, Loader2, Square, Video, X } from "lucide-react";
import { Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { defaultFilmShotProductionSelection, planFilmShotProduction, type FilmShotProductionItem } from "../lib/film-shot-production";
import type { FilmShotBatchKind, FilmShotBatchState, FilmShotEntry } from "../lib/film-studio-types";

type Props = {
    theme: CanvasTheme;
    shots: FilmShotEntry[];
    batch: FilmShotBatchState;
    onStart: (shotIds: string[], kind: FilmShotBatchKind) => void;
    onStop: () => void;
    onClose: () => void;
};

export function FilmShotProductionDialog({ theme, shots, batch, onStart, onStop, onClose }: Props) {
    const [kind, setKind] = useState<FilmShotBatchKind>(() => batch.running && batch.kind ? batch.kind : "image");
    const plan = useMemo(() => planFilmShotProduction(shots, kind), [kind, shots]);
    const [selected, setSelected] = useState<Set<string>>(() => defaultFilmShotProductionSelection(plan));
    const wasRunningRef = useRef(false);
    const pendingCleanupRef = useRef(false);

    useEffect(() => {
        if (batch.running) {
            wasRunningRef.current = true;
            return;
        }
        if (wasRunningRef.current) {
            wasRunningRef.current = false;
            pendingCleanupRef.current = true;
        }
    }, [batch.running]);

    useEffect(() => {
        if (batch.running || !pendingCleanupRef.current) return;
        const done = new Set(plan.items.filter((item) => item.hasMedia).map((item) => item.shotId));
        if (done.size) {
            setSelected((prev) => {
                const next = new Set(prev);
                done.forEach((shotId) => next.delete(shotId));
                return next;
            });
        }
        pendingCleanupRef.current = false;
    }, [batch.running, plan]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const key = event.key.toLowerCase();
            if (!["g", "v", "s", "p", "c", "m", "1", "2", "3", "4", "5", "6", "arrowleft", "arrowright"].includes(key)) return;
            event.stopPropagation();
            if (key.startsWith("arrow")) event.preventDefault();
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, []);

    const changeKind = (next: FilmShotBatchKind) => {
        if (batch.running || next === kind) return;
        setKind(next);
        setSelected(defaultFilmShotProductionSelection(planFilmShotProduction(shots, next)));
    };
    const toggle = (item: FilmShotProductionItem) => {
        if (batch.running || !item.canGenerate) return;
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(item.shotId)) next.delete(item.shotId);
            else next.add(item.shotId);
            return next;
        });
    };
    const progress = batch.total ? Math.min(100, Math.round(((batch.completed + batch.failed) / batch.total) * 100)) : 0;
    const kindLabel = kind === "image" ? "分镜图" : "视频";

    return (
        <Modal open onCancel={onClose} footer={null} closable={false} centered width="min(860px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-base font-semibold"><Clapperboard className="size-4" style={{ color: theme.canvas.selectionStroke }} />镜头制作队列</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>按场景查看全片镜头的分镜图 / 视频状态；勾选后复用现有批量生成与执行清单确认。</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭镜头制作队列"><X className="size-4" /></button>
                </div>
                <div className="thin-scrollbar flex max-h-[62vh] flex-col gap-3 overflow-y-auto px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                            {(["image", "video"] as const).map((value) => (
                                <button key={value} type="button" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] disabled:opacity-40" style={{ background: kind === value ? theme.canvas.selectionSoft : undefined, color: kind === value ? theme.node.text : theme.node.muted }} disabled={batch.running} onClick={() => changeKind(value)}>
                                    {value === "image" ? <Film className="size-3" /> : <Video className="size-3" />}{value === "image" ? "分镜图" : "视频"}
                                </button>
                            ))}
                        </div>
                        {[`${plan.totals.shots} 镜`, `待生成 ${plan.totals.ready}`, `已生成 ${plan.totals.done}`, `不可生成 ${plan.totals.blocked}`].map((label) => (
                            <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                        ))}
                        <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>已选 {selected.size}</span>
                        <span className="ml-auto flex items-center gap-1">
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} disabled={batch.running} onClick={() => setSelected(defaultFilmShotProductionSelection(plan))}>全选待生成</button>
                            <button type="button" className="rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} disabled={batch.running} onClick={() => setSelected(new Set())}>清空</button>
                        </span>
                    </div>
                    <div className="flex flex-col gap-3">
                        {plan.groups.map((group) => (
                            <section key={group.sceneId} className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                                    <span className="font-medium tracking-[0.12em] uppercase">{group.label}</span>
                                    <span>{group.items.length} 镜 · 已完成 {group.items.filter((item) => item.hasMedia).length}</span>
                                </div>
                                {group.items.map((item) => {
                                    const checked = selected.has(item.shotId);
                                    const running = batch.running && batch.kind === kind && batch.currentShotId === item.shotId;
                                    return (
                                        <label key={item.shotId} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: running ? theme.canvas.selectionStroke : checked ? theme.canvas.selectionStroke : theme.node.stroke, background: checked ? theme.canvas.selectionSoft : theme.node.fill }}>
                                            <input type="checkbox" className="mt-1" checked={checked} disabled={batch.running || !item.canGenerate} onChange={() => toggle(item)} aria-label={`选择镜头 ${item.shotNo}`} />
                                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                <span className="flex flex-wrap items-center gap-1.5">
                                                    <span className="font-mono text-xs tabular-nums">{item.shotNo}</span>
                                                    <ShotStatus theme={theme} item={item} running={running} />
                                                    {item.error ? <span className="truncate text-[10px]" style={{ color: canvasStatusColors.error }}>{item.error}</span> : null}
                                                </span>
                                                <span className="truncate text-[11px]" style={{ color: theme.node.muted }}>{item.description || "没有画面描述"}</span>
                                            </span>
                                            {running ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" style={{ color: theme.canvas.selectionStroke }} /> : null}
                                        </label>
                                    );
                                })}
                            </section>
                        ))}
                    </div>
                    {!plan.items.length ? <div className="grid min-h-[140px] place-items-center text-sm" style={{ color: theme.node.muted }}>还没有镜头，先去 Studio 或画布创建。</div> : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    {batch.running ? (
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>正在 {batch.currentIndex}/{batch.total}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px]" style={{ color: theme.node.text }}>{batch.currentTitle}</span>
                                <span className="mt-1 block h-1 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                                    <span className="block h-full rounded-full transition-all" style={{ width: `${Math.max(2, progress)}%`, background: theme.canvas.selectionStroke }} />
                                </span>
                            </span>
                            <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>{batch.kind === "image" ? "分镜图" : "视频"} · 成功 {batch.completed} · 失败 {batch.failed}</span>
                        </div>
                    ) : (
                        <span className="text-[11px]" style={{ color: theme.node.muted }}>开始后会先弹出执行清单确认；关闭本面板不会中断已开始的批量生成。</span>
                    )}
                    <div className="flex shrink-0 gap-2">
                        {batch.running ? (
                            <button type="button" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onStop}><Square className="size-3" />停止</button>
                        ) : (
                            <>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>关闭</button>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selected.size} onClick={() => onStart([...selected], kind)}>生成队列 {selected.size} 镜{kindLabel ? ` · ${kindLabel}` : ""}</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function ShotStatus({ theme, item, running }: { theme: CanvasTheme; item: FilmShotProductionItem; running: boolean }) {
    if (running) return <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text }}>生成中</span>;
    if (item.status === "done") return <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: canvasStatusColors.success }}><CheckCircle2 className="size-2.5" />已生成</span>;
    if (item.status === "failed") return <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.error, color: canvasStatusColors.error }}><AlertTriangle className="size-2.5" />上次失败</span>;
    if (item.status === "busy") return <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>生成中</span>;
    if (item.status === "no-text") return <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>缺描述</span>;
    if (item.status === "frames") return <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: canvasStatusColors.loading, color: canvasStatusColors.loading }}>缺首帧</span>;
    return <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>可生成</span>;
}
