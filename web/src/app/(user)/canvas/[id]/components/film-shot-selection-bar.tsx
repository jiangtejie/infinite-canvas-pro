"use client";

import { FolderPlus, ImageIcon, Video, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmShotBatchKind } from "../lib/film-studio-types";

export function FilmShotSelectionBar({ theme, count, running, onGenerate, onSaveGroup, onClear }: {
    theme: CanvasTheme;
    count: number;
    running: boolean;
    onGenerate: (kind: FilmShotBatchKind) => void;
    onSaveGroup: () => void;
    onClear: () => void;
}) {
    if (!count) return null;
    return (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 shadow-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, backdropFilter: "blur(12px)" }}>
            <span className="text-[11px] whitespace-nowrap" style={{ color: theme.node.muted }}>已选 {count} 镜</span>
            <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={running} onClick={onSaveGroup}>
                <FolderPlus className="size-3" />存为组
            </button>
            <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionSoft, color: theme.node.text }} disabled={running} onClick={() => onGenerate("image")}>
                <ImageIcon className="size-3" />批量出图
            </button>
            <button type="button" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text }} disabled={running} onClick={() => onGenerate("video")}>
                <Video className="size-3" />批量出视频
            </button>
            <button type="button" className="grid size-6 place-items-center rounded-full" style={{ color: theme.node.muted }} onClick={onClear} aria-label="清除选择"><X className="size-3.5" /></button>
        </div>
    );
}
