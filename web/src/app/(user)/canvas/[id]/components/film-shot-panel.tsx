"use client";

import { X } from "lucide-react";

import type { CanvasNodeData } from "../../types";
import { FilmShotEditor, type FilmShotEditorProps } from "./film-shot-editor";

export type FilmShotPanelProps = Omit<FilmShotEditorProps, "shot"> & {
    shot: CanvasNodeData | null;
    sceneLabel: string;
    canCreateShot: boolean;
    onCreateShot: () => void;
    onClose: () => void;
};

export function FilmShotPanel({ theme, shot, sceneLabel, canCreateShot, onCreateShot, onClose, ...editorProps }: FilmShotPanelProps) {
    return (
        <div className="flex h-full min-h-0 w-full flex-col border-r" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">镜头设置</div>
                    <div className="truncate text-xs" style={{ color: theme.node.muted }}>{sceneLabel}</div>
                </div>
                <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="收起镜头设置"><X className="size-4" /></button>
            </div>
            {!shot ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="text-sm" style={{ color: theme.node.muted }}>该场次还没有镜头</div>
                    <div className="flex flex-wrap justify-center gap-2">
                        {canCreateShot ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onCreateShot}>新增镜头</button> : null}
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} onClick={editorProps.onOpenScript}>打开剧本拆镜</button>
                    </div>
                </div>
            ) : (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                    <FilmShotEditor theme={theme} shot={shot} {...editorProps} />
                </div>
            )}
        </div>
    );
}
