"use client";

import { useState } from "react";
import { Clapperboard, ImageIcon, Plus } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { filmShotTypeLabel } from "@/app/(user)/film/utils/film-shot-types";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { FilmSceneEntry, FilmShotEntry, FilmStudioModel } from "../lib/film-studio-types";
import { filmShotViewStats, groupFilmShots } from "../lib/film-shot-views";
import { FilmShotMediaBadges } from "./film-shot-media-badges";
import { FilmShotSelectionBar } from "./film-shot-selection-bar";

export function FilmStoryboardView({ theme, model }: { theme: CanvasTheme; model: FilmStudioModel }) {
    const [columns, setColumns] = useState<4 | 9>(4);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const stats = filmShotViewStats(model.shots);
    const activeId = model.activeShot?.shot.id;
    const openShot = (shotId: string) => {
        model.onSelectShot(shotId);
        model.onViewChange("studio");
    };
    const toggleSelected = (shotId: string) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(shotId)) next.delete(shotId);
        else next.add(shotId);
        return next;
    });
    const sceneSelected = (scene: FilmSceneEntry) => scene.shots.length > 0 && scene.shots.every((entry) => selected.has(entry.shot.id));
    const toggleScene = (scene: FilmSceneEntry) => setSelected((prev) => {
        const next = new Set(prev);
        if (sceneSelected(scene)) scene.shots.forEach((entry) => next.delete(entry.shot.id));
        else scene.shots.forEach((entry) => next.add(entry.shot.id));
        return next;
    });

    return (
        <div className="relative flex h-full min-h-0 flex-col">
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
            {model.scenes.length ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <div className="flex flex-col gap-5">
                        {model.scenes.map((scene) => {
                            const groups = groupFilmShots(scene.shots, columns);
                            return (
                                <section key={scene.id}>
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        {scene.episodeTitle ? <span className="text-[11px]" style={{ color: theme.node.muted }}>{scene.episodeTitle}</span> : null}
                                        <button type="button" className="truncate text-xs font-medium" style={{ color: theme.node.text }} onClick={() => model.onSceneChange(scene.id)}>{scene.label}</button>
                                        <span className="text-[11px]" style={{ color: theme.node.muted }}>{scene.shots.length} 镜</span>
                                        {scene.shots.length ? <button type="button" className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => toggleScene(scene)}>{sceneSelected(scene) ? "取消本场" : "选择本场"}</button> : null}
                                        {scene.scene ? <button type="button" className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onClick={() => model.onCreateShot(scene.id)}><Plus className="size-3" />加镜</button> : null}
                                        <span className="h-px flex-1" style={{ background: theme.node.stroke }} />
                                    </div>
                                    {groups.length ? groups.map((group, groupIndex) => (
                                        <div key={`${scene.id}-${groupIndex}`} className="mb-2 rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                            <div className="mb-1.5 flex items-center gap-2 px-0.5 text-[10px]" style={{ color: theme.node.muted }}>
                                                <span>第 {groupIndex + 1} 组</span>
                                                <span>· {group.length} 镜</span>
                                            </div>
                                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                                                {group.map((entry) => (
                                                    <StoryboardCard key={entry.shot.id} theme={theme} entry={entry} aspect={model.aspect} compact={columns === 9} active={entry.shot.id === activeId} selected={selected.has(entry.shot.id)} onToggle={() => toggleSelected(entry.shot.id)} onOpen={() => openShot(entry.shot.id)} />
                                                ))}
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="grid place-items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                            <span>本场还没有镜头</span>
                                            {scene.scene ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={() => model.onCreateShot(scene.id)}>新增镜头</button> : null}
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="grid flex-1 place-items-center text-sm" style={{ color: theme.node.muted }}>还没有场次，去 Studio 或画布新增镜头。</div>
            )}
            <FilmShotSelectionBar theme={theme} count={selected.size} running={model.shotBatch.running} onGenerate={(kind) => model.onBatchGenerateShots([...selected], kind)} onClear={() => setSelected(new Set())} />
        </div>
    );
}

function StoryboardCard({ theme, entry, aspect, compact, active, selected, onToggle, onOpen }: {
    theme: CanvasTheme;
    entry: FilmShotEntry;
    aspect: string;
    compact: boolean;
    active: boolean;
    selected: boolean;
    onToggle: () => void;
    onOpen: () => void;
}) {
    const payload = entry.shot.metadata?.filmShot;
    return (
        <div className="relative min-w-0">
            <button
                type="button"
                className="group flex w-full min-w-0 flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors"
                style={{ borderColor: selected ? theme.canvas.selectionStroke : active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.panel }}
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
            <input type="checkbox" checked={selected} onChange={onToggle} onClick={(event) => event.stopPropagation()} className="absolute right-2 top-2 z-10 size-4" aria-label={`选择镜头 ${payload?.shotNo || entry.shot.title}`} />
        </div>
    );
}

function StoryboardPoster({ theme, entry }: { theme: CanvasTheme; entry: FilmShotEntry }) {
    const payload = entry.shot.metadata?.filmShot;
    const src = useResolvedMediaSrc(payload?.imageUrl, payload?.storageKey);
    return src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center" style={{ color: theme.node.muted }}><ImageIcon className="size-5" /></span>;
}
