"use client";

import { useEffect, useMemo, useState } from "react";
import { Library, Search, X } from "lucide-react";
import { Input, Modal } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { FilmAssetThumbnail } from "@/app/(user)/film/components/film-asset-thumbnail";
import { EMPTY_FILM_LIBRARY_USAGE } from "@/app/(user)/film/utils/film-library";
import { filmCanvasLibraryUsageIndex } from "../lib/film-library-usage";

export function FilmLibraryPickerDialog({ open, theme, kind, currentAssetName, onClose, onReplace, onImport }: {
    open: boolean;
    theme: CanvasTheme;
    kind: FilmAssetKind;
    currentAssetName?: string;
    onClose: () => void;
    onReplace?: (entry: FilmAsset) => void;
    onImport: (entry: FilmAsset) => void;
}) {
    const hydrated = useFilmCastStore((state) => state.hydrated);
    const characters = useFilmCastStore((state) => state.characters);
    const locations = useFilmCastStore((state) => state.locations);
    const props = useFilmCastStore((state) => state.props);
    const costumes = useFilmCastStore((state) => state.costumes);
    const styles = useFilmCastStore((state) => state.styles);
    const projects = useCanvasStore((state) => state.projects);
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const lists: Record<FilmAssetKind, FilmAsset[]> = { character: characters, location: locations, prop: props, costume: costumes, style: styles };
    const list = lists[kind];
    const keyword = search.trim().toLowerCase();
    const filtered = keyword ? list.filter((asset) => [asset.name, ...asset.aliases, ...(asset.tags || [])].join(" ").toLowerCase().includes(keyword)) : list;
    const usageIndex = useMemo(() => filmCanvasLibraryUsageIndex(projects, kind), [kind, projects]);
    const selected = list.find((asset) => asset.id === selectedId) ?? null;
    useEffect(() => {
        if (!open) return;
        setSearch("");
        setSelectedId(list[0]?.id || "");
    }, [open, list]);
    const usage = selected ? usageIndex.get(selected.id) || EMPTY_FILM_LIBRARY_USAGE : null;
    const inputStyle = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    return (
        <Modal open={open} onCancel={onClose} footer={null} closable={false} centered width="min(1100px, 96vw)" mask={{ closable: false }} destroyOnHidden styles={{ body: { padding: 0, background: theme.node.panel, border: `1px solid ${theme.node.stroke}`, borderRadius: 16, overflow: "hidden" } }}>
            <div className="flex flex-col" style={{ color: theme.node.text }}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="min-w-0">
                        <div className="text-base font-semibold">{currentAssetName ? `从母版库选择${FILM_ASSET_KIND_LABELS[kind]}` : `导入${FILM_ASSET_KIND_LABELS[kind]}母版`}</div>
                        <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>{currentAssetName ? `替换「${currentAssetName}」或导入为新资产节点；项目副本与库条目互相独立。` : "导入为独立项目副本；后续可继续编辑或写回母版库。"}</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭母版库选择"><X className="size-4" /></button>
                </div>
                <div className="border-b px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <Input allowClear prefix={<Search className="size-3.5 opacity-50" />} placeholder="搜索名称 / 别名 / 标签" value={search} onChange={(event) => setSearch(event.target.value)} style={inputStyle} />
                </div>
                <div className="thin-scrollbar max-h-[52vh] min-h-[180px] overflow-y-auto px-5 py-4">
                    {!hydrated ? <div className="grid min-h-[140px] place-items-center text-xs" style={{ color: theme.node.muted }}>正在加载母版库…</div> : null}
                    {hydrated && !filtered.length ? (
                        <div className="grid min-h-[140px] place-items-center gap-2 text-center text-xs" style={{ color: theme.node.muted }}>
                            <Library className="size-5" />
                            <span>{list.length ? "没有匹配的条目。" : `${FILM_ASSET_KIND_LABELS[kind]}库还是空的，先在资产检查器里点「存入母版库」。`}</span>
                        </div>
                    ) : null}
                    {filtered.length ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                            {filtered.map((asset) => {
                                const usage = usageIndex.get(asset.id) || EMPTY_FILM_LIBRARY_USAGE;
                                const active = asset.id === selectedId;
                                return (
                                    <button key={asset.id} type="button" className="flex min-w-0 items-center gap-2 rounded-lg border p-2 text-left" style={{ borderColor: active ? theme.canvas.selectionStroke : theme.node.stroke, background: active ? theme.canvas.selectionSoft : theme.node.fill }} onClick={() => setSelectedId(asset.id)} aria-pressed={active}>
                                        <FilmAssetThumbnail asset={asset} className="h-12 w-12 shrink-0 rounded-md" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs" style={{ color: theme.node.text }}>{asset.name}</span>
                                            <span className="mt-0.5 block truncate text-[10px]" style={{ color: theme.node.muted }}>{usage.projects} 项目 · {usage.copies} 副本 · {usage.bindings} 引用</span>
                                            <span className="mt-0.5 block truncate text-[10px]" style={{ color: theme.node.muted }}>更新 {formatTime(asset.updatedAt)}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="min-w-0 truncate text-[11px]" style={{ color: theme.node.muted }}>{selected && usage ? `${selected.name} · ${usage.projects} 个项目使用 · ${usage.bindings} 处引用` : "选择一个库条目"}</span>
                    <div className="flex shrink-0 gap-2">
                        <button type="button" className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} onClick={onClose}>取消</button>
                        {kind !== "costume" && !(kind === "style" && currentAssetName) ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill }} disabled={!selected} onClick={() => selected && onImport(selected)}>导入为新资产节点</button> : null}
                        {currentAssetName && onReplace ? <button type="button" className="rounded-full border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: theme.canvas.selectionStroke, color: theme.node.text, background: theme.canvas.selectionSoft }} disabled={!selected} onClick={() => selected && onReplace(selected)}>替换当前资产</button> : null}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
