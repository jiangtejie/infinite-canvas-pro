"use client";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmShotBatchState } from "../lib/film-studio-types";
import { CANVAS_Z } from "../lib/canvas-layer";

export function FilmShotBatchProgress({ theme, state, onStop, bottomOffset = 96, currentProgress }: { theme: CanvasTheme; state: FilmShotBatchState; onStop: () => void; bottomOffset?: number; currentProgress?: number }) {
    if (!state.running) return null;
    const label = state.kind === "video" ? "批量生成分镜视频" : "批量生成分镜图";
    const progress = state.total ? Math.round(((state.completed + state.failed) / state.total) * 100) : 0;
    return (
        <div className="absolute left-1/2 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border p-3 shadow-xl" style={{ bottom: bottomOffset, zIndex: CANVAS_Z.hoverToolbar, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, backdropFilter: "blur(12px)" }}>
            <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums" style={{ color: theme.node.muted }}>{state.currentIndex}/{state.total}</span>
                <span className="ml-auto tabular-nums" style={{ color: theme.node.muted }}>成功 {state.completed} · 失败 {state.failed}</span>
                <button type="button" className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onClick={onStop}>停止</button>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: theme.node.fill }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: theme.canvas.selectionStroke }} />
            </div>
            {state.currentTitle ? (
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                    <span className="truncate">当前：{state.currentTitle}</span>
                    {typeof currentProgress === "number" ? <span className="shrink-0 tabular-nums">{Math.round(currentProgress)}%</span> : null}
                </div>
            ) : null}
        </div>
    );
}
