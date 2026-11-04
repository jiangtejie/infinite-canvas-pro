"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { ImagePlus, Library, MapPin, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmAsset, FilmAssetKind, FilmProject } from "../types";
import { useFilmCastStore } from "../stores/use-film-cast-store";
import { addFilmAsset, importFilmAsset, removeFilmAsset, updateFilmAsset } from "../utils/film-edits";
import { FILM_LOCATION_VIEW_PRESETS, type FilmViewPreset } from "../utils/film-view-presets";
import { FilmAssetThumbnail, FilmImageThumbnail } from "./film-asset-thumbnail";

type FilmLocationWorkspaceProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateAsset: (asset: FilmAsset, kind: FilmAssetKind) => void;
    onGenerateView: (asset: FilmAsset, kind: FilmAssetKind, preset: FilmViewPreset) => void;
    generatingAssetId: string;
};

export function FilmLocationWorkspace({ project, onUpdate, onGenerateAsset, onGenerateView, generatingAssetId }: FilmLocationWorkspaceProps) {
    const { modal, message } = App.useApp();
    const locations = project.locations || [];
    const libraryLocations = useFilmCastStore((state) => state.locations);
    const addLibraryAsset = useFilmCastStore((state) => state.addAsset);
    const [selectedId, setSelectedId] = useState("");
    const [importOpen, setImportOpen] = useState(false);
    const [viewPresetKey, setViewPresetKey] = useState(FILM_LOCATION_VIEW_PRESETS[0].key);
    const viewPreset = FILM_LOCATION_VIEW_PRESETS.find((preset) => preset.key === viewPresetKey) || FILM_LOCATION_VIEW_PRESETS[0];

    useEffect(() => {
        if (selectedId && locations.some((asset) => asset.id === selectedId)) return;
        setSelectedId(locations[0]?.id || "");
    }, [locations, selectedId]);

    const selected = locations.find((asset) => asset.id === selectedId) || null;

    const createLocation = () => {
        const next = addFilmAsset(locations, "location");
        onUpdate({ locations: next });
        setSelectedId(next[next.length - 1].id);
    };

    const updateSelected = (patch: Partial<FilmAsset>) => {
        if (!selected) return;
        onUpdate({ locations: updateFilmAsset(locations, selected.id, patch) });
    };

    const saveToLibrary = () => {
        if (!selected) return;
        addLibraryAsset("location", selected);
        message.success("已存入场景库");
    };

    const importFromLibrary = (asset: FilmAsset) => {
        const next = importFilmAsset(locations, asset);
        onUpdate({ locations: next });
        setSelectedId(next[next.length - 1].id);
        setImportOpen(false);
        message.success("已导入当前项目");
    };

    const removeSelected = () => {
        if (!selected) return;
        modal.confirm({
            title: `删除「${selected.name}」？`,
            content: "删除后已有分镜里的场景引用会失效，但分镜本身不受影响。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                onUpdate({ locations: removeFilmAsset(locations, selected.id) });
                setSelectedId("");
            },
        });
    };

    const cards = useMemo(() => locations, [locations]);

    return (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section className="flex max-h-[75vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">场景库</span>
                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={createLocation}>新建场景</Button>
                    <Button size="small" icon={<Library className="size-3.5" />} onClick={() => setImportOpen(true)}>从库导入</Button>
                    <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{locations.length} 场景</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    {cards.length === 0 ? <p className="px-1 py-2 text-[11px] leading-5 text-muted-foreground/60">还没有场景。新建一个并生成概念图，分镜生成时就能保持环境一致。</p> : null}
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {cards.map((asset) => (
                            <button
                                key={asset.id}
                                type="button"
                                onClick={() => setSelectedId(asset.id)}
                                className={cn("group flex flex-col overflow-hidden rounded-lg border text-left transition-colors", selectedId === asset.id ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-border")}
                            >
                                <FilmAssetThumbnail asset={asset} className="h-20 w-full" />
                                <span className="p-2.5">
                                    <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                                    <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-muted-foreground/70">{asset.description || "未填写描述"}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="flex max-h-[75vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">场景详情</span>
                    {selected ? <span className="font-mono text-[10px] text-muted-foreground/70">{selected.status === "ready" ? "已有概念图" : "未生成"}</span> : null}
                </div>
                {selected ? (
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                        <FilmAssetThumbnail asset={selected} className="h-44 w-full rounded-lg border border-border/60" />
                        <div className="mt-4 grid gap-3">
                            <Field label="名称"><Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} /></Field>
                            <Field label="描述"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={selected.description} placeholder="地点、氛围、光线、时代" onChange={(event) => updateSelected({ description: event.target.value })} /></Field>
                            <Field label="视觉提示词"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={selected.visualPrompt} placeholder="留空则用名称和描述" onChange={(event) => updateSelected({ visualPrompt: event.target.value })} /></Field>
                            {selected.errorMessage ? <p className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">{selected.errorMessage}</p> : null}
                            {selected.views?.length ? (
                                <div className="grid gap-2">
                                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视图设定</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selected.views.map((view) => (
                                            <div key={view.id} className="relative overflow-hidden rounded-md border border-border/60">
                                                <FilmImageThumbnail url={view.imageUrl} storageKey={view.storageKey} alt={view.label} className="h-24 w-full" />
                                                <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-foreground/80">{view.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <div className="grid gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">生成视图</span>
                                <div className="flex items-center gap-2">
                                    <Select size="small" className="flex-1" value={viewPresetKey} options={FILM_LOCATION_VIEW_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))} onChange={setViewPresetKey} />
                                    <Button size="small" loading={generatingAssetId === selected.id} onClick={() => onGenerateView(selected, "location", viewPreset)}>生成视图</Button>
                                </div>
                                <p className="text-[11px] leading-5 text-muted-foreground/70">生成视图时会用主概念图作为参考，保持环境一致。</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Button type="primary" size="small" loading={generatingAssetId === selected.id} icon={<ImagePlus className="size-3.5" />} onClick={() => onGenerateAsset(selected, "location")}>
                                    {selected.imageUrl ? "重新生成概念图" : "生成概念图"}
                                </Button>
                                <Button size="small" icon={<Library className="size-3.5" />} onClick={saveToLibrary}>存入场景库</Button>
                                <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={removeSelected}>删除</Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                        <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                            <MapPin className="size-5" />
                        </div>
                        <p className="mt-4 text-sm text-foreground">还没有场景</p>
                        <p className="mt-1.5 text-xs leading-6 text-muted-foreground">点「新建场景」开始。</p>
                    </div>
                )}
            </section>

            <Modal title="从场景库导入" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={680}>
                {libraryLocations.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">场景库还是空的，先在项目里生成并点「存入场景库」。</p> : null}
                <div className="thin-scrollbar grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
                    {libraryLocations.map((asset) => (
                        <button key={asset.id} type="button" onClick={() => importFromLibrary(asset)} className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/50 p-2 text-left transition-colors hover:border-acid/50">
                            <FilmImageThumbnail url={asset.imageUrl} storageKey={asset.storageKey} alt={asset.name} className="size-12 shrink-0 rounded-md border border-border/60" />
                            <span className="min-w-0">
                                <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                                <span className="mt-0.5 line-clamp-1 block text-[10px] leading-4 text-muted-foreground/70">{asset.description || "未填写描述"}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">{label}</span>
            {children}
        </div>
    );
}
