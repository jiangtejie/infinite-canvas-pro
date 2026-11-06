"use client";

import { useMemo, useState } from "react";
import { Button } from "antd";
import { Clapperboard, ListVideo, Play, SkipForward } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFilmVideoUrl } from "../hooks/use-film-image-url";
import type { FilmProject, FilmShot } from "../types";
import { filmShotTypeLabel } from "../utils/film-shot-types";
import { filmAspectCssRatio, filmAspectLabel } from "../utils/film-aspects";
import { flattenFilmShots } from "../utils/parse-script";
import { FilmShotThumbnail } from "./film-shot-thumbnail";

export function FilmEditStage({ project, onGoStoryboard }: { project: FilmProject; onGoStoryboard: () => void }) {
    const shots = useMemo(() => flattenFilmShots(project.episodes), [project.episodes]);
    const videoShots = useMemo(() => shots.filter((shot) => shot.videoUrl || shot.videoStorageKey), [shots]);
    const [selectedShotId, setSelectedShotId] = useState("");
    const [autoplay, setAutoplay] = useState(true);
    const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? videoShots[0] ?? shots[0] ?? null;
    const totalDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);

    const playNext = () => {
        const index = videoShots.findIndex((shot) => shot.id === selectedShot?.id);
        const next = videoShots[index + 1];
        if (next) setSelectedShotId(next.id);
    };

    if (!shots.length) {
        return (
            <div className="grid h-full place-items-center">
                <div className="flex flex-col items-center px-6 py-16 text-center">
                    <div className="film-float grid size-12 place-items-center rounded-[10px] border border-dashed border-acid/30 bg-acid/[0.03] text-acid/70">
                        <Clapperboard className="size-5" />
                    </div>
                    <p className="mt-4 text-sm text-foreground">还没有分镜</p>
                    <p className="mt-1.5 text-xs leading-6 text-muted-foreground">先去剧本页解析剧本，再来这里预览成片。</p>
                    <button type="button" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition hover:border-acid/60" onClick={onGoStoryboard}>
                        去导演台
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
            <div className="punk-panel relative flex shrink-0 flex-wrap items-center gap-2 overflow-hidden px-4 py-2.5">
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                <span className="eyebrow">剪辑预览</span>
                <span className="chip chip-acid">{videoShots.length}/{shots.length} 个视频</span>
                <span className="chip">总时长 {Math.round(totalDuration)}s</span>
                <span className="chip">{filmAspectLabel(project.aspect)}</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="small" icon={<SkipForward className="size-3.5" />} disabled={!videoShots.length} onClick={() => setSelectedShotId(videoShots[0]?.id ?? "")}>
                        从头播放
                    </Button>
                    <Button size="small" type={autoplay ? "primary" : "default"} icon={<ListVideo className="size-3.5" />} onClick={() => setAutoplay((value) => !value)}>
                        {autoplay ? "连播：开" : "连播：关"}
                    </Button>
                    <Button size="small" onClick={onGoStoryboard}>去导演台</Button>
                </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section className="punk-panel flex min-h-0 flex-col overflow-hidden rounded-xl">
                    <div className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                        <span className="eyebrow">预览</span>
                        {selectedShot ? <span className="font-mono text-[10px] text-muted-foreground/70">{selectedShot.shotNo} · {selectedShot.duration}s</span> : null}
                    </div>
                    <div className="film-scan relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden bg-black/60 p-3">
                        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 50% 46%, color-mix(in oklab, var(--acid) 5%, transparent), transparent 66%)" }} />
                        {selectedShot && (selectedShot.videoUrl || selectedShot.videoStorageKey) ? (
                            <div className="relative h-full max-h-full w-auto max-w-full overflow-hidden rounded-md border border-white/10 bg-black" style={{ aspectRatio: filmAspectCssRatio(project.aspect) }}>
                                <ShotVideoPlayer key={selectedShot.id} shot={selectedShot} autoPlay={autoplay} onEnded={() => autoplay && playNext()} />
                            </div>
                        ) : (
                            <div className="absolute inset-0 grid place-items-center px-6 text-center">
                                <div>
                                    <div className="film-float relative mx-auto grid size-12 place-items-center rounded-[10px] border border-dashed border-acid/35 bg-acid/[0.06] text-acid/80">
                                        <span aria-hidden className="absolute -inset-3 rounded-xl border border-acid/10" />
                                        <Play className="size-5" />
                                    </div>
                                    <p className="mt-4 text-sm text-white/80">这个镜头还没有生成视频</p>
                                    <p className="mt-1.5 text-xs leading-6 text-white/45">去导演台生成后，回到这里就能按顺序预览。</p>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <section className="punk-panel thin-scrollbar flex min-h-0 flex-col overflow-y-auto rounded-xl p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <span className="eyebrow">片段</span>
                        <span aria-hidden className="h-px flex-1 bg-border/50" />
                        <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{shots.length}</span>
                    </div>
                    <div className="grid gap-2">
                        {shots.map((shot, index) => {
                            const hasVideo = Boolean(shot.videoUrl || shot.videoStorageKey);
                            const active = selectedShot?.id === shot.id;
                            return (
                                <button
                                    key={shot.id}
                                    type="button"
                                    onClick={() => setSelectedShotId(shot.id)}
                                    style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}
                                    className={cn("enter-up group flex items-center gap-2.5 rounded-lg border p-2 text-left transition-all hover:-translate-y-0.5", active ? "border-acid/60 bg-acid/[0.05]" : "border-border/60 bg-card/50 hover:border-acid/40")}
                                >
                                    <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md border border-border/50 bg-background/40">
                                        <FilmShotThumbnail shot={shot} className="h-12 w-full" />
                                        <span className="absolute inset-0 grid place-items-center bg-black/25">
                                            {hasVideo ? <Play className="size-4 text-white/85" /> : <span className="font-mono text-[8px] text-muted-foreground/70">未生成</span>}
                                        </span>
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-mono text-[9px] text-muted-foreground/60 tabular-nums">{String(index + 1).padStart(2, "0")} · {shot.shotNo}</span>
                                        <span className="mt-0.5 line-clamp-1 block text-[11px] text-foreground/80">{shot.description || "未填写画面描述"}</span>
                                        <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground/50">{shot.duration}s · {filmShotTypeLabel(shot.shotType)}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}

function ShotVideoPlayer({ shot, autoPlay, onEnded }: { shot: FilmShot; autoPlay: boolean; onEnded: () => void }) {
    const src = useFilmVideoUrl(shot.videoUrl, shot.videoStorageKey);
    if (!src) {
        return <div className="absolute inset-0 grid place-items-center font-mono text-[11px] text-white/50">视频地址已失效，请重新生成</div>;
    }
    return <video src={src} controls autoPlay={autoPlay} playsInline onEnded={onEnded} className="absolute inset-0 h-full w-full object-contain" />;
}
