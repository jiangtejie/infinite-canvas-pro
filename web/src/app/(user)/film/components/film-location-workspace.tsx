"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "antd";
import { ImagePlus, Library, MapPin, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";

import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import type { FilmAsset, FilmAssetKind, FilmLocationVariant, FilmProject } from "@/lib/film/types";
import { useFilmAssetLibrary } from "../hooks/use-film-asset-library";
import { addFilmAsset, removeFilmAsset } from "../utils/film-edits";
import { createFilmImageSlot } from "../utils/film-image-slot";
import { latestFilmAssetPatch, latestFilmAssets } from "../utils/film-live-project";
import { FILM_LOCATION_VIEW_PRESETS, type FilmViewPreset } from "../utils/film-view-presets";
import { useFilmDeleteConfirm } from "../hooks/use-film-delete-confirm";
import { FilmAssetThumbnail } from "./film-asset-thumbnail";
import { FilmImageSlotEditor } from "./film-image-slot-editor";

type FilmLocationWorkspaceProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateAsset: (kind: FilmAssetKind, asset: FilmAsset) => void;
    onGenerateView: (kind: FilmAssetKind, asset: FilmAsset, preset: FilmViewPreset) => void;
    onGenerateVariant: (asset: FilmAsset, variant: FilmLocationVariant) => void;
    onStopAsset: () => void;
    generatingAssetId: string;
    focusAssetId?: string;
};

function createVariant(index: number): FilmLocationVariant {
    return { id: nanoid(), name: `变体 ${index}`, timeOfDay: "", weather: "", mood: "", description: "", concept: createFilmImageSlot() };
}

export function FilmLocationWorkspace({ project, onUpdate, onGenerateAsset, onGenerateView, onGenerateVariant, onStopAsset, generatingAssetId, focusAssetId }: FilmLocationWorkspaceProps) {
    const { confirmDelete } = useFilmDeleteConfirm();
    const locations = useMemo(() => project.locations || [], [project.locations]);
    const [selectedId, setSelectedId] = useState("");
    const [importOpen, setImportOpen] = useState(false);
    const [viewPresetKey, setViewPresetKey] = useState(FILM_LOCATION_VIEW_PRESETS[0].key);
    const viewPreset = FILM_LOCATION_VIEW_PRESETS.find((preset) => preset.key === viewPresetKey) || FILM_LOCATION_VIEW_PRESETS[0];
    const { library: libraryLocations, entryFor: libraryEntryFor, isOutdated: libraryOutdated, save: saveToLibrary, pull: pullFromLibrary, importToProject } = useFilmAssetLibrary(project.id, "location", locations, onUpdate);

    useEffect(() => {
        if (selectedId && locations.some((asset) => asset.id === selectedId)) return;
        setSelectedId(locations[0]?.id || "");
    }, [locations, selectedId]);

    useEffect(() => {
        if (!focusAssetId || !locations.some((asset) => asset.id === focusAssetId)) return;
        setSelectedId(focusAssetId);
    }, [focusAssetId, locations]);

    const selected = locations.find((asset) => asset.id === selectedId) || null;
    const variants = selected?.location?.variants || [];

    const createLocation = () => {
        const next = addFilmAsset(latestFilmAssets(project.id, "location")?.assets || locations, "location");
        onUpdate({ locations: next });
        setSelectedId(next[next.length - 1].id);
    };

    const updateSelected = (patch: Partial<FilmAsset>) => {
        if (!selected) return;
        const next = latestFilmAssetPatch(project.id, "location", selected.id, () => patch);
        if (next) onUpdate(next);
    };

    const updateVariant = (variantId: string, patch: Partial<FilmLocationVariant>) => {
        if (!selected) return;
        updateSelected({ location: { variants: variants.map((variant) => variant.id === variantId ? { ...variant, ...patch } : variant) } });
    };

    const importFromLibrary = (asset: FilmAsset) => {
        importToProject(asset, (next) => {
            setSelectedId(next[next.length - 1].id);
            setImportOpen(false);
        });
    };

    const removeSelected = () => {
        if (!selected) return;
        confirmDelete({
            title: `删除「${selected.name}」？`,
            description: "删除后已有分镜里的场景引用会失效，但分镜本身不受影响。",
            detail: selected.description || "场景 · 未填写描述",
            confirmText: "删除场景",
            onConfirm: () => {
                onUpdate({ locations: removeFilmAsset(latestFilmAssets(project.id, "location")?.assets || locations, selected.id) });
                setSelectedId("");
            },
        });
    };

    return (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_440px]">
            <section className="punk-panel flex max-h-[75dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                <div className="relative flex shrink-0 flex-wrap items-center gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                    <span className="eyebrow">场景库</span>
                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={createLocation}>新建场景</Button>
                    <Button size="small" icon={<Library className="size-3.5" />} onClick={() => setImportOpen(true)}>从库导入</Button>
                    <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{locations.length} 场景</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    {locations.length === 0 ? <p className="px-1 py-2 text-[11px] leading-5 text-muted-foreground/60">还没有场景。新建一个并生成概念图，分镜生成时就能保持环境一致。</p> : null}
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {locations.map((asset, index) => (
                            <button
                                key={asset.id}
                                type="button"
                                onClick={() => setSelectedId(asset.id)}
                                style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}
                                className={cn("punk-card enter-up group flex flex-col overflow-hidden rounded-lg border text-left", selectedId === asset.id ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-acid/40")}
                            >
                                <div className="relative w-full overflow-hidden">
                                    <FilmAssetThumbnail asset={asset} className="h-24 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                                </div>
                                <span className="p-2.5">
                                    <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                                    <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-muted-foreground/70">{asset.description || "未填写描述"}</span>
                                    <span className="mt-1 block font-mono text-[9px] text-muted-foreground/50">{asset.concept.images.length} 概念 · {(asset.location?.variants || []).length} 变体</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="punk-panel flex max-h-[75dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                <div className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                    <span className="eyebrow">场景详情</span>
                    {selected ? <span className="font-mono text-[10px] text-muted-foreground/70">{selected.status === "ready" ? "已有概念图" : "未生成"}</span> : null}
                </div>
                {selected ? (
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="mt-0 grid gap-3">
                            <Field label="名称"><Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} /></Field>
                            <Field label="描述"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={selected.description} placeholder="地点、氛围、光线、时代" onChange={(event) => updateSelected({ description: event.target.value })} /></Field>
                            <Field label="视觉提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={selected.visualPrompt} placeholder="留空则用名称和描述" onChange={(event) => updateSelected({ visualPrompt: event.target.value })} /></Field>
                            {selected.errorMessage ? <p className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">{selected.errorMessage}</p> : null}

                            <div className="grid gap-2 rounded-md border border-border/50 bg-background/25 p-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">概念图</span>
                                <FilmImageSlotEditor slot={selected.concept} onChange={(concept) => updateSelected({ concept })} disabled={generatingAssetId === selected.id} />
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button type="primary" size="small" loading={generatingAssetId === selected.id} disabled={selected.concept.locked} icon={<ImagePlus className="size-3.5" />} onClick={() => onGenerateAsset("location", selected)}>
                                        {selected.concept.images.length ? "重新生成概念图" : "生成概念图"}
                                    </Button>
                                    {generatingAssetId === selected.id ? <Button size="small" danger onClick={onStopAsset}>停止生成</Button> : null}
                                </div>
                            </div>

                            <div className="grid gap-2 rounded-md border border-border/50 bg-background/25 p-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">结构视图</span>
                                <FilmImageSlotEditor slot={selected.views || createFilmImageSlot()} onChange={(views) => updateSelected({ views })} disabled={generatingAssetId === selected.id} />
                                <div className="flex items-center gap-2">
                                    <Select size="small" className="flex-1" value={viewPresetKey} options={FILM_LOCATION_VIEW_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))} onChange={setViewPresetKey} />
                                    <Button size="small" loading={generatingAssetId === selected.id} disabled={selected.views?.locked} onClick={() => onGenerateView("location", selected, viewPreset)}>生成视图</Button>
                                </div>
                                <p className="text-[11px] leading-5 text-muted-foreground/70">生成视图时会用概念图当前版本作参考，保持环境一致。</p>
                            </div>

                            <div className="grid gap-2 rounded-md border border-border/50 bg-background/25 p-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">气氛变体</span>
                                    <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={() => updateSelected({ location: { variants: [...variants, createVariant(variants.length + 1)] } })}>新建变体</Button>
                                </div>
                                {variants.length === 0 ? <p className="text-[11px] leading-5 text-muted-foreground/60">夜雨、黄昏、废墟等同一场景的不同状态，绑定到镜头后按变体取参考图。</p> : null}
                                {variants.map((variant) => (
                                    <div key={variant.id} className="grid gap-1.5 rounded-md border border-border/60 bg-background/30 p-2">
                                        <div className="flex items-center gap-1.5">
                                            <Input size="small" value={variant.name} placeholder="变体名，如 夜·雨" onChange={(event) => updateVariant(variant.id, { name: event.target.value })} />
                                            <Button type="text" size="small" danger className="!h-7 !w-7 !min-w-7 !p-0" icon={<Trash2 className="size-3.5" />} aria-label="删除变体" onClick={() => updateSelected({ location: { variants: variants.filter((item) => item.id !== variant.id) } })} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            <Input size="small" value={variant.timeOfDay || ""} placeholder="时间" onChange={(event) => updateVariant(variant.id, { timeOfDay: event.target.value })} />
                                            <Input size="small" value={variant.weather || ""} placeholder="天气" onChange={(event) => updateVariant(variant.id, { weather: event.target.value })} />
                                            <Input size="small" value={variant.mood || ""} placeholder="氛围" onChange={(event) => updateVariant(variant.id, { mood: event.target.value })} />
                                        </div>
                                        <Input size="small" value={variant.description} placeholder="变体说明" onChange={(event) => updateVariant(variant.id, { description: event.target.value })} />
                                        <FilmImageSlotEditor slot={variant.concept} onChange={(concept) => updateVariant(variant.id, { concept })} nextLabel={variant.name} disabled={generatingAssetId === selected.id} thumbClassName="h-12" />
                                        <div>
                                            <Button size="small" loading={generatingAssetId === selected.id} disabled={variant.concept.locked} icon={<ImagePlus className="size-3.5" />} onClick={() => onGenerateVariant(selected, variant)}>
                                                {variant.concept.images.length ? "重新生成变体图" : "生成变体图"}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Button size="small" icon={<Library className="size-3.5" />} onClick={() => void saveToLibrary(selected)}>{libraryEntryFor(selected) ? "更新场景库" : "存入场景库"}</Button>
                                {libraryEntryFor(selected) ? <Button size="small" onClick={() => void pullFromLibrary(selected)}>从库更新</Button> : null}
                                {libraryOutdated(selected) ? <span className="chip chip-acid">库有更新</span> : null}
                                <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={removeSelected}>删除</Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <EmptyState
                        className="flex-1 py-10"
                        icon={<MapPin className="size-5" />}
                        title="还没有场景"
                        description="先新建场景，再生成概念图。"
                        action={<Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={createLocation}>新建第一个场景</Button>}
                    />
                )}
            </section>

            <Modal title="从场景库导入" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={680}>
                {libraryLocations.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">场景库还是空的，先在项目里生成并点「存入场景库」。</p> : null}
                <div className="thin-scrollbar grid max-h-[60dvh] gap-2 overflow-y-auto sm:grid-cols-2">
                    {libraryLocations.map((asset) => (
                        <button key={asset.id} type="button" onClick={() => importFromLibrary(asset)} className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/50 p-2 text-left transition-colors hover:border-acid/50">
                            <FilmAssetThumbnail asset={asset} className="size-12 shrink-0 rounded-md border border-border/60" />
                            <span className="min-w-0">
                                <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                                <span className="mt-0.5 line-clamp-1 block text-[10px] leading-4 text-muted-foreground/70">{asset.description || "未填写描述"}</span>
                                <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground/50">更新于 {new Date(asset.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
