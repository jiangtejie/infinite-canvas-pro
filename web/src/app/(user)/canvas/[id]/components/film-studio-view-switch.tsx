"use client";

import { FileText, ShieldCheck } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmStudioView } from "../lib/film-studio-types";

const VIEWS: Array<[FilmStudioView, string]> = [
    ["studio", "Studio"],
    ["table", "镜头表"],
    ["board", "故事板"],
    ["timeline", "时间轴"],
    ["graph", "画布"],
];

export function FilmStudioViewSwitch({ view, onChange, onReview, onOpenScript }: { view: FilmStudioView; onChange: (view: FilmStudioView) => void; onReview?: () => void; onOpenScript?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="absolute inset-x-0 top-16 flex h-11 items-center gap-2 border-b px-3" style={{ zIndex: CANVAS_Z.hoverToolbar, background: theme.canvas.background, borderColor: theme.node.stroke }}>
            <div className="thin-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
                {VIEWS.map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition"
                        style={{ background: view === value ? theme.toolbar.activeBg : undefined, color: view === value ? theme.node.text : theme.node.muted }}
                        onClick={() => onChange(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {onOpenScript ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs" style={{ color: theme.node.muted }} onClick={onOpenScript}>
                        <FileText className="size-3.5" />剧本
                    </button>
                ) : null}
                {onReview ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs" style={{ color: theme.node.muted }} onClick={onReview}>
                        <ShieldCheck className="size-3.5" />检查
                    </button>
                ) : null}
            </div>
        </div>
    );
}
