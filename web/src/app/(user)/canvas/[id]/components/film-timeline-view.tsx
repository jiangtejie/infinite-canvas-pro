"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, MessageSquare, Mic, Pause, Play } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useFilmViewState, useFilmViewStore } from "@/app/(user)/canvas/stores/use-film-view-store";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { filmShotViewStats, filmTimelineBlocks } from "../lib/film-shot-views";
import { FilmShotMediaBadges } from "./film-shot-media-badges";

const PIXELS_PER_SECOND = 56;

export function FilmTimelineView({ theme, model }: { theme: CanvasTheme; model: FilmStudioModel }) {
    const stats = filmShotViewStats(model.shots);
    const blocks = filmTimelineBlocks(model.shots, PIXELS_PER_SECOND);
    const totalSeconds = blocks.at(-1)?.end ?? 0;
    const width = totalSeconds * PIXELS_PER_SECOND;
    const activeId = model.activeShot?.shot.id;
    const { projectId } = model;
    const viewState = useFilmViewState(projectId);
    const updateView = useFilmViewStore((state) => state.update);
    const playhead = viewState.playhead;
    const [playing, setPlaying] = useState(false);
    const playheadRef = useRef(playhead);
    const setPlayhead = (seconds: number) => updateView(projectId, (current) => ({ ...current, playhead: seconds }));
    const seek = (seconds: number) => {
        const next = Math.max(0, Math.min(totalSeconds, seconds));
        playheadRef.current = next;
        setPlayhead(next);
    };
    const togglePlay = () => {
        if (!totalSeconds) return;
        if (!playing && playheadRef.current >= totalSeconds) seek(0);
        setPlaying(!playing);
    };
    useEffect(() => {
        if (!playing || !totalSeconds) return;
        const timer = window.setInterval(() => {
            const next = playheadRef.current + 0.1;
            if (next >= totalSeconds) {
                playheadRef.current = totalSeconds;
                updateView(projectId, (current) => ({ ...current, playhead: totalSeconds }));
                setPlaying(false);
                return;
            }
            playheadRef.current = next;
            updateView(projectId, (current) => ({ ...current, playhead: next }));
        }, 100);
        return () => window.clearInterval(timer);
    }, [playing, projectId, totalSeconds, updateView]);
    useEffect(() => {
        if (playheadRef.current <= totalSeconds) return;
        playheadRef.current = totalSeconds;
        updateView(projectId, (current) => ({ ...current, playhead: totalSeconds }));
    }, [projectId, totalSeconds, updateView]);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
            if (event.key === " ") {
                event.preventDefault();
                if (!totalSeconds) return;
                if (!playing && playheadRef.current >= totalSeconds) {
                    playheadRef.current = 0;
                    updateView(projectId, (current) => ({ ...current, playhead: 0 }));
                }
                setPlaying(!playing);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [playing, projectId, totalSeconds, updateView]);
    const segments = blocks.reduce<Array<{ sceneId: string; label: string; start: number; end: number }>>((result, block) => {
        const last = result[result.length - 1];
        if (last && last.sceneId === block.entry.sceneId) last.end = block.end;
        else result.push({ sceneId: block.entry.sceneId, label: block.entry.sceneLabel, start: block.start, end: block.end });
        return result;
    }, []);
    const playheadBlock = blocks.find((block) => playhead >= block.start && playhead < block.end) ?? (playhead >= totalSeconds ? blocks.at(-1) : undefined);
    const openShot = (shotId: string) => {
        model.onSelectShot(shotId);
        model.onViewChange("studio");
    };

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Clock3 className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>时间轴</span>
                <button
                    type="button"
                    className="grid size-7 place-items-center rounded-full border disabled:opacity-40"
                    style={{ borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionSoft, color: theme.node.text }}
                    onClick={togglePlay}
                    disabled={!blocks.length}
                    aria-label={playing ? "暂停预演" : "播放预演"}
                    title={`${playing ? "暂停" : "播放"} (Space)`}
                >
                    {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </button>
                <span className="font-mono text-[11px] tabular-nums" style={{ color: theme.node.text }}>{formatTime(playhead)} / {formatTime(totalSeconds)}</span>
                {[`${stats.shots} 镜`, `${stats.scenes} 场`, `已出视频 ${stats.videos}`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
                <span className="ml-auto text-[11px]" style={{ color: theme.node.muted }}>点击标尺定位 · 点击片段打开 Studio</span>
            </div>
            {blocks.length ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-auto px-4 py-3">
                    <div className="relative" style={{ width, minWidth: "100%" }}>
                        <div
                            className="relative h-7 cursor-crosshair border-b"
                            style={{ borderColor: theme.node.stroke }}
                            onPointerDown={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                setPlaying(false);
                                seek((event.clientX - rect.left) / PIXELS_PER_SECOND);
                            }}
                            onKeyDown={(event) => {
                                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                event.preventDefault();
                                setPlaying(false);
                                seek(playhead + (event.key === "ArrowLeft" ? -1 : 1));
                            }}
                            role="slider"
                            aria-label="预演时间"
                            aria-valuemin={0}
                            aria-valuemax={totalSeconds}
                            aria-valuenow={Math.round(playhead)}
                            tabIndex={0}
                        >
                            {Array.from({ length: totalSeconds + 1 }, (_, second) => (
                                <span key={second} className="absolute top-0 h-full border-l" style={{ left: second * PIXELS_PER_SECOND, borderColor: second % 5 === 0 ? theme.node.stroke : "transparent" }}>
                                    {second % 5 === 0 ? <span className="absolute left-1 top-0.5 text-[9px] tabular-nums" style={{ color: theme.node.muted }}>{formatTime(second)}</span> : null}
                                </span>
                            ))}
                        </div>
                        <div className="flex h-7" style={{ width }}>
                            {segments.map((segment, index) => (
                                <button
                                    key={`${segment.sceneId}-${index}`}
                                    type="button"
                                    className="flex min-w-0 items-center gap-1 overflow-hidden border-r px-1.5 text-[10px]"
                                    style={{ width: (segment.end - segment.start) * PIXELS_PER_SECOND, borderColor: theme.node.stroke, background: index % 2 ? theme.node.fill : theme.node.panel, color: theme.node.muted }}
                                    onClick={() => model.onSceneChange(segment.sceneId)}
                                    title={segment.label}
                                >
                                    <span className="truncate">{segment.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="relative mt-2 h-24">
                            {blocks.map((block) => {
                                const payload = block.entry.shot.metadata?.filmShot;
                                const active = block.entry.shot.id === activeId;
                                return (
                                    <button
                                        key={block.entry.shot.id}
                                        type="button"
                                        className="absolute top-0 flex h-full flex-col gap-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left transition-colors"
                                        style={{ left: block.start * PIXELS_PER_SECOND, width: block.width - 2, borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: block === playheadBlock ? theme.canvas.selectionSoft : theme.node.panel, color: theme.node.text }}
                                        onClick={() => openShot(block.entry.shot.id)}
                                        title={payload?.description || block.entry.shot.title}
                                    >
                                        <span className="flex shrink-0 items-center gap-1 text-[10px]">
                                            <span className="font-mono tabular-nums">{payload?.shotNo || "—"}</span>
                                            <span style={{ color: theme.node.muted }}>{payload?.duration ?? 4}s</span>
                                            {payload?.audio ? <Mic className="size-2.5" style={{ color: theme.node.muted }} /> : null}
                                            {payload?.dialogue ? <MessageSquare className="size-2.5" style={{ color: theme.node.muted }} /> : null}
                                        </span>
                                        {block.width >= 140 ? <span className="line-clamp-2 text-[10px] leading-4" style={{ color: theme.node.muted }}>{payload?.description || "未填写画面描述"}</span> : null}
                                        <span className="mt-auto shrink-0"><FilmShotMediaBadges theme={theme} shot={block.entry.shot} compact /></span>
                                    </button>
                                );
                            })}
                        </div>
                        <span className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: playhead * PIXELS_PER_SECOND }} aria-hidden>
                            <span className="absolute -left-1 top-0 size-2 rounded-full" style={{ background: theme.canvas.selectionStroke }} />
                            <span className="absolute inset-y-0 left-0 w-px" style={{ background: theme.canvas.selectionStroke }} />
                        </span>
                    </div>
                </div>
            ) : (
                <div className="grid flex-1 place-items-center text-sm" style={{ color: theme.node.muted }}>还没有镜头，去 Studio 或画布新增。</div>
            )}
        </div>
    );
}

function formatTime(seconds: number) {
    const minute = Math.floor(seconds / 60);
    const second = Math.floor(seconds % 60);
    return `${minute}:${String(second).padStart(2, "0")}`;
}
