"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { ImagePlus, Library, Package, Shirt, Trash2 } from "lucide-react";

import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import type { FilmAsset, FilmAssetKind, FilmProject } from "@/lib/film/types";
import { addFilmAsset, removeFilmAsset } from "../utils/film-edits";
import { createFilmImageSlot } from "../utils/film-image-slot";
import { latestFilmAssetPatch, latestFilmAssets } from "../utils/film-live-project";
import { FILM_COSTUME_VIEW_PRESETS, FILM_PROP_VIEW_PRESETS, type FilmViewPreset } from "../utils/film-view-presets";
import { useFilmDeleteConfirm } from "../hooks/use-film-delete-confirm";
import { useFilmAssetLibrary } from "../hooks/use-film-asset-library";
import { FilmAssetThumbnail } from "./film-asset-thumbnail";
import { FilmImageSlotEditor } from "./film-image-slot-editor";

type FilmPropCostumeWorkspaceProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    kind: "prop" | "costume";
    onGenerateAsset: (kind: FilmAssetKind, asset: FilmAsset) => void;
    onGenerateView: (kind: FilmAssetKind, asset: FilmAsset, preset: FilmViewPreset) => void;
    onStopAsset: () => void;
    generatingAssetId: string;
    focusAssetId?: string;
};

/** 道具与服装共用的设定工作台：概念图 + 结构视图。 */
export function FilmPropCostumeWorkspace({ project, onUpdate, kind, onGenerateAsset, onGenerateView, onStopAsset, generatingAssetId, focusAssetId }: FilmPropCostumeWorkspaceProps) {
    const { message } = App.useApp();
    const { confirmDelete } = useFilmDeleteConfirm();
    const assets = useMemo(() => (kind === "prop" ? project.props : project.costumes) || [], [kind, project.props, project.costumes]);
    const presets = kind === "prop" ? FILM_PROP_VIEW_PRESETS : FILM_COSTUME_VIEW_PRESETS;
    const label = FILM_ASSET_KIND_LABELS[kind];
    const [selectedId, setSelectedId] = useState("");
    const [importOpen, setImportOpen] = useState(false);
    const [viewPresetKey, setViewPresetKey] = useState(presets[0].key);
    const viewPreset = presets.find((preset) => preset.key === viewPresetKey) || presets[0];

    useEffect(() => {
        setViewPresetKey(presets[0].key);
    }, [kind, presets]);

    useEffect(() => {
        if (selectedId && assets.some((asset) => asset.id === selectedId)) return;
        setSelectedId(assets[0]?.id || "");
    }, [assets, selectedId]);

    useEffect(() => {
        if (!focusAssetId || !assets.some((asset) => asset.id === focusAssetId)) return;
        setSelectedId(focusAssetId);
    }, [focusAssetId, assets]);

    const selected = assets.find((asset) => asset.id === selectedId) || null;
    const { library, entryFor: libraryEntryFor, isOutdated: libraryOutdated, save: saveToLibrary, pull: pullFromLibrary, importToProject } = useFilmAssetLibrary(project.id, kind, assets, onUpdate);

    const importFromLibrary = (entry: FilmAsset) => {
        importToProject(entry, (next) => {
            setSelectedId(next[next.length - 1].id);
            setImportOpen(false);
        });
    };

    const updateList = (next: FilmAsset[]) => onUpdate(kind === "prop" ? { props: next } : { costumes: next });

    const createAsset = () => {
        const next = addFilmAsset(latestFilmAssets(project.id, kind)?.assets || assets, kind);
        updateList(next);
        setSelectedId(next[next.length - 1].id);
    };

    const updateSelected = (patch: Partial<FilmAsset>) => {
        if (!selected) return;
        const next = latestFilmAssetPatch(project.id, kind, selected.id, () => patch);
        if (next) onUpdate(next);
    };

    const removeSelected = () => {
        if (!selected) return;
        confirmDelete({
            title: `删除「${selected.name}」？`,
            description: kind === "prop" ? "删除后角色与镜头对这件道具的引用会失效。" : "删除后造型状态对这套服装的引用会失效。",
            detail: selected.description || `${label} · 未填写描述`,
            confirmText: `删除${label}`,
            onConfirm: () => {
                updateList(removeFilmAsset(latestFilmAssets(project.id, kind)?.assets || assets, selected.id));
                setSelectedId("");
                message.success(`已删除${label}`);
            },
        });
    };

    return (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_440px]">
            <section className="punk-panel flex max-h-[75dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                <div className="relative flex shrink-0 flex-wrap items-center gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                    <span className="eyebrow">{label}库</span>
                    <Button size="small" icon={<ImagePlus className="size-3.5" />} onClick={createAsset}>新建{label}</Button>
                    <Button size="small" icon={<Library className="size-3.5" />} onClick={() => setImportOpen(true)}>从库导入</Button>
                    <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{assets.length} {label}</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    {assets.length === 0 ? (
                        <p className="px-1 py-2 text-[11px] leading-5 text-muted-foreground/60">
                            {kind === "prop" ? "还没有道具。剧本解析里的关键道具会自动建成 idle 资产，也可以手动新建。" : "还没有服装。一套服装可以被多个角色与造型复用。"}
                        </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {assets.map((asset, index) => (
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
                                    <span className="mt-1 block font-mono text-[9px] text-muted-foreground/50">{asset.concept.images.length} 概念 · {asset.views?.images.length || 0} 视图</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="punk-panel flex max-h-[75dvh] flex-col overflow-hidden rounded-xl lg:max-h-none lg:min-h-0">
                <div className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/60 px-4 py-3">
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-acid/40 via-border/40 to-transparent" />
                    <span className="eyebrow">{label}详情</span>
                    {selected ? <span className="font-mono text-[10px] text-muted-foreground/70">{selected.status === "ready" ? "已有概念图" : "未生成"}</span> : null}
                </div>
                {selected ? (
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="grid gap-3">
                            <Field label="名称"><Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} /></Field>
                            <Field label="描述">
                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={selected.description} placeholder={kind === "prop" ? "外观、材质、尺寸、剧情作用" : "版型、配色、材质、时代"} onChange={(event) => updateSelected({ description: event.target.value })} />
                            </Field>
                            <Field label="视觉提示词"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={selected.visualPrompt} placeholder="留空则用名称和描述" onChange={(event) => updateSelected({ visualPrompt: event.target.value })} /></Field>
                            {selected.errorMessage ? <p className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">{selected.errorMessage}</p> : null}

                            <div className="grid gap-2 rounded-md border border-border/50 bg-background/25 p-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">概念图</span>
                                <FilmImageSlotEditor slot={selected.concept} onChange={(concept) => updateSelected({ concept })} disabled={generatingAssetId === selected.id} />
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button type="primary" size="small" loading={generatingAssetId === selected.id} disabled={selected.concept.locked} icon={kind === "prop" ? <Package className="size-3.5" /> : <Shirt className="size-3.5" />} onClick={() => onGenerateAsset(kind, selected)}>
                                        {selected.concept.images.length ? "重新生成概念图" : "生成概念图"}
                                    </Button>
                                    {generatingAssetId === selected.id ? <Button size="small" danger onClick={onStopAsset}>停止生成</Button> : null}
                                </div>
                            </div>

                            <div className="grid gap-2 rounded-md border border-border/50 bg-background/25 p-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">{kind === "prop" ? "结构视图" : "细节图"}</span>
                                <FilmImageSlotEditor slot={selected.views || createFilmImageSlot()} onChange={(views) => updateSelected({ views })} disabled={generatingAssetId === selected.id} />
                                <div className="flex items-center gap-2">
                                    <Select size="small" className="flex-1" value={viewPresetKey} options={presets.map((preset) => ({ value: preset.key, label: preset.label }))} onChange={setViewPresetKey} />
                                    <Button size="small" loading={generatingAssetId === selected.id} disabled={selected.views?.locked} onClick={() => onGenerateView(kind, selected, viewPreset)}>生成视图</Button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button size="small" icon={<Library className="size-3.5" />} onClick={() => void saveToLibrary(selected)}>{libraryEntryFor(selected) ? `更新${label}库` : `存入${label}库`}</Button>
                                {libraryEntryFor(selected) ? <Button size="small" onClick={() => void pullFromLibrary(selected)}>从库更新</Button> : null}
                                {libraryOutdated(selected) ? <span className="chip chip-acid">库有更新</span> : null}
                                <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={removeSelected}>删除{label}</Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <EmptyState
                        className="flex-1 py-10"
                        icon={kind === "prop" ? <Package className="size-5" /> : <Shirt className="size-5" />}
                        title={`还没有${label}`}
                        description={kind === "prop" ? "新建道具并生成概念图，镜头绑定道具后参考图会按优先级进入生成。" : "新建服装并生成设计图，角色造型引用后即可跨角色复用。"}
                        action={<Button size="small" type="primary" icon={<ImagePlus className="size-3.5" />} onClick={createAsset}>新建第一个{label}</Button>}
                    />
                )}
            </section>

            <Modal title={`从${label}库导入`} open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={680}>
                {library.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">{label}库还是空的，先在项目里生成并点「存入{label}库」。</p> : null}
                <div className="thin-scrollbar grid max-h-[60dvh] gap-2 overflow-y-auto sm:grid-cols-2">
                    {library.map((entry) => (
                        <button key={entry.id} type="button" onClick={() => importFromLibrary(entry)} className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/50 p-2 text-left transition-colors hover:border-acid/50">
                            <FilmAssetThumbnail asset={entry} className="size-12 shrink-0 rounded-md border border-border/60" />
                            <span className="min-w-0">
                                <span className="block truncate text-xs font-medium text-foreground">{entry.name}</span>
                                <span className="mt-0.5 line-clamp-1 block text-[10px] leading-4 text-muted-foreground/70">{entry.description || "未填写描述"}</span>
                                <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground/50">更新于 {new Date(entry.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
