"use client";

import { ArrowUpRight, Clapperboard } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_SHOT_TYPE_OPTIONS } from "@/app/(user)/film/utils/film-shot-types";
import { patchFilmShotNode } from "../lib/film-node-patch";
import type { FilmShotNodeData } from "../../types";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { filmShotViewStats } from "../lib/film-shot-views";
import { FilmShotMediaBadges } from "./film-shot-media-badges";

const COLUMNS = "64px 150px 110px 110px 76px 170px 120px 150px 84px";

export function FilmShotTableView({ theme, model }: { theme: CanvasTheme; model: FilmStudioModel }) {
    const stats = filmShotViewStats(model.shots);
    const activeId = model.activeShot?.shot.id;
    const update = (shotId: string, patch: Partial<FilmShotNodeData>) => model.onUpdateShot(shotId, (node) => patchFilmShotNode(node, patch));
    const openShot = (shotId: string) => {
        model.onSelectShot(shotId);
        model.onViewChange("studio");
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Clapperboard className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>镜头表</span>
                {[`${stats.shots} 镜`, `${stats.scenes} 场`, `${stats.duration}s`, `已出图 ${stats.images}`, `已出视频 ${stats.videos}`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
            </div>
            {model.shots.length ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
                    <div style={{ minWidth: 1044 }}>
                        <div className="sticky top-0 z-10 grid border-b text-[11px]" style={{ gridTemplateColumns: COLUMNS, borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted }}>
                            {["镜号", "场次", "景别", "运镜", "时长", "角色", "场景", "媒体", "操作"].map((label) => <div key={label} className="px-2 py-2">{label}</div>)}
                        </div>
                        {model.shots.map((entry) => {
                            const payload = entry.shot.metadata?.filmShot;
                            const bindings = model.bindingsByShot[entry.shot.id] ?? [];
                            const characters = bindings.filter((binding) => binding.kind === "character").map((binding) => `${binding.name}${binding.stateName ? ` · ${binding.stateName}` : ""}`);
                            const locationName = bindings.find((binding) => binding.kind === "location")?.name;
                            const active = entry.shot.id === activeId;
                            return (
                                <div
                                    key={entry.shot.id}
                                    role="button"
                                    tabIndex={0}
                                    className="grid cursor-default items-center border-b text-xs transition-colors"
                                    style={{ gridTemplateColumns: COLUMNS, borderColor: theme.node.stroke, background: active ? theme.canvas.selectionSoft : undefined, color: theme.node.text }}
                                    onClick={() => model.onSelectShot(entry.shot.id)}
                                    onDoubleClick={() => openShot(entry.shot.id)}
                                    onKeyDown={(event) => { if (event.key === "Enter") openShot(entry.shot.id); }}
                                >
                                    <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.shotNo || ""} onChange={(event) => update(entry.shot.id, { shotNo: event.target.value })} aria-label="镜号" /></div>
                                    <div className="min-w-0 px-2 py-1.5">
                                        <div className="truncate">{entry.sceneLabel}</div>
                                        {entry.episodeTitle ? <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>{entry.episodeTitle}</div> : null}
                                    </div>
                                    <div className="px-2 py-1.5">
                                        <select className="w-full bg-transparent text-xs outline-none" style={{ color: theme.node.text }} value={payload?.shotType || ""} onChange={(event) => update(entry.shot.id, { shotType: event.target.value })} aria-label="景别">
                                            <option value="">未设置</option>
                                            {FILM_SHOT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.cameraMovement || ""} onChange={(event) => update(entry.shot.id, { cameraMovement: event.target.value })} aria-label="运镜" /></div>
                                    <div className="px-2 py-1.5"><input type="number" min={1} max={60} className="w-12 bg-transparent px-0.5 py-0.5 outline-none tabular-nums" style={{ color: theme.node.text }} value={payload?.duration ?? 4} onChange={(event) => update(entry.shot.id, { duration: Number(event.target.value) || 1 })} aria-label="时长" /></div>
                                    <div className="min-w-0 px-2 py-1.5"><div className="truncate" style={{ color: characters.length ? theme.node.text : theme.node.muted }}>{characters.join("、") || "—"}</div></div>
                                    <div className="min-w-0 px-2 py-1.5"><div className="truncate" style={{ color: locationName ? theme.node.text : theme.node.muted }}>{locationName || "—"}</div></div>
                                    <div className="px-2 py-1.5"><FilmShotMediaBadges theme={theme} shot={entry.shot} compact /></div>
                                    <div className="flex justify-end px-2 py-1.5">
                                        <button type="button" className="grid size-6 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={(event) => { event.stopPropagation(); openShot(entry.shot.id); }} aria-label={`在 Studio 打开 ${payload?.shotNo || entry.shot.title}`}><ArrowUpRight className="size-3.5" /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="grid flex-1 place-items-center text-sm" style={{ color: theme.node.muted }}>还没有镜头，去 Studio 或画布新增。</div>
            )}
        </div>
    );
}
