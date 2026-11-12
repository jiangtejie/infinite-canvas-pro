"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Clapperboard, ImageIcon, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmProject, FilmShot } from "@/lib/film/types";
import { filmAspectCssRatio } from "@/lib/film/film-aspects";
import { EmptyState } from "@/components/ui/state-panel";
import { filmShotTypeLabel } from "../utils/film-shot-types";
import { deriveFilmShotStatus } from "../utils/film-status";
import { FilmShotStatusChip } from "./film-shot-status-chip";
import { FilmShotThumbnail } from "./film-shot-thumbnail";

const COLUMN_WIDTH = 280;
const COLUMN_GAP = 32;
const CANVAS_PADDING = 48;

type BoardTransform = { x: number; y: number; k: number };

export function FilmStoryboardBoard({ project, selectedShotId, onSelect }: { project: FilmProject; selectedShotId: string; onSelect: (shotId: string) => void }) {
    const [transform, setTransform] = useState<BoardTransform>({ x: CANVAS_PADDING, y: CANVAS_PADDING, k: 1 });
    const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
    const columns = project.episodes.flatMap((episode) => episode.scenes.map((scene) => ({ episodeTitle: episode.title, scene })));

    const applyZoom = (delta: number) => {
        setTransform((prev) => ({ ...prev, k: Math.min(2.2, Math.max(0.35, Number((prev.k + delta).toFixed(2)))) }));
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y };
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        setTransform((prev) => ({
            ...prev,
            x: drag.originX + event.clientX - drag.startX,
            y: drag.originY + event.clientY - drag.startY,
        }));
    };

    const endDrag = () => {
        dragRef.current = null;
    };

    return (
        <section className="punk-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
            <div className="relative flex shrink-0 items-center gap-2 overflow-hidden border-b border-border/60 px-3 py-2">
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                <span className="eyebrow">无限画布</span>
                <span className="hidden font-mono text-[10px] text-muted-foreground/50 sm:inline">拖拽移动 · 滚轮缩放</span>
                <div className="ml-auto flex items-center gap-1">
                    <BoardTool label="缩小" onClick={() => applyZoom(-0.15)}><ZoomOut className="size-3.5" /></BoardTool>
                    <span className="w-10 text-center font-mono text-[10px] text-muted-foreground/70 tabular-nums">{Math.round(transform.k * 100)}%</span>
                    <BoardTool label="放大" onClick={() => applyZoom(0.15)}><ZoomIn className="size-3.5" /></BoardTool>
                    <BoardTool label="重置视图" onClick={() => setTransform({ x: CANVAS_PADDING, y: CANVAS_PADDING, k: 1 })}><Maximize2 className="size-3.5" /></BoardTool>
                </div>
            </div>
            <div
                className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
                style={{
                    backgroundColor: "color-mix(in oklch, var(--background) 55%, transparent)",
                    backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px), radial-gradient(ellipse at 45% 0%, color-mix(in oklch, var(--acid) 5%, transparent), transparent 60%)",
                    backgroundSize: "22px 22px, 100% 100%",
                    backgroundPosition: `${transform.x}px ${transform.y}px, 0 0`,
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onWheel={(event) => {
                    event.preventDefault();
                    applyZoom(event.deltaY < 0 ? 0.1 : -0.1);
                }}
            >
                <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>
                    {columns.map((column, columnIndex) => (
                        <div key={column.scene.id} className="absolute" style={{ left: columnIndex * (COLUMN_WIDTH + COLUMN_GAP), top: 0, width: COLUMN_WIDTH }}>
                            <div className="mb-2 flex items-center gap-2">
                                <span className="truncate font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{column.episodeTitle}</span>
                                <span aria-hidden className="h-px flex-1 bg-border/50" />
                            </div>
                            <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/50 px-2.5 py-2 transition-colors hover:border-acid/35">
                                <span className="truncate text-xs font-medium text-foreground/85">{column.scene.name}</span>
                                <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">{column.scene.shots.length} 镜</span>
                            </div>
                            <div className="grid gap-3">
                                {column.scene.shots.map((shot) => (
                                    <BoardCard key={shot.id} shot={shot} aspect={project.aspect} selected={shot.id === selectedShotId} onSelect={() => onSelect(shot.id)} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                {columns.length === 0 ? (
                    <div className="absolute inset-0 grid place-items-center">
                        <EmptyState className="py-10" icon={<Clapperboard className="size-5" />} title="还没有分镜" description="先去剧本页粘贴剧本并解析，分镜会自动出现在画布上。" />
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function BoardCard({ shot, aspect, selected, onSelect }: { shot: FilmShot; aspect: string; selected: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onSelect}
            className={cn(
                "group flex w-full flex-col gap-2 rounded-lg border p-2.5 text-left transition-all hover:-translate-y-0.5",
                selected ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/70 hover:border-acid/40",
            )}
        >
            <span className="relative block w-full overflow-hidden rounded-md border border-border/50 bg-background/30" style={{ aspectRatio: filmAspectCssRatio(aspect) }}>
                <span aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-background/35 via-transparent to-transparent" />
                {shot.imageUrl || shot.storageKey ? (
                    <FilmShotThumbnail shot={shot} className="h-full w-full" />
                ) : (
                    <span className="grid h-full w-full place-items-center border-dashed bg-background/30 text-muted-foreground/25">
                        <ImageIcon className="size-5" aria-hidden />
                    </span>
                )}
            </span>
            <span className="flex items-center justify-between gap-2">
                <span className={cn("font-mono text-[10px] tabular-nums", selected ? "text-acid" : "text-muted-foreground/70")}>{shot.shotNo}</span>
                <FilmShotStatusChip status={deriveFilmShotStatus(shot)} />
            </span>
            <span className={cn("line-clamp-2 text-xs leading-5", shot.description ? "text-foreground/80" : "text-muted-foreground/50")}>
                {shot.description || "未填写画面描述"}
            </span>
            <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/60">
                <span>{filmShotTypeLabel(shot.shotType)}</span>
                <span aria-hidden>·</span>
                <span>{shot.duration}s</span>
            </span>
        </button>
    );
}

function BoardTool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
            {children}
        </button>
    );
}
