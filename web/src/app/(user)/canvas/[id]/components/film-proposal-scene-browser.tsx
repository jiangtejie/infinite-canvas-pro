"use client";

import { useState } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";

export type FilmProposalShotRow = {
    shotNo: string;
    shotType?: string;
    cameraMovement?: string;
    duration: number;
    description: string;
    dialogue?: string;
};

export type FilmProposalSceneRow = {
    key: string;
    name: string;
    duration: number;
    shots: FilmProposalShotRow[];
};

export type FilmProposalEpisodeRow = {
    title: string;
    scenes: FilmProposalSceneRow[];
};

export function FilmProposalSceneBrowser({ theme, episodes, selectedSceneKeys, onToggleScene, detailed = false }: {
    theme: CanvasTheme;
    episodes: FilmProposalEpisodeRow[];
    selectedSceneKeys: Set<string>;
    onToggleScene: (key: string) => void;
    detailed?: boolean;
}) {
    const scenes = episodes.flatMap((episode) => episode.scenes);
    const [focusedKey, setFocusedKey] = useState("");
    const focused = scenes.find((scene) => scene.key === focusedKey) ?? scenes[0] ?? null;
    return (
        <div className="grid min-h-0 gap-3 md:grid-cols-[288px_minmax(0,1fr)]">
            <div className="thin-scrollbar flex max-h-[58vh] min-h-[240px] flex-col gap-2 overflow-y-auto pr-1">
                {episodes.map((episode) => (
                    <section key={episode.title} className="flex flex-col gap-1">
                        <div className="px-1 text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: theme.node.muted }}>{episode.title} · {episode.scenes.length} 场</div>
                        {episode.scenes.map((scene) => {
                            const selected = selectedSceneKeys.has(scene.key);
                            const active = scene === focused;
                            return (
                                <div key={scene.key} role="button" tabIndex={0} className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: selected ? theme.canvas.selectionSoft : active ? theme.node.fill : "transparent" }} onClick={() => setFocusedKey(scene.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocusedKey(scene.key); } }} aria-pressed={active}>
                                    <input type="checkbox" checked={selected} onChange={() => onToggleScene(scene.key)} aria-label={`选择场次 ${scene.name}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs">{scene.name}</span>
                                        <span className="block text-[10px]" style={{ color: theme.node.muted }}>{scene.shots.length} 镜 · {scene.duration}s</span>
                                    </span>
                                </div>
                            );
                        })}
                    </section>
                ))}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
                {focused ? (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium">{focused.name}</span>
                            <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>{focused.shots.length} 镜 · {focused.duration}s</span>
                        </div>
                        <div className="thin-scrollbar max-h-[54vh] min-h-[200px] overflow-y-auto pr-1">
                            <div className="grid gap-2 sm:grid-cols-2">
                                {focused.shots.map((shot, index) => (
                                    <div key={`${focused.key}-${shot.shotNo}-${index}`} className="rounded-lg border px-2.5 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]" style={{ color: theme.node.muted }}>
                                            <span className="font-mono text-xs" style={{ color: theme.node.text }}>{shot.shotNo || "未编号"}</span>
                                            <span>{shot.shotType || "未设置景别"}</span>
                                            {detailed && shot.cameraMovement ? <span>{shot.cameraMovement}</span> : null}
                                            <span>{shot.duration}s</span>
                                        </div>
                                        <div className={`mt-1 text-[11px] leading-5 ${detailed ? "" : "line-clamp-2"}`}>{shot.description || "未填写画面描述"}</div>
                                        {detailed && shot.dialogue ? <div className="mt-1 text-[10px] leading-5" style={{ color: theme.node.muted }}>台词：{shot.dialogue}</div> : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : <div className="grid min-h-[160px] place-items-center text-xs" style={{ color: theme.node.muted }}>没有可预览的场次。</div>}
            </div>
        </div>
    );
}
