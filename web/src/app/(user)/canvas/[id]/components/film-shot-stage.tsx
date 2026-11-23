"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, History, Maximize2 } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { CanvasNodeData } from "../../types";
import type { FilmContextLens } from "../lib/film-context-lens";
import type { FilmVersionKind } from "../lib/film-version-room";
import { useDownloadFile } from "@/hooks/use-download-file";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { FilmShotContextPanel } from "./film-shot-context-panel";
import { FullscreenPreview } from "./fullscreen-preview";

type FilmShotStageProps = {
    theme: CanvasTheme;
    shot: CanvasNodeData;
    aspect: string;
    onLocate: (shotId: string) => void;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
    imageGenerating: boolean;
    imageError: string | null;
    canGenerateImage: boolean;
    onGenerateImage: (shotId: string) => void;
    onStopImage: (shotId: string) => void;
    videoGenerating: boolean;
    videoError: string | null;
    canGenerateVideo: boolean;
    onGenerateVideo: (shotId: string) => void;
    onStopVideo: (shotId: string) => void;
    generationInPanel: boolean;
    contextLenses: { image: FilmContextLens | null; video: FilmContextLens | null };
    onCompareVersions: (shotId: string, kind: FilmVersionKind) => void;
};

export function FilmShotStage({ theme, shot, aspect, onLocate, onPrev, onNext, hasPrev, hasNext, imageGenerating, imageError, canGenerateImage, onGenerateImage, onStopImage, videoGenerating, videoError, canGenerateVideo, onGenerateVideo, onStopVideo, generationInPanel, contextLenses, onCompareVersions }: FilmShotStageProps) {
    const filmShot = shot.metadata?.filmShot;
    const imageSrc = useResolvedMediaSrc(filmShot?.imageUrl, filmShot?.storageKey);
    const videoSrc = useResolvedMediaSrc(filmShot?.videoUrl, filmShot?.videoStorageKey, "media");
    const [media, setMedia] = useState<"image" | "video">("image");
    const stageRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState<{ width: number; height: number } | null>(null);
    useEffect(() => {
        setMedia(videoSrc ? "video" : "image");
    }, [shot.id, videoSrc]);
    const [aspectWidth, aspectHeight] = aspect.split(":").map(Number);
    const ratio = aspectWidth > 0 && aspectHeight > 0 ? aspectWidth / aspectHeight : 16 / 9;
    useLayoutEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const update = () => {
            const rect = stage.getBoundingClientRect();
            const width = Math.min(960, Math.max(0, rect.width - 48), Math.max(0, rect.height - 48) * ratio);
            const height = width / ratio;
            setBox((current) => current && Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height });
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(stage);
        return () => observer.disconnect();
    }, [ratio]);
    const statusLabel = imageSrc ? "已生成" : imageGenerating ? "生成中…" : imageError ? "生成失败" : "分镜图未生成";
    const showVideo = media === "video" && Boolean(videoSrc);
    const download = useDownloadFile();
    const [fullscreen, setFullscreen] = useState(false);
    const [contextOpen, setContextOpen] = useState(false);
    const versions = (showVideo ? filmShot?.videoVersions : filmShot?.imageVersions) ?? [];
    const currentVersionUrl = showVideo ? filmShot?.videoUrl : filmShot?.imageUrl;
    const currentVersionStorageKey = showVideo ? filmShot?.videoStorageKey : filmShot?.storageKey;
    const activeVersion = versions.find((version) => (currentVersionUrl && version.url === currentVersionUrl) || (currentVersionStorageKey && version.storageKey === currentVersionStorageKey)) ?? versions.at(-1);
    const activeVersionIndex = activeVersion ? versions.indexOf(activeVersion) : -1;
    const downloadCurrent = () => {
        const src = showVideo ? videoSrc : imageSrc;
        if (!src) return;
        download(src, `${filmShot?.shotNo || "shot"}-${showVideo ? "video.mp4" : "image.png"}`);
    };
    useEffect(() => {
        setFullscreen(false);
    }, [shot.id, showVideo]);

    return (
        <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6" style={{ background: theme.canvas.background }}>
            <div className="relative overflow-hidden rounded-xl border" style={{ width: box ? box.width : "min(960px, 100%)", height: box?.height, aspectRatio: box ? undefined : `${aspectWidth || 16} / ${aspectHeight || 9}`, background: theme.node.fill, borderColor: theme.node.stroke }}>
                {showVideo ? (
                    <video src={videoSrc} controls playsInline className="h-full w-full object-contain" />
                ) : imageSrc ? (
                    <img src={imageSrc} alt="" className="h-full w-full object-contain" />
                ) : (
                    <div className="flex h-full w-full flex-col justify-between gap-4 p-8 max-sm:p-5">
                        <div className="flex justify-end text-xs" style={{ color: theme.node.muted }}>
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
                                {!generationInPanel ? (imageGenerating ? (
                                    <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => onStopImage(shot.id)}>停止</button>
                                ) : (
                                    <button type="button" className="rounded-full border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!canGenerateImage} onClick={() => onGenerateImage(shot.id)}>{imageError ? "重试生成" : "生成分镜图"}</button>
                                )) : null}
                                <button type="button" className="rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.panel }} onClick={() => onLocate(shot.id)}>在导演板中定位</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {(imageSrc || videoSrc) ? (
                <div className="absolute left-4 top-4 flex items-center gap-1 rounded-full border p-1" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                    <button type="button" className="grid size-8 place-items-center rounded-full" style={{ color: theme.node.muted }} onClick={downloadCurrent} aria-label="下载当前媒体"><Download className="size-4" /></button>
                    {!showVideo ? <button type="button" className="grid size-8 place-items-center rounded-full" style={{ color: theme.node.muted }} onClick={() => setFullscreen(true)} aria-label="全屏查看"><Maximize2 className="size-4" /></button> : null}
                </div>
            ) : null}
            <div className="absolute right-4 top-4 flex items-center gap-1">
                {imageSrc && videoSrc ? (
                    <div className="flex items-center gap-1 rounded-full border p-1" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                        <button type="button" className="rounded-full px-2.5 py-1 text-xs" style={{ background: media === "image" ? theme.toolbar.activeBg : undefined, color: theme.node.text }} onClick={() => setMedia("image")}>分镜图</button>
                        <button type="button" className="rounded-full px-2.5 py-1 text-xs" style={{ background: media === "video" ? theme.toolbar.activeBg : undefined, color: theme.node.text }} onClick={() => setMedia("video")}>视频</button>
                    </div>
                ) : null}
                <button type="button" className="grid size-9 place-items-center rounded-full border" style={{ borderColor: contextOpen ? theme.canvas.selectionStroke : theme.node.stroke, background: contextOpen ? theme.canvas.selectionSoft : theme.toolbar.panel, color: theme.node.text }} onClick={() => setContextOpen((value) => !value)} aria-label={contextOpen ? "关闭生成信息" : "打开生成信息"} aria-expanded={contextOpen} title="生成信息">
                    <History className="size-4" />
                </button>
            </div>
            {contextOpen ? (
                <aside className="absolute bottom-4 right-4 top-16 z-20 w-[min(320px,calc(100%-2rem))] overflow-hidden rounded-xl border shadow-xl" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, backdropFilter: "blur(14px)" }}>
                    <FilmShotContextPanel theme={theme} filmShot={filmShot} media={showVideo ? "video" : "image"} preview={showVideo ? contextLenses.video : contextLenses.image} onClose={() => setContextOpen(false)} />
                </aside>
            ) : null}
            {!generationInPanel && !videoSrc && (videoGenerating || videoError) ? (
                <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: videoError ? canvasStatusColors.error : theme.node.stroke, background: theme.toolbar.panel, color: videoError ? canvasStatusColors.error : theme.node.text }}>
                    <span className="truncate">{videoGenerating ? "正在生成视频…" : videoError}</span>
                    {videoGenerating ? (
                        <button type="button" className="shrink-0" onClick={() => onStopVideo(shot.id)}>停止</button>
                    ) : (
                        <button type="button" className="shrink-0 disabled:opacity-40" disabled={!canGenerateVideo} onClick={() => onGenerateVideo(shot.id)}>重试</button>
                    )}
                </div>
            ) : null}
            {versions.length ? (
                <button type="button" className="absolute bottom-4 left-4 inline-flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-1 rounded-full border px-2.5 py-1 text-[10px]" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} onClick={() => onCompareVersions(shot.id, showVideo ? "video" : "image")} title="打开版本评审">
                    <History className="size-3" style={{ color: theme.node.muted }} />
                    <span>{activeVersionIndex >= 0 ? `当前 v${activeVersionIndex + 1}` : "当前版本"}</span>
                    <span style={{ color: theme.node.muted }}>· {versions.length} 个版本 · 版本评审</span>
                </button>
            ) : null}
            {fullscreen && (imageSrc || videoSrc) ? (
                <FullscreenPreview
                    key={`${shot.id}:${showVideo ? "video" : "image"}`}
                    src={showVideo ? videoSrc : imageSrc}
                    alt={filmShot?.description || `${filmShot?.shotNo || "镜头"} 预览`}
                    isVideo={showVideo}
                    onDownload={downloadCurrent}
                    onClose={() => setFullscreen(false)}
                />
            ) : null}
            {hasPrev ? <button type="button" onClick={onPrev} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="上一镜"><ChevronLeft className="size-5" /></button> : null}
            {hasNext ? <button type="button" onClick={onNext} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} aria-label="下一镜"><ChevronRight className="size-5" /></button> : null}
        </div>
    );
}
