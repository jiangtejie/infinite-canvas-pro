"use client";

import { LoaderCircle, Square } from "lucide-react";
import { Button } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { CanvasBatchGenerationState } from "../hooks/use-canvas-batch-generation";

/**
 * 批量生成进度浮层：显示当前第 N/M 张、节点标题、成功/失败数与停止全部按钮。
 */
export function CanvasBatchProgress({ state, onStop }: { state: CanvasBatchGenerationState; onStop: () => void }) {
    const theme = canvasThemes[useThemeStore((store) => store.theme)];
    if (!state.running) return null;
    const done = state.completed + state.failed;
    const percent = state.total ? Math.min(100, Math.round((done / state.total) * 100)) : 0;
    return (
        <div
            data-canvas-no-zoom
            role="status"
            aria-live="polite"
            className="pointer-events-auto absolute left-1/2 canvas-floating-batch w-[min(440px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border px-3 py-2 text-xs shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, zIndex: CANVAS_Z.menu }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
        >
            <div className="flex min-w-0 items-center gap-2">
                <LoaderCircle className="size-4 shrink-0 animate-spin" style={{ color: theme.node.activeStroke }} />
                <span className="shrink-0 font-semibold tabular-nums">批量生成 {state.currentIndex}/{state.total}</span>
                <span className="min-w-0 flex-1 truncate" style={{ color: theme.node.muted }}>{state.currentTitle || "准备中…"}</span>
                <Button danger size="small" className="!h-7 shrink-0 !rounded-lg !px-2" icon={<Square className="size-3" fill="currentColor" />} onClick={onStop}>
                    停止全部
                </Button>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${percent}%`, background: theme.node.activeStroke }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums" style={{ color: theme.node.placeholder }}>
                <span>成功 {state.completed} · 失败 {state.failed}</span>
                <span>{percent}%</span>
            </div>
        </div>
    );
}
