"use client";

import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Select } from "antd";
import { ArrowUpRight, ChevronDown, ChevronUp, Clapperboard, Search } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useFilmViewState, useFilmViewStore, type FilmViewState } from "@/app/(user)/canvas/stores/use-film-view-store";
import { patchFilmShotNode } from "../lib/film-node-patch";
import type { FilmShotNodeData } from "../../types";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { filterFilmShotEntries, filmShotViewStats, type FilmShotMediaFilter } from "../lib/film-shot-views";
import { FilmCameraMovementControl, FilmShotTypeControl, FilmTransitionControl } from "./film-shot-basic-controls";
import { FilmShotMediaBadges } from "./film-shot-media-badges";
import { FilmShotProfessionalFields } from "./film-shot-professional-fields";
import { FilmShotSelectionBar } from "./film-shot-selection-bar";

const COLUMNS = "36px 64px 118px 92px 112px 56px minmax(190px,1.6fr) minmax(150px,1.2fr) minmax(110px,0.9fr) minmax(90px,0.65fr) minmax(100px,0.7fr) minmax(100px,0.7fr) minmax(100px,0.7fr) 92px 78px 76px";
const TABLE_MIN_WIDTH = 1564;
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
    const viewState = useFilmViewState(model.projectId);
    const updateView = useFilmViewStore((state) => state.update);
    const sceneId = viewState.tableSceneId;
    const status = viewState.tableStatus;
    const query = viewState.tableQuery;
    const expanded = viewState.expandedShotIds;
    const selected = useMemo(() => {
        const valid = new Set(model.shots.map((entry) => entry.shot.id));
        return new Set([...viewState.selectedShotIds].filter((id) => valid.has(id)));
    }, [model.shots, viewState.selectedShotIds]);
    const selectAllRef = useRef<HTMLInputElement>(null);
    const filteredShots = useMemo(() => filterFilmShotEntries(model.shots, { sceneId, status, query }), [model.shots, query, sceneId, status]);
    const allSelected = filteredShots.length > 0 && filteredShots.every((entry) => selected.has(entry.shot.id));
    const sceneOptions = [{ value: "all", label: "全部场次" }, ...model.scenes.map((scene) => ({ value: scene.id, label: scene.label }))];
    const update = (shotId: string, patch: Partial<FilmShotNodeData>) => model.onUpdateShot(shotId, (node) => patchFilmShotNode(node, patch));
    const openShot = (shotId: string) => {
        model.onSelectShot(shotId);
        model.onViewChange("studio");
    };
    const toggleSelected = (shotId: string) => updateView(model.projectId, (current) => {
        const next = new Set(current.selectedShotIds);
        if (next.has(shotId)) next.delete(shotId);
        else next.add(shotId);
        return { ...current, selectedShotIds: next };
    });
    const toggleExpanded = (shotId: string) => updateView(model.projectId, (current) => {
        const next = new Set(current.expandedShotIds);
        const closing = next.has(shotId);
        next.clear();
        if (!closing) next.add(shotId);
        return { ...current, expandedShotIds: next };
    });
    const toggleAll = () => updateView(model.projectId, (current) => {
        const next = new Set(current.selectedShotIds);
        if (allSelected) filteredShots.forEach((entry) => next.delete(entry.shot.id));
        else filteredShots.forEach((entry) => next.add(entry.shot.id));
        return { ...current, selectedShotIds: next };
    });
    const changeFilter = (patch: Partial<Pick<FilmViewState, "tableSceneId" | "tableStatus" | "tableQuery">>) => updateView(model.projectId, (current) => ({ ...current, ...patch, selectedShotIds: new Set() }));
    const clearSelection = () => updateView(model.projectId, (current) => ({ ...current, selectedShotIds: new Set() }));

    useEffect(() => {
        if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
    }, [allSelected, selected]);

    return (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.node.stroke }}>
                <Clapperboard className="size-4" style={{ color: theme.node.muted }} />
                <span className="text-sm font-medium" style={{ color: theme.node.text }}>镜头表</span>
                {[`${stats.shots} 镜`, `${stats.scenes} 场`, `${stats.duration}s`, `已出图 ${stats.images}`, `已出视频 ${stats.videos}`].map((label) => (
                    <span key={label} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{label}</span>
                ))}
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" style={{ color: theme.node.muted }} />
                        <input className="w-[200px] rounded-md border bg-transparent py-1 pl-7 pr-2 text-xs outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} placeholder="搜索镜号/描述/台词/声音" value={query} onChange={(event) => changeFilter({ tableQuery: event.target.value })} aria-label="搜索镜头" />
                    </div>
                    <Select size="small" variant="borderless" className="w-[140px]" value={sceneId} options={sceneOptions} onChange={(value) => changeFilter({ tableSceneId: value })} aria-label="筛选场次" />
                    <Select size="small" variant="borderless" className="w-[120px]" value={status} options={STATUS_OPTIONS} onChange={(value) => changeFilter({ tableStatus: value })} aria-label="筛选状态" />
                </div>
            </div>
            {model.shots.length ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
                    <div style={{ minWidth: TABLE_MIN_WIDTH, "--film-row-hover": theme.node.fill } as CSSProperties}>
                        <div className="sticky top-0 z-10 grid border-b text-[11px] font-medium" style={{ gridTemplateColumns: COLUMNS, borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted }}>
                            <div className="grid place-items-center px-2 py-2">
                                <input ref={selectAllRef} type="checkbox" className="size-4" checked={allSelected} onChange={toggleAll} aria-label="全选镜头" />
                            </div>
                            {["镜号", "场次", "景别", "运镜", "时长", "画面描述", "台词", "角色", "道具", "场景", "影像", "声音", "转场", "媒体", "操作"].map((label) => <div key={label} className="px-2 py-2">{label}</div>)}
                        </div>
                        {filteredShots.length ? filteredShots.map((entry) => {
                            const payload = entry.shot.metadata?.filmShot;
                            const bindings = model.bindingsByShot[entry.shot.id] ?? [];
                            const characters = bindings.filter((binding) => binding.kind === "character").map((binding) => `${binding.name}${binding.stateName ? ` · ${binding.stateName}` : ""}`);
                            const emotion = bindings.flatMap((binding) => binding.kind === "character" ? [binding.continuity?.emotion] : []).find(Boolean) || payload?.performance?.emotion || "";
                            const props = bindings.filter((binding) => binding.kind === "prop").map((binding) => binding.name);
                            const locationBinding = bindings.find((binding) => binding.kind === "location");
                            const imageNotes = [payload?.lens, payload?.composition, payload?.lighting, payload?.colorTone].filter(Boolean).join(" · ");
                            const soundNotes = [payload?.audio, payload?.soundDesign?.ambience, payload?.soundDesign?.sfx, payload?.soundDesign?.music, payload?.soundDesign?.dialogueTone].filter(Boolean).join(" · ");
                            const active = entry.shot.id === activeId;
                            const isExpanded = expanded.has(entry.shot.id);
                            return (
                                <Fragment key={entry.shot.id}>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="grid cursor-default items-center border-b text-xs transition-colors hover:bg-[var(--film-row-hover)]"
                                        style={{ gridTemplateColumns: COLUMNS, borderColor: theme.node.stroke, background: active ? theme.canvas.selectionSoft : undefined, color: theme.node.text }}
                                        onClick={() => model.onSelectShot(entry.shot.id)}
                                        onDoubleClick={(event) => {
                                            if ((event.target as HTMLElement).closest("input, textarea, select, button, label")) return;
                                            openShot(entry.shot.id);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== "Enter" || (event.target as HTMLElement).closest("input, textarea, select, button, label")) return;
                                            openShot(entry.shot.id);
                                        }}
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
                                            <FilmShotTypeControl variant="table" value={payload?.shotType} style={{ color: theme.node.text }} onChange={(value) => update(entry.shot.id, { shotType: value })} ariaLabel="景别" />
                                        </div>
                                        <div className="px-2 py-1.5"><FilmCameraMovementControl variant="table" value={payload?.cameraMovement} style={{ color: theme.node.text }} onChange={(value) => update(entry.shot.id, { cameraMovement: value })} ariaLabel="运镜" /></div>
                                        <div className="px-2 py-1.5"><input type="number" min={1} max={60} className="w-12 bg-transparent px-0.5 py-0.5 outline-none tabular-nums" style={{ color: theme.node.text }} value={payload?.duration ?? 4} onChange={(event) => update(entry.shot.id, { duration: Number(event.target.value) || 1 })} aria-label="时长" /></div>
                                        <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.description || ""} onChange={(event) => update(entry.shot.id, { description: event.target.value })} aria-label="描述" /></div>
                                        <div className="px-2 py-1.5"><input className="w-full bg-transparent px-0.5 py-0.5 outline-none" style={{ color: theme.node.text }} value={payload?.dialogue || ""} onChange={(event) => update(entry.shot.id, { dialogue: event.target.value })} aria-label="台词" /></div>
                                        <div className="min-w-0 px-2 py-1.5">
                                            <div className="truncate" title={characters.join("、")} style={{ color: characters.length ? theme.node.text : theme.node.muted }}>{characters.join("、") || "—"}</div>
                                            {emotion ? <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>情绪 · {emotion}</div> : null}
                                        </div>
                                        <div className="min-w-0 px-2 py-1.5"><div className="truncate" title={props.join("、")} style={{ color: props.length ? theme.node.text : theme.node.muted }}>{props.join("、") || "—"}</div></div>
                                        <div className="min-w-0 px-2 py-1.5">
                                            <div className="truncate" title={locationBinding?.name || ""} style={{ color: locationBinding?.name ? theme.node.text : theme.node.muted }}>{locationBinding?.name || "—"}</div>
                                            {locationBinding?.variantName ? <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>{locationBinding.variantName}</div> : null}
                                        </div>
                                        <div className="min-w-0 px-2 py-1.5"><div className="truncate" title={imageNotes} style={{ color: imageNotes ? theme.node.text : theme.node.muted }}>{imageNotes || "—"}</div></div>
                                        <div className="min-w-0 px-2 py-1.5"><div className="truncate" title={soundNotes} style={{ color: soundNotes ? theme.node.text : theme.node.muted }}>{soundNotes || "—"}</div></div>
                                        <div className="px-2 py-1.5"><FilmTransitionControl variant="table" value={payload?.transition} style={{ color: theme.node.text }} onChange={(value) => update(entry.shot.id, { transition: value })} ariaLabel="转场" /></div>
                                        <div className="px-2 py-1.5"><FilmShotMediaBadges theme={theme} shot={entry.shot} compact /></div>
                                        <div className="flex justify-end gap-1 px-2 py-1.5">
                                            <button type="button" className="grid size-6 place-items-center rounded border" style={{ borderColor: isExpanded ? theme.canvas.selectionStroke : theme.node.stroke, color: isExpanded ? theme.node.text : theme.node.muted }} onClick={(event) => { event.stopPropagation(); toggleExpanded(entry.shot.id); }} aria-label={isExpanded ? "收起专业详情" : "展开专业详情"} title={isExpanded ? "收起专业详情" : "展开专业详情"} aria-expanded={isExpanded}>
                                                {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                            </button>
                                            <button type="button" className="grid size-6 place-items-center rounded border" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={(event) => { event.stopPropagation(); openShot(entry.shot.id); }} aria-label={`在 Studio 打开 ${payload?.shotNo || entry.shot.title}`} title="在 Studio 打开">
                                                <ArrowUpRight className="size-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    {isExpanded ? <FilmShotProfessionalFields theme={theme} payload={payload} onUpdate={(patch) => update(entry.shot.id, patch)} onClose={() => toggleExpanded(entry.shot.id)} /> : null}
                                </Fragment>
                            );
                        }) : (
                            <div className="grid place-items-center gap-2 px-4 py-16 text-sm" style={{ color: theme.node.muted }}>
                                <span>没有匹配的镜头</span>
                                <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onClick={() => changeFilter({ tableSceneId: "all", tableStatus: "all", tableQuery: "" })}>清除筛选</button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid flex-1 place-items-center text-sm" style={{ color: theme.node.muted }}>还没有镜头，去 Studio 或画布新增。</div>
            )}
            <FilmShotSelectionBar theme={theme} count={selected.size} running={model.shotBatch.running} onGenerate={(kind) => model.onBatchGenerateShots([...selected], kind)} onClear={clearSelection} />
        </div>
    );
}

