"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmSceneEntry } from "../lib/film-studio-types";

type FilmStripProps = {
    theme: CanvasTheme;
    scenes: FilmSceneEntry[];
    activeShotId: string | null;
    onSelectShot: (shotId: string) => void;
    onCreateShot: (sceneId: string) => void;
};

export function FilmStrip({ theme, scenes, activeShotId, onSelectShot, onCreateShot }: FilmStripProps) {
    const activeRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [activeShotId]);

    return (
        <div className="flex h-[132px] shrink-0 items-stretch gap-4 overflow-x-auto border-t px-4 py-3 max-sm:h-[104px]" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            {scenes.map((scene) => (
                <div key={scene.id} className="flex shrink-0 items-stretch gap-2 border-r pr-4 last:border-r-0" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex w-[96px] shrink-0 flex-col justify-center gap-0.5 text-[11px]" style={{ color: theme.node.muted }}>
                        <span className="truncate font-medium" style={{ color: theme.node.text }}>{scene.episodeTitle || "未分集"}</span>
                        <span className="truncate">{scene.name}</span>
                        <span>{scene.shots.length} 镜</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {scene.shots.map((entry) => {
                            const active = entry.shot.id === activeShotId;
                            const shotNo = entry.shot.metadata?.filmShot?.shotNo || "—";
                            return (
                                <button
                                    key={entry.shot.id}
                                    ref={active ? activeRef : undefined}
                                    type="button"
                                    className="flex h-[92px] w-[148px] shrink-0 flex-col items-center justify-center rounded-lg border text-xs transition max-sm:h-[72px] max-sm:w-[112px]"
                                    style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.fill, color: theme.node.text }}
                                    onClick={() => onSelectShot(entry.shot.id)}
                                    title={entry.shot.metadata?.filmShot?.description || entry.shot.title}
                                >
                                    <span className="font-mono text-lg font-semibold tabular-nums">{shotNo}</span>
                                    <span className="mt-1 max-w-full truncate px-2 text-[10px]" style={{ color: theme.node.muted }}>{entry.sceneLabel}</span>
                                </button>
                            );
                        })}
                        {scene.scene ? (
                            <button type="button" className="grid h-[92px] w-[64px] shrink-0 place-items-center rounded-lg border border-dashed max-sm:h-[72px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={() => onCreateShot(scene.id)} aria-label={`在${scene.label}新增镜头`}>
                                <Plus className="size-4" />
                            </button>
                        ) : null}
                    </div>
                </div>
            ))}
        </div>
    );
}
