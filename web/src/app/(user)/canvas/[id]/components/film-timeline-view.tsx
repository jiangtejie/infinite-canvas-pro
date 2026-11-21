"use client";

import { Clock3, MessageSquare, Mic } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
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
    const segments = blocks.reduce<Array<{ sceneId: string; label: string; start: number; end: number }>>((result, block) => {
        const last = result[result.length - 1];
        if (last && last.sceneId === block.entry.sceneId) last.end = block.end;
        else result.push({ sceneId: block.entry.sceneId, label: block.entry.sceneLabel, start: block.start, end: block.end });
        return result;
    }, []);
    const openShot = (shotId: string) => {
        model.onSelectShot(shotId);
        model.onViewChange("studio");
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Clock3 className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>时间轴</span>
                {[`${stats.shots} 镜`, `${stats.scenes} 场`, formatTime(totalSeconds), `已出视频 ${stats.videos}`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
                <span className="ml-auto text-[11px]" style={{ color: theme.node.muted }}>按场次与镜头序列排列 · 点击片段打开 Studio</span>
            </div>
            {blocks.length ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-auto px-4 py-3">
                    <div className="relative" style={{ width, minWidth: "100%" }}>
                        <div className="relative h-7 border-b" style={{ borderColor: theme.node.stroke }}>
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
                                        style={{ left: block.start * PIXELS_PER_SECOND, width: block.width - 2, borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.panel, color: theme.node.text }}
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
    const second = Math.round(seconds % 60);
    return `${minute}:${String(second).padStart(2, "0")}`;
}
