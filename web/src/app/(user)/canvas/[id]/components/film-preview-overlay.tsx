"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import { Film, Pause, Play, RotateCcw, SkipBack, SkipForward, Video, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import { CANVAS_Z } from "../lib/canvas-layer";
import { buildFilmPreviewTimeline, filmPreviewClipAt, formatFilmPreviewTime } from "../lib/film-animatic-preview";
import type { FilmStudioModel } from "../lib/film-studio-types";

export function FilmPreviewOverlay({ theme, model, onClose }: { theme: CanvasTheme; model: FilmStudioModel; onClose: () => void }) {
    const previewShots = useMemo(() => {
        if (!model.previewShotIds?.length) return model.shots;
        const ids = new Set(model.previewShotIds);
        return model.shots.filter((entry) => ids.has(entry.shot.id));
    }, [model.previewShotIds, model.shots]);
    const timeline = useMemo(() => buildFilmPreviewTimeline(previewShots), [previewShots]);
    const initialClip = timeline.clips.find((clip) => clip.shotId === model.activeShot?.shot.id) ?? timeline.clips[0] ?? null;
    const [currentIndex, setCurrentIndex] = useState(initialClip?.index ?? 0);
    const [time, setTime] = useState(initialClip?.start ?? 0);
    const [playing, setPlaying] = useState(false);
    const [seekVersion, setSeekVersion] = useState(0);
    const [videoFailed, setVideoFailed] = useState(false);
    const indexRef = useRef(currentIndex);
    const timeRef = useRef(time);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        timeRef.current = time;
    }, [time]);

    const activeClip = timeline.clips[currentIndex] ?? null;
    const activeEntry = activeClip ? model.shots.find((entry) => entry.shot.id === activeClip.shotId) : undefined;
    const payload = activeEntry?.shot.metadata?.filmShot;
    const videoSrc = useResolvedMediaSrc(payload?.videoUrl, payload?.videoStorageKey, "media");
    const imageSrc = useResolvedMediaSrc(payload?.imageUrl, payload?.storageKey, "image");
    const showVideo = activeClip?.media === "video" && Boolean(videoSrc) && !videoFailed;
    const showImage = !showVideo && Boolean(imageSrc);

    const goToClip = useCallback((index: number) => {
        const clip = timeline.clips[index];
        if (!clip) return;
        indexRef.current = clip.index;
        timeRef.current = clip.start;
        setCurrentIndex(clip.index);
        setTime(clip.start);
        setSeekVersion((value) => value + 1);
    }, [timeline]);

    const seekToTime = useCallback((seconds: number) => {
        const clip = filmPreviewClipAt(timeline, seconds);
        if (!clip) return;
        const next = Math.max(clip.start, Math.min(clip.end - 0.001, seconds));
        indexRef.current = clip.index;
        timeRef.current = next;
        setCurrentIndex(clip.index);
        setTime(next);
        setSeekVersion((value) => value + 1);
    }, [timeline]);

    const togglePlay = useCallback(() => {
        if (!timeline.clips.length) return;
        if (!playing && timeRef.current >= timeline.totalDuration - 0.01) goToClip(0);
        setPlaying((value) => !value);
    }, [goToClip, playing, timeline.clips.length, timeline.totalDuration]);

    const playPrev = useCallback(() => {
        if (!timeline.clips.length) return;
        goToClip(Math.max(0, indexRef.current - 1));
    }, [goToClip, timeline.clips.length]);

    const playNext = useCallback(() => {
        if (!timeline.clips.length) return;
        goToClip(Math.min(timeline.clips.length - 1, indexRef.current + 1));
    }, [goToClip, timeline.clips.length]);

    useEffect(() => {
        if (!playing || !timeline.clips.length) return;
        const timer = window.setInterval(() => {
            const next = Math.min(timeline.totalDuration, timeRef.current + 0.1);
            timeRef.current = next;
            setTime(next);
            const clip = filmPreviewClipAt(timeline, next);
            if (clip && clip.index !== indexRef.current) {
                indexRef.current = clip.index;
                setCurrentIndex(clip.index);
                setSeekVersion((value) => value + 1);
            }
            if (next >= timeline.totalDuration - 0.001) setPlaying(false);
        }, 100);
        return () => window.clearInterval(timer);
    }, [playing, timeline]);

    useEffect(() => {
        setVideoFailed(false);
    }, [activeClip?.shotId, videoSrc]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeClip || activeClip.media !== "video" || !videoSrc) return;
        const offset = Math.max(0, timeRef.current - activeClip.start);
        try {
            if (Math.abs(video.currentTime - offset) > 0.2) video.currentTime = offset;
        } catch {
            // 元数据尚未加载时由 onLoadedMetadata 再同步。
        }
        if (playing) void video.play().catch(() => undefined);
        else video.pause();
    }, [activeClip, playing, seekVersion, videoSrc]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            event.stopPropagation();
            if (event.key === " " || event.code === "Space") {
                event.preventDefault();
                togglePlay();
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                playPrev();
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                playNext();
            } else if (event.key === "Home") {
                event.preventDefault();
                goToClip(0);
            } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [goToClip, onClose, playNext, playPrev, togglePlay]);

    const openCurrentShot = () => {
        if (!activeClip) return;
        model.onSelectShot(activeClip.shotId);
        model.onViewChange("studio");
        onClose();
    };

    return (
        <Modal open onCancel={onClose} footer={null} closable={false} centered keyboard={false} width="min(1400px, 97vw)" mask={{ closable: false }} destroyOnHidden zIndex={CANVAS_Z.preview} styles={{ body: { padding: 0, background: "#09090b", borderRadius: 18, overflow: "hidden" } }}>
            <div className="flex h-[min(88vh,900px)] flex-col text-white">
                <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
                    <Play className="size-4" style={{ color: theme.canvas.selectionStroke }} />
                    <span className="text-sm font-semibold">成片预览</span>
                    {model.previewShotIds ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60">镜头组 · {timeline.clips.length} 镜</span> : null}
                    {activeClip ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60">{activeClip.sceneLabel}</span> : null}
                    <span className="ml-auto font-mono text-[11px] tabular-nums text-white/55">{formatFilmPreviewTime(time)} / {formatFilmPreviewTime(timeline.totalDuration)}</span>
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="关闭成片预览"><X className="size-4" /></button>
                </div>

                <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-3">
                    {activeClip ? (
                        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg">
                            {showVideo ? (
                                <video
                                    key={`${activeClip.shotId}-${videoSrc}`}
                                    ref={videoRef}
                                    src={videoSrc}
                                    poster={imageSrc || undefined}
                                    className="max-h-full max-w-full object-contain"
                                    muted
                                    playsInline
                                    preload="metadata"
                                    onError={() => setVideoFailed(true)}
                                    onLoadedMetadata={() => {
                                        const video = videoRef.current;
                                        if (!video) return;
                                        video.currentTime = Math.max(0, timeRef.current - activeClip.start);
                                        if (playing) void video.play().catch(() => undefined);
                                    }}
                                />
                            ) : showImage ? (
                                <img src={imageSrc} alt={payload?.description || activeClip.shotNo} className="max-h-full max-w-full object-contain" />
                            ) : (
                                <div className="flex max-w-md flex-col items-center gap-2 px-6 text-center">
                                    <Film className="size-8 text-white/25" />
                                    <div className="text-sm text-white/55">这个镜头还没有分镜图或视频</div>
                                    <div className="line-clamp-3 text-xs leading-5 text-white/35">{activeClip.description || "补全画面描述后可直接在 Studio 生成。"}</div>
                                </div>
                            )}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pb-3 pt-10">
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/55">
                                    <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono tabular-nums">{activeClip.shotNo}</span>
                                    <span className="rounded-full bg-white/10 px-2 py-0.5">{activeClip.media === "video" ? "视频" : activeClip.media === "image" ? "分镜图" : "缺画面"}</span>
                                    <span>{activeClip.duration.toFixed(1)}s</span>
                                </div>
                                {activeClip.description ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/85">{activeClip.description}</div> : null}
                                {activeClip.dialogue ? <div className="mt-0.5 line-clamp-1 text-[11px] text-white/55">台词：{activeClip.dialogue}</div> : null}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-white/50">
                            <Film className="size-8" />
                            <div className="text-sm">还没有镜头，先在 Studio 或画布创建。</div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-3">
                    <div className="relative flex h-8 w-full overflow-hidden rounded-md bg-white/5" role="slider" aria-label="成片预览进度" aria-valuemin={0} aria-valuemax={Math.round(timeline.totalDuration)} aria-valuenow={Math.round(time)} tabIndex={0} onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        seekToTime(timeRef.current + (event.key === "ArrowLeft" ? -1 : 1));
                    }} onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        seekToTime(((event.clientX - rect.left) / rect.width) * timeline.totalDuration);
                    }}>
                        <div className="flex h-full w-full">
                            {timeline.clips.map((clip) => (
                                <button key={clip.shotId} type="button" className="h-full min-w-[3px] border-r border-black/40 text-left transition-colors" style={{ width: `${(clip.duration / Math.max(1, timeline.totalDuration)) * 100}%`, background: clip.index === activeClip?.index ? "rgba(255,255,255,0.3)" : clip.media === "none" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.15)" }} title={`${clip.shotNo} · ${clip.sceneLabel} · ${clip.duration}s`} onClick={(event) => {
                                    event.stopPropagation();
                                    seekToTime(clip.start);
                                }} aria-label={`跳转到镜头 ${clip.shotNo}`} />
                            ))}
                        </div>
                        <span className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${(time / Math.max(0.001, timeline.totalDuration)) * 100}%` }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="grid size-8 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-30" onClick={() => goToClip(0)} disabled={!timeline.clips.length} aria-label="回到开头"><RotateCcw className="size-4" /></button>
                        <button type="button" className="grid size-8 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-30" onClick={playPrev} disabled={!timeline.clips.length} aria-label="上一镜"><SkipBack className="size-4" /></button>
                        <button type="button" className="grid size-10 place-items-center rounded-full text-black transition disabled:opacity-30" style={{ background: theme.canvas.selectionStroke }} onClick={togglePlay} disabled={!timeline.clips.length} aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
                        <button type="button" className="grid size-8 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-30" onClick={playNext} disabled={!timeline.clips.length} aria-label="下一镜"><SkipForward className="size-4" /></button>
                        <span className="ml-2 font-mono text-[11px] tabular-nums text-white/55">{activeClip ? `${activeClip.index + 1}/${timeline.clips.length}` : "0/0"}</span>
                        <span className="flex items-center gap-2 text-[10px] text-white/40">
                            <span className="inline-flex items-center gap-1"><Video className="size-3" />{timeline.videoCount}</span>
                            <span className="inline-flex items-center gap-1"><Film className="size-3" />{timeline.imageCount}</span>
                            {timeline.missingCount ? <span className="text-amber-300/70">缺 {timeline.missingCount}</span> : null}
                        </span>
                        <span className="ml-auto hidden items-center gap-3 text-[10px] text-white/35 md:flex">
                            <span>Space 播放</span>
                            <span>← → 跳镜</span>
                            <span>Esc 关闭</span>
                            <span>静音预览</span>
                        </span>
                        {activeClip ? <button type="button" className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white" onClick={openCurrentShot}>在 Studio 打开</button> : null}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
