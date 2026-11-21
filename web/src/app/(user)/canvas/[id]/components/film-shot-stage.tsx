"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { CanvasNodeData } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";

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
    imageGenerating: boolean;
    imageError: string | null;
    canGenerateImage: boolean;
    onGenerateImage: () => void;
    onStopImage: () => void;
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: () => void;
    onStopVideo: () => void;
};

export function FilmShotStage({ theme, shot, sceneLabel, aspect, canCreateShot, onCreateShot, onLocate, onPrev, onNext, hasPrev, hasNext, imageGenerating, imageError, canGenerateImage, onGenerateImage, onStopImage, videoGenerating, videoError, canGenerateVideo, onGenerateVideo, onStopVideo }: FilmShotStageProps) {
    const filmShot = shot?.metadata?.filmShot;
    const imageSrc = useResolvedMediaSrc(filmShot?.imageUrl, filmShot?.storageKey);
    const videoSrc = useResolvedMediaSrc(filmShot?.videoUrl, filmShot?.videoStorageKey, "media");
    const [media, setMedia] = useState<"image" | "video">("image");
    useEffect(() => {
        setMedia(videoSrc ? "video" : "image");
    }, [shot?.id, videoSrc]);
    const ratio = aspect.replace(":", " / ");
    const statusLabel = imageSrc ? "已生成" : imageGenerating ? "生成中…" : imageError ? "生成失败" : "分镜图未生成";
    const showVideo = media === "video" && Boolean(videoSrc);

    return (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" style={{ background: theme.canvas.background }}>
            <div className="relative w-full max-w-[960px] overflow-hidden rounded-xl border" style={{ aspectRatio: ratio, background: theme.node.fill, borderColor: theme.node.stroke }}>
                {shot ? (
                    showVideo ? (
                        <video src={videoSrc} controls playsInline className="h-full w-full object-contain" />
                    ) : imageSrc ? (
                        <img src={imageSrc} alt="" className="h-full w-full object-contain" />
                    ) : (
                        <div className="flex h-full w-full flex-col justify-between gap-4 p-8 max-sm:p-5">
                            <div className="flex items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span className="truncate">{sceneLabel}</span>
                                <span className="rounded-full border px-2 py-0.5" style={{ borderColor: imageError ? canvasStatusColors.error : theme.node.stroke, color: imageError ? canvasStatusColors.error : theme.node.muted }}>{statusLabel}</span>
                            </div>
                            <div className="min-h-0 flex-1">
                                <div className="font-mono text-5xl font-semibold tracking-tight tabular-nums" style={{ color: theme.node.text, opacity: 0.9 }}>
                                    {filmShot?.shotNo || "—"}
                                </div>
                                <div className="mt-4 line-clamp-4 max-w-2xl text-lg leading-8" style={{ color: theme.node.text }}>
                                    {filmShot?.description || filmShot?.prompt || "还没有画面描述"}
                                </div>
                                {filmShot?.prompt ? <div className="mt-3 line-clamp-3 max-w-2xl text-sm leading-7" style={{ color: theme.node.muted }}>{filmShot.prompt}</div> : null}
                                {imageError ? <div className="mt-3 max-w-2xl text-sm" style={{ color: canvasStatusColors.error }}>{imageError}</div> : null}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: theme.node.muted }}>
                                <span>{imageGenerating ? "正在生成分镜图…" : "生成分镜后在这里预览画面"}</span>
                                <div className="flex items-center gap-2">
                                    {imageGenerating ? (
                                        <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={onStopImage}>停止</button>
                                    ) : (
                                        <button type="button" className="rounded-full border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateImage} onClick={onGenerateImage}>{imageError ? "重试生成" : "生成分镜图"}</button>
                                    )}
                                    <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => onLocate(shot.id)}>在画布中定位</button>
                                </div>
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
            {shot && imageSrc && videoSrc ? (
                <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full border p-1" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                    <button type="button" className="rounded-full px-2.5 py-1 text-xs" style={{ background: media === "image" ? theme.toolbar.activeBg : undefined, color: theme.node.text }} onClick={() => setMedia("image")}>分镜图</button>
                    <button type="button" className="rounded-full px-2.5 py-1 text-xs" style={{ background: media === "video" ? theme.toolbar.activeBg : undefined, color: theme.node.text }} onClick={() => setMedia("video")}>视频</button>
                </div>
            ) : null}
            {shot && !videoSrc && (videoGenerating || videoError) ? (
                <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: videoError ? canvasStatusColors.error : theme.node.stroke, background: theme.toolbar.panel, color: videoError ? canvasStatusColors.error : theme.node.text }}>
                    <span className="truncate">{videoGenerating ? "正在生成视频…" : videoError}</span>
                    {videoGenerating ? (
                        <button type="button" className="shrink-0" onClick={onStopVideo}>停止</button>
                    ) : (
                        <button type="button" className="shrink-0 disabled:opacity-40" disabled={!canGenerateVideo} onClick={onGenerateVideo}>重试</button>
                    )}
                </div>
            ) : null}
            {shot && hasPrev ? <button type="button" onClick={onPrev} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="上一镜"><ChevronLeft className="size-5" /></button> : null}
            {shot && hasNext ? <button type="button" onClick={onNext} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="下一镜"><ChevronRight className="size-5" /></button> : null}
        </div>
    );
}
