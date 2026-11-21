"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "../../types";

type FilmShotStageProps = {
    theme: CanvasTheme;
    shot: CanvasNodeData | null;
    sceneLabel: string;
    aspect: string;
    canCreateShot: boolean;
    onCreateShot: () => void;
    onLocate: (shotId: string) => void;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
};

export function FilmShotStage({ theme, shot, sceneLabel, aspect, canCreateShot, onCreateShot, onLocate, onPrev, onNext, hasPrev, hasNext }: FilmShotStageProps) {
    const filmShot = shot?.metadata?.filmShot;
    const imageUrl = filmShot?.imageUrl;
    const showImage = Boolean(imageUrl && /^(https?:|data:|blob:)/.test(imageUrl));
    const ratio = aspect.replace(":", " / ");

    return (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" style={{ background: theme.canvas.background }}>
            <div className="relative w-full max-w-[960px] overflow-hidden rounded-xl border" style={{ aspectRatio: ratio, background: theme.node.fill, borderColor: theme.node.stroke }}>
                {shot ? (
                    showImage ? (
                        <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                        <div className="flex h-full w-full flex-col justify-between gap-4 p-8 max-sm:p-5">
                            <div className="flex items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span className="truncate">{sceneLabel}</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: theme.node.stroke }}>分镜图未生成</span>
                            </div>
                            <div className="min-h-0 flex-1">
                                <div className="font-mono text-5xl font-semibold tracking-tight tabular-nums" style={{ color: theme.node.text, opacity: 0.9 }}>
                                    {filmShot?.shotNo || "—"}
                                </div>
                                <div className="mt-4 line-clamp-4 max-w-2xl text-lg leading-8" style={{ color: theme.node.text }}>
                                    {filmShot?.description || filmShot?.prompt || "还没有画面描述"}
                                </div>
                                {filmShot?.prompt ? <div className="mt-3 line-clamp-3 max-w-2xl text-sm leading-7" style={{ color: theme.node.muted }}>{filmShot.prompt}</div> : null}
                            </div>
                            <div className="flex items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span>生成分镜后在这里预览画面</span>
                                <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => onLocate(shot.id)}>在画布中定位</button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
                        <div className="text-sm" style={{ color: theme.node.muted }}>{sceneLabel}</div>
                        {canCreateShot ? <button type="button" className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={onCreateShot}>新增镜头</button> : <div className="text-xs" style={{ color: theme.node.muted }}>切换到画布视图创建场次</div>}
                    </div>
                )}
            </div>
            {shot && hasPrev ? <button type="button" onClick={onPrev} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="上一镜"><ChevronLeft className="size-5" /></button> : null}
            {shot && hasNext ? <button type="button" onClick={onNext} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="下一镜"><ChevronRight className="size-5" /></button> : null}
        </div>
    );
}
