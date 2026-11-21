"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "antd";
import { ArrowUpRight, Clapperboard, Search } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_SHOT_TYPE_OPTIONS } from "@/app/(user)/film/utils/film-shot-types";
import { patchFilmShotNode } from "../lib/film-node-patch";
import type { FilmShotNodeData } from "../../types";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { filterFilmShotEntries, filmShotViewStats, type FilmShotMediaFilter } from "../lib/film-shot-views";
import { FilmShotMediaBadges } from "./film-shot-media-badges";
import { FilmShotSelectionBar } from "./film-shot-selection-bar";

const COLUMNS = "36px 56px 130px 100px 100px 64px 200px 180px 150px 110px 130px 72px";
const STATUS_OPTIONS: Array<{ value: FilmShotMediaFilter; label: string }> = [
    { value: "all", label: "全部状态" },
    { value: "none", label: "未生成" },
    { value: "image", label: "已出图" },
    { value: "video", label: "已出视频" },
    { value: "generating", label: "生成中" },
    { value: "failed", label: "生成失败" },
];

export function FilmShotTableView({ theme, model }: { theme: CanvasTheme; model: FilmStudioModel }) {
    const stats = filmShotViewStats(model.shots);
    const activeId = model.activeShot?.shot.id;
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sceneId, setSceneId] = useState("all");
    const [status, setStatus] = useState<FilmShotMediaFilter>("all");
    const [query, setQuery] = useState("");
    const selectAllRef = useRef<HTMLInputElement>(null);
    const filteredShots = useMemo(() => filterFilmShotEntries(model.shots, { sceneId, status, query }), [model.shots, query, sceneId, status]);
    const allSelected = filteredShots.length > 0 && filteredShots.every((entry) => selected.has(entry.shot.id));
    const sceneOptions = [{ value: "all", label: "全部场次" }, ...model.scenes.map((scene) => ({ value: scene.id, label: scene.label }))];
    const update = (shotId: string, patch: Partial<FilmShotNodeData>) => model.onUpdateShot(shotId, (node) => patchFilmShotNode(node, patch));
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
    const toggleAll = () => setSelected((prev) => {
        const next = new Set(prev);
        if (allSelected) filteredShots.forEach((entry) => next.delete(entry.shot.id));
        else filteredShots.forEach((entry) => next.add(entry.shot.id));
        return next;
    });
    const changeFilter = (apply: () => void) => {
        apply();
        setSelected(new Set());
    };

    useEffect(() => {
        if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
    }, [allSelected, selected]);

    return (
        <div className="relative flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Clapperboard className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>镜头表</span>
                {[`${stats.shots} 镜`, `${stats.scenes} 场`, `${stats.duration}s`, `已出图 ${stats.images}`, `已出视频 ${stats.videos}`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" style={{ color: theme.node.muted }} />
                        <input className="w-[180px] rounded-md border bg-transparent py-1 pl-7 pr-2 text-xs outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} placeholder="搜索镜号/描述/台词" value={query} onChange={(event) => changeFilter(() => setQuery(event.target.value))} aria-label="搜索镜头" />
                    </div>
                    <Select size="small" variant="borderless" className="w-[140px]" value={sceneId} options={sceneOptions} onChange={(value) => changeFilter(() => setSceneId(value))} aria-label="筛选场次" />
                    <Select size="small" variant="borderless" className="w-[120px]" value={status} options={STATUS_OPTIONS} onChange={(value) => changeFilter(() => setStatus(value))} aria-label="筛选状态" />
                </div>
            </div>
            {model.shots.length ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
                    <div style={{ minWidth: 1340 }}>
                        <div className="sticky top-0 z-10 grid border-b text-[11px]" style={{ gridTemplateColumns: COLUMNS, borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted }}>
                            <div className="grid place-items-center px-2 py-2">
                                <input ref={selectAllRef} type="checkbox" className="size-4" checked={allSelected} onChange={toggleAll} aria-label="全选镜头" />
                            </div>
                            {["镜号", "场次", "景别", "运镜", "时长", "描述", "台词", "角色", "场景", "媒体", "操作"].map((label) => <div key={label} className="px-2 py-2">{label}</div>)}
                        </div>
                        {filteredShots.length ? filteredShots.map((entry) => {
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
                                    <div className="grid place-items-center px-2 py-1.5">
                                        <input type="checkbox" className="size-4" checked={selected.has(entry.shot.id)} onChange={() => toggleSelected(entry.shot.id)} onClick={(event) => event.stopPropagation()} aria-label={`选择镜头 ${payload?.shotNo || entry.shot.title}`} />
                                    </div>
                                    <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.shotNo || ""} onChange={(event) => update(entry.shot.id, { shotNo: event.target.value })} aria-label="镜号" /></div>
                                    <div className="min-w-0 px-2 py-1.5">
                                        <div className="truncate">{entry.sceneLabel}</div>
                                        {entry.episodeTitle ? <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>{entry.episodeTitle}</div> : null}
                                    </div>
                                    <div className="px-2 py-1.5">
                                        <Select size="small" variant="borderless" className="w-full" value={payload?.shotType || undefined} placeholder="未设置" allowClear popupMatchSelectWidth={false} options={FILM_SHOT_TYPE_OPTIONS} onChange={(value) => update(entry.shot.id, { shotType: value || "" })} aria-label="景别" />
                                    </div>
                                    <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.cameraMovement || ""} onChange={(event) => update(entry.shot.id, { cameraMovement: event.target.value })} aria-label="运镜" /></div>
                                    <div className="px-2 py-1.5"><input type="number" min={1} max={60} className="w-12 bg-transparent px-0.5 py-0.5 outline-none tabular-nums" style={{ color: theme.node.text }} value={payload?.duration ?? 4} onChange={(event) => update(entry.shot.id, { duration: Number(event.target.value) || 1 })} aria-label="时长" /></div>
                                    <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.description || ""} onChange={(event) => update(entry.shot.id, { description: event.target.value })} aria-label="描述" /></div>
                                    <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.dialogue || ""} onChange={(event) => update(entry.shot.id, { dialogue: event.target.value })} aria-label="台词" /></div>
                                    <div className="min-w-0 px-2 py-1.5"><div className="truncate" style={{ color: characters.length ? theme.node.text : theme.node.muted }}>{characters.join("、") || "—"}</div></div>
                                    <div className="min-w-0 px-2 py-1.5"><div className="truncate" style={{ color: locationName ? theme.node.text : theme.node.muted }}>{locationName || "—"}</div></div>
                                    <div className="px-2 py-1.5"><FilmShotMediaBadges theme={theme} shot={entry.shot} compact /></div>
                                    <div className="flex justify-end px-2 py-1.5">
                                        <button type="button" className="grid size-6 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={(event) => { event.stopPropagation(); openShot(entry.shot.id); }} aria-label={`在 Studio 打开 ${payload?.shotNo || entry.shot.title}`}><ArrowUpRight className="size-3.5" /></button>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="grid place-items-center gap-2 px-4 py-16 text-sm" style={{ color: theme.node.muted }}>
                                <span>没有匹配的镜头</span>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onClick={() => changeFilter(() => { setSceneId("all"); setStatus("all"); setQuery(""); })}>清除筛选</button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid flex-1 place-items-center text-sm" style={{ color: theme.node.muted }}>还没有镜头，去 Studio 或画布新增。</div>
            )}
            <FilmShotSelectionBar theme={theme} count={selected.size} running={model.shotBatch.running} onGenerate={(kind) => model.onBatchGenerateShots([...selected], kind)} onClear={() => setSelected(new Set())} />
        </div>
    );
}
