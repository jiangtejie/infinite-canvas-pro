"use client";

import { useState } from "react";
import { Clapperboard, ImageIcon } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { filmShotTypeLabel } from "@/app/(user)/film/utils/film-shot-types";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { FilmShotEntry, FilmStudioModel } from "../lib/film-studio-types";
import { filmShotViewStats } from "../lib/film-shot-views";
import { FilmShotMediaBadges } from "./film-shot-media-badges";

export function FilmStoryboardView({ theme, model }: { theme: CanvasTheme; model: FilmStudioModel }) {
    const [columns, setColumns] = useState<4 | 9>(4);
    const stats = filmShotViewStats(model.shots);
    const activeId = model.activeShot?.shot.id;
    const openShot = (shotId: string) => {
        model.onSelectShot(shotId);
        model.onViewChange("studio");
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Clapperboard className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>故事板</span>
                {[`${stats.shots} 镜`, `${stats.scenes} 场`, `${stats.duration}s`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
                <div className="ml-auto flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
                    {([4, 9] as const).map((value) => (
                        <button key={value} type="button" className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: columns === value ? theme.canvas.selectionSoft : undefined, color: columns === value ? theme.node.text : theme.node.muted }} onClick={() => setColumns(value)}>{value} 格</button>
                    ))}
                </div>
            </div>
            {model.scenes.some((scene) => scene.shots.length) ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <div className="flex flex-col gap-5">
                        {model.scenes.filter((scene) => scene.shots.length).map((scene) => (
                            <section key={scene.id}>
                                <div className="mb-2 flex items-center gap-2">
                                    {scene.episodeTitle ? <span className="text-[11px]" style={{ color: theme.node.muted }}>{scene.episodeTitle}</span> : null}
                                    <button type="button" className="truncate text-xs font-medium" style={{ color: theme.node.text }} onClick={() => model.onSceneChange(scene.id)}>{scene.label}</button>
                                    <span className="text-[11px]" style={{ color: theme.node.muted }}>{scene.shots.length} 镜</span>
                                    <span className="h-px flex-1" style={{ background: theme.node.stroke }} />
                                </div>
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                                    {scene.shots.map((entry) => (
                                        <StoryboardCard key={entry.shot.id} theme={theme} entry={entry} aspect={model.aspect} compact={columns === 9} active={entry.shot.id === activeId} onOpen={() => openShot(entry.shot.id)} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="grid flex-1 place-items-center text-sm" style={{ color: theme.node.muted }}>还没有分镜，去 Studio 或画布新增镜头。</div>
            )}
        </div>
    );
}

function StoryboardCard({ theme, entry, aspect, compact, active, onOpen }: { theme: CanvasTheme; entry: FilmShotEntry; aspect: string; compact: boolean; active: boolean; onOpen: () => void }) {
    const payload = entry.shot.metadata?.filmShot;
    return (
        <button
            type="button"
            className="group flex min-w-0 flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors"
            style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.panel }}
            onClick={onOpen}
            title={payload?.description || entry.shot.title}
        >
            <span className="relative block w-full overflow-hidden rounded-md border" style={{ aspectRatio: aspect.replace(":", " / "), borderColor: theme.node.stroke, background: theme.node.fill }}>
                <StoryboardPoster theme={theme} entry={entry} />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">{payload?.shotNo || "—"}</span>
                {!compact ? <span className="absolute bottom-1 left-1"><FilmShotMediaBadges theme={theme} shot={entry.shot} compact /></span> : null}
            </span>
            <span className="flex items-center justify-between gap-1 px-0.5">
                <span className="truncate text-[11px]" style={{ color: theme.node.text }}>{payload?.description || "未填写画面描述"}</span>
            </span>
            <span className="flex items-center gap-1 px-0.5 text-[10px]" style={{ color: theme.node.muted }}>
                <span>{filmShotTypeLabel(payload?.shotType)}</span>
                <span>·</span>
                <span>{payload?.duration ?? 4}s</span>
                {compact ? <><span>·</span><FilmShotMediaBadges theme={theme} shot={entry.shot} compact /></> : null}
            </span>
        </button>
    );
}

function StoryboardPoster({ theme, entry }: { theme: CanvasTheme; entry: FilmShotEntry }) {
    const payload = entry.shot.metadata?.filmShot;
    const src = useResolvedMediaSrc(payload?.imageUrl, payload?.storageKey);
    return src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center" style={{ color: theme.node.muted }}><ImageIcon className="size-5" /></span>;
}
