"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Maximize, Pause, Play, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";

import { actualPreviewZoom, previewZoomPercent, stepPreviewZoom } from "../lib/preview-zoom";

const CanvasPanoramaViewer = dynamic(() => import("../../components/canvas-panorama-viewer"), { ssr: false, loading: () => null });

const VIDEO_PREVIEW_CONTROL_CLASS = "flex size-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10";

function formatPreviewTime(value: number) {
    if (!Number.isFinite(value)) return "0:00";
    const seconds = Math.floor(value);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function FullscreenPreview({ src, alt, isVideo, isPanorama, proxyGeneratedPanorama = false, onDownload, onClose, hasPrev, hasNext, onPrev, onNext }: { src: string; alt: string; isVideo?: boolean; isPanorama?: boolean; proxyGeneratedPanorama?: boolean; onDownload: () => void; onClose: () => void; hasPrev?: boolean; hasNext?: boolean; onPrev?: () => void; onNext?: () => void }) {
    const [zoom, setZoom] = useState<number>(1);
    const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
    const [fitWidth, setFitWidth] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [videoTime, setVideoTime] = useState(0);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [videoVolume, setVideoVolume] = useState(1);
    const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
    const imgRef = useRef<HTMLImageElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoPlayerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
        setNaturalSize(null);
        setFitWidth(0);
    }, [src]);

    const zoomIn = useCallback(() => setZoom((value) => stepPreviewZoom(value, 0.25)), []);
    const zoomOut = useCallback(() => setZoom((value) => {
        const next = stepPreviewZoom(value, -0.25);
        if (next <= 1) setPanOffset({ x: 0, y: 0 });
        return next;
    }), []);
    const fitZoom = useCallback(() => {
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
    }, []);
    const zoomActual = useCallback(() => {
        if (!fitWidth || !naturalSize) return;
        setZoom(actualPreviewZoom(fitWidth, naturalSize.width));
        setPanOffset({ x: 0, y: 0 });
    }, [fitWidth, naturalSize]);
    const zoomPercent = previewZoomPercent(fitWidth, naturalSize?.width ?? 0, zoom);

    const toggleVideoPlayback = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
    };

    useEffect(() => {
        if (!isVideo) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        videoRef.current?.focus({ preventScroll: true });
        return () => previousFocus?.focus({ preventScroll: true });
    }, [isVideo]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            } else if (event.key === "ArrowLeft" && hasPrev) {
                event.preventDefault();
                onPrev?.();
            } else if (event.key === "ArrowRight" && hasNext) {
                event.preventDefault();
                onNext?.();
            } else if (!isVideo && !isPanorama && (event.key === "+" || event.key === "=")) {
                event.preventDefault();
                zoomIn();
            } else if (!isVideo && !isPanorama && event.key === "-") {
                event.preventDefault();
                zoomOut();
            } else if (!isVideo && !isPanorama && event.key === "0") {
                event.preventDefault();
                fitZoom();
            } else if (!isVideo && !isPanorama && event.key === "1") {
                event.preventDefault();
                zoomActual();
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [fitZoom, hasNext, hasPrev, isPanorama, isVideo, onClose, onNext, onPrev, zoomActual, zoomIn, zoomOut]);

    const handleWheel = (e: WheelEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setZoom((z) => {
            const next = stepPreviewZoom(z, -e.deltaY * 0.001);
            if (next <= 1) setPanOffset({ x: 0, y: 0 });
            return next;
        });
    };

    useEffect(() => {
        const el = imgRef.current;
        if (!el) return;
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    });

    useEffect(() => {
        if (isVideo || isPanorama) return;
        const image = imgRef.current;
        if (!image) return;
        const update = () => setFitWidth(image.clientWidth);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(image);
        return () => observer.disconnect();
    }, [isPanorama, isVideo, src]);

    const handlePointerDown = (e: ReactPointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    };

    const handlePointerMove = (e: ReactPointerEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setPanOffset({
            x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
            y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
        });
    };

    const handlePointerUp = (e: ReactPointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    return (
        <div role="dialog" aria-modal="true" aria-label={alt || "媒体预览"} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm" data-canvas-no-zoom={isPanorama ? "" : undefined} onClick={onClose}>
            {hasPrev || hasNext ? (
                <>
                    <button
                        type="button"
                        disabled={!hasPrev}
                        onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute left-4 top-1/2 z-[2010] -translate-y-1/2 flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-[background-color,transform,opacity] hover:bg-white/10 hover:scale-105 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="size-6" />
                    </button>
                    <button
                        type="button"
                        disabled={!hasNext}
                        onClick={(e) => { e.stopPropagation(); onNext?.(); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute right-4 top-1/2 z-[2010] -translate-y-1/2 flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-[background-color,transform,opacity] hover:bg-white/10 hover:scale-105 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="size-6" />
                    </button>
                </>
            ) : null}
            <button
                type="button"
                aria-label="关闭预览"
                onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                }}
                className="absolute right-4 top-4 z-[2010] flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-[background-color,transform] hover:scale-105 hover:bg-white/10 active:scale-95"
            >
                <X className="size-5" />
            </button>
            {isPanorama ? (
                <div className="h-[85vh] w-[85vw] supports-[height:round(1px,1px)]:h-[round(85vh,1px)] supports-[height:round(1px,1px)]:w-[round(85vw,1px)] overflow-hidden rounded-2xl shadow-[0_24px_72px_rgba(0,0,0,0.4)]" onClick={(event) => event.stopPropagation()}>
                    <CanvasPanoramaViewer src={src} alt={alt} proxyGeneratedPanorama={proxyGeneratedPanorama} immersive />
                </div>
            ) : isVideo ? (
                <div
                    ref={videoPlayerRef}
                    className="relative flex max-h-[85vh] max-w-[85vw] items-center justify-center overflow-hidden rounded-2xl bg-black shadow-[0_24px_72px_rgba(0,0,0,0.4)] fullscreen:h-screen fullscreen:w-screen fullscreen:max-h-none fullscreen:max-w-none fullscreen:rounded-none [&:fullscreen>video]:h-screen [&:fullscreen>video]:w-screen [&:fullscreen>video]:max-h-none [&:fullscreen>video]:max-w-none"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDownCapture={(event) => {
                        if (event.code !== "Space") return;
                        event.preventDefault();
                        event.stopPropagation();
                        toggleVideoPlayback();
                    }}
                    data-canvas-no-zoom
                >
                    <video
                        ref={videoRef}
                        src={src}
                        aria-label={alt}
                        tabIndex={-1}
                        playsInline
                        preload="metadata"
                        onLoadStart={() => { setVideoDuration(0); setVideoTime(0); setIsVideoPlaying(false); }}
                        onDurationChange={(event) => setVideoDuration(event.currentTarget.duration)}
                        onTimeUpdate={(event) => setVideoTime(event.currentTarget.currentTime)}
                        onPlay={() => setIsVideoPlaying(true)}
                        onPause={() => setIsVideoPlaying(false)}
                        onVolumeChange={(event) => setVideoVolume(event.currentTarget.muted ? 0 : event.currentTarget.volume)}
                        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                        className="block max-h-[85vh] max-w-[85vw] object-contain outline-none"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-5 pb-3 pt-24">
                        <div className="mb-2 flex justify-between text-xs font-medium tabular-nums text-white">
                            <span>{formatPreviewTime(videoTime)}</span>
                            <span>{formatPreviewTime(videoDuration)}</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={videoDuration || 0}
                            step="0.01"
                            value={Math.min(videoTime, videoDuration || 0)}
                            aria-label="视频进度"
                            onChange={(event) => {
                                const time = Number(event.currentTarget.value);
                                if (videoRef.current) videoRef.current.currentTime = time;
                                setVideoTime(time);
                            }}
                            onPointerUp={() => videoRef.current?.focus({ preventScroll: true })}
                            className="pointer-events-auto block h-1 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                            style={{ background: `linear-gradient(to right, #67e8f9 ${videoDuration ? Math.min(videoTime / videoDuration, 1) * 100 : 0}%, rgba(255,255,255,0.35) 0)` }}
                        />
                        <div className="pointer-events-auto mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <button type="button" aria-label={isVideoPlaying ? "暂停" : "播放"} onPointerDown={(event) => event.preventDefault()} onClick={toggleVideoPlayback} className={VIDEO_PREVIEW_CONTROL_CLASS}>
                                    {isVideoPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
                                </button>
                                <div className="group/volume flex items-center">
                                    <button type="button" aria-label={videoVolume === 0 ? "恢复声音" : "静音"} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }} className={VIDEO_PREVIEW_CONTROL_CLASS}>
                                        {videoVolume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                                    </button>
                                    <input type="range" min={0} max={1} step="0.01" value={videoVolume} aria-label="音量" onChange={(event) => { const volume = Number(event.currentTarget.value); if (!videoRef.current) return; if (volume === 0) videoRef.current.muted = true; else { videoRef.current.volume = volume; videoRef.current.muted = false; } }} onPointerUp={() => videoRef.current?.focus({ preventScroll: true })} className="h-1 w-0 pointer-events-none cursor-pointer appearance-none rounded-full opacity-0 transition-[width,opacity] duration-200 focus-visible:outline-none group-hover/volume:mx-1 group-hover/volume:w-20 group-hover/volume:pointer-events-auto group-hover/volume:opacity-100 [&::-moz-range-thumb]:size-2 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" style={{ background: `linear-gradient(to right, white ${videoVolume * 100}%, rgba(255,255,255,0.35) 0)` }} />
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button type="button" aria-label="下载视频" onPointerDown={(event) => event.preventDefault()} onClick={onDownload} className={VIDEO_PREVIEW_CONTROL_CLASS}>
                                    <Download className="size-5" />
                                </button>
                                <button type="button" aria-label="全屏播放" onPointerDown={(event) => event.preventDefault()} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void videoPlayerRef.current?.requestFullscreen(); }} className={VIDEO_PREVIEW_CONTROL_CLASS}>
                                    <Maximize className="size-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <img
                        ref={imgRef}
                        src={src}
                        alt={alt}
                        draggable={false}
                        onLoad={(event) => {
                            const image = event.currentTarget;
                            setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
                            setFitWidth(image.clientWidth);
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className={`max-h-[85vh] max-w-[85vw] object-contain rounded-2xl shadow-[0_24px_72px_rgba(0,0,0,0.4)] ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                        style={{
                            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                            transition: isDragging ? "none" : "transform 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                        }}
                    />
                    <div className="absolute bottom-4 left-1/2 z-[2010] flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/10 bg-black/60 px-1.5 py-1 text-white shadow-lg backdrop-blur" onClick={(event) => event.stopPropagation()}>
                        <button type="button" aria-label="缩小" onClick={zoomOut} className={VIDEO_PREVIEW_CONTROL_CLASS}><ZoomOut className="size-4" /></button>
                        <span className="min-w-12 text-center text-xs tabular-nums text-white/80">{zoomPercent}%</span>
                        <button type="button" aria-label="放大" onClick={zoomIn} className={VIDEO_PREVIEW_CONTROL_CLASS}><ZoomIn className="size-4" /></button>
                        <span className="mx-1 h-4 w-px bg-white/15" />
                        <button type="button" aria-label="按原始像素查看" disabled={!naturalSize || !fitWidth} onClick={zoomActual} className="rounded-lg px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40">1:1</button>
                        <button type="button" aria-label="适应窗口" onClick={fitZoom} className="rounded-lg px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white">适应</button>
                        <span className="mx-1 h-4 w-px bg-white/15" />
                        <button type="button" aria-label="下载图片" onClick={onDownload} className={VIDEO_PREVIEW_CONTROL_CLASS}><Download className="size-4" /></button>
                    </div>
                </>
            )}
        </div>
    );
}
