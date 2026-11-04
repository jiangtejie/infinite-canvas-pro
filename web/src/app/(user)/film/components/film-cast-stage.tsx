"use client";

import { useEffect, useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { ImagePlus, Library, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmAsset, FilmAssetKind, FilmProject } from "../types";
import { useFilmCastStore } from "../stores/use-film-cast-store";
import { addFilmAsset, importFilmAsset, removeFilmAsset, updateFilmAsset } from "../utils/film-edits";
import { FILM_CHARACTER_VIEW_PRESETS, type FilmViewPreset } from "../utils/film-view-presets";
import { FilmAssetThumbnail, FilmImageThumbnail } from "./film-asset-thumbnail";

type Selection = { kind: FilmAssetKind; id: string };

type FilmCastStageProps = {
    project: FilmProject;
    onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    onGenerateAsset: (asset: FilmAsset, kind: FilmAssetKind) => void;
    onGenerateView: (asset: FilmAsset, preset: FilmViewPreset) => void;
    generatingAssetId: string;
};

export function FilmCastStage({ project, onUpdate, onGenerateAsset, onGenerateView, generatingAssetId }: FilmCastStageProps) {
    const { modal, message } = App.useApp();
    const characters = project.characters || [];
    const locations = project.locations || [];
    const libraryCharacters = useFilmCastStore((state) => state.characters);
    const libraryLocations = useFilmCastStore((state) => state.locations);
    const addLibraryAsset = useFilmCastStore((state) => state.addAsset);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [viewPresetKey, setViewPresetKey] = useState(FILM_CHARACTER_VIEW_PRESETS[0].key);
    const viewPreset = FILM_CHARACTER_VIEW_PRESETS.find((preset) => preset.key === viewPresetKey) || FILM_CHARACTER_VIEW_PRESETS[0];

    useEffect(() => {
        if (selection) {
            const list = selection.kind === "character" ? characters : locations;
            if (list.some((asset) => asset.id === selection.id)) return;
        }
        const firstCharacter = characters[0];
        if (firstCharacter) {
            setSelection({ kind: "character", id: firstCharacter.id });
            return;
        }
        const firstLocation = locations[0];
        if (firstLocation) {
            setSelection({ kind: "location", id: firstLocation.id });
            return;
        }
        setSelection(null);
    }, [characters, locations, selection]);

    const selected = selection
        ? (selection.kind === "character" ? characters : locations).find((asset) => asset.id === selection.id) ?? null
        : null;

    const createAsset = (kind: FilmAssetKind) => {
        const next = addFilmAsset(kind === "character" ? characters : locations, kind);
        const created = next[next.length - 1];
        onUpdate(kind === "character" ? { characters: next } : { locations: next });
        setSelection({ kind, id: created.id });
    };

    const updateSelected = (patch: Partial<FilmAsset>) => {
        if (!selection) return;
        onUpdate(selection.kind === "character"
            ? { characters: updateFilmAsset(characters, selection.id, patch) }
            : { locations: updateFilmAsset(locations, selection.id, patch) });
    };

    const saveToLibrary = () => {
        if (!selection || !selected) return;
        addLibraryAsset(selection.kind, selected);
        message.success(selection.kind === "character" ? "已存入角色库" : "已存入场景库");
    };

    const importFromLibrary = (kind: FilmAssetKind, asset: FilmAsset) => {
        const next = importFilmAsset(kind === "character" ? characters : locations, asset);
        onUpdate(kind === "character" ? { characters: next } : { locations: next });
        setSelection({ kind, id: next[next.length - 1].id });
        setImportOpen(false);
        message.success("已导入当前项目");
    };

    const removeSelected = () => {
        if (!selection || !selected) return;
        modal.confirm({
            title: `删除「${selected.name}」？`,
            content: "删除后已有分镜里的引用会失效，但分镜本身不受影响。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                onUpdate(selection.kind === "character"
                    ? { characters: removeFilmAsset(characters, selection.id) }
                    : { locations: removeFilmAsset(locations, selection.id) });
                setSelection(null);
            },
        });
    };

    return (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section className="flex max-h-[75vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">角色与场景</span>
                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => createAsset("character")}>新建角色</Button>
                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => createAsset("location")}>新建场景</Button>
                    <Button size="small" icon={<Library className="size-3.5" />} onClick={() => setImportOpen(true)}>从库导入</Button>
                    <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{characters.length} 角色 / {locations.length} 场景</span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    <AssetSection
                        title="角色库"
                        kind="character"
                        assets={characters}
                        selection={selection}
                        onSelect={(id) => setSelection({ kind: "character", id })}
                        empty="还没有角色。新建角色并生成设定图，分镜生成时就能引用这个形象。"
                    />
                    <AssetSection
                        title="场景库"
                        kind="location"
                        assets={locations}
                        selection={selection}
                        onSelect={(id) => setSelection({ kind: "location", id })}
                        empty="还没有场景。新建场景并生成概念图，分镜生成时就能保持环境一致。"
                    />
                </div>
            </section>

            <section className="flex max-h-[75vh] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 lg:max-h-none lg:min-h-0">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                    <span className="eyebrow">{selection?.kind === "location" ? "场景详情" : "角色详情"}</span>
                    {selected ? <span className="font-mono text-[10px] text-muted-foreground/70">{generatingAssetId === selected.id ? "生成中" : selected.status === "ready" ? "已有设定图" : "未生成"}</span> : null}
                </div>
                {selected ? (
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                        <FilmAssetThumbnail asset={selected} className="h-44 w-full rounded-lg border border-border/60" />
                        <div className="mt-4 grid gap-3">
                            <Field label="名称">
                                <Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} />
                            </Field>
                            <Field label="描述">
                                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={selected.description} placeholder="身份、背景、外貌特征" onChange={(event) => updateSelected({ description: event.target.value })} />
                            </Field>
                            <Field label="视觉提示词">
                                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={selected.visualPrompt} placeholder="用于生成设定图的补充描述，留空则用名称和描述" onChange={(event) => updateSelected({ visualPrompt: event.target.value })} />
                            </Field>
                            {selected.views?.length ? (
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视图设定</span>
                                        <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{selected.views.length} 张</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selected.views.map((view) => (
                                            <div key={view.id} className="relative overflow-hidden rounded-md border border-border/60">
                                                <FilmImageThumbnail url={view.imageUrl} storageKey={view.storageKey} alt={view.label} className="h-24 w-full" />
                                                <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-foreground/80">{view.label}</span>
                                                <button
                                                    type="button"
                                                    aria-label={`删除${view.label}`}
                                                    className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-background/80 text-muted-foreground transition-colors hover:text-hot"
                                                    onClick={() => updateSelected({ views: (selected.views || []).filter((item) => item.id !== view.id) })}
                                                >
                                                    <Trash2 className="size-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {selected.errorMessage ? <p className="rounded-md border border-hot/30 bg-hot/5 px-2.5 py-2 text-[11px] leading-5 text-hot">{selected.errorMessage}</p> : null}
                            <div className="grid gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">生成视图</span>
                                <div className="flex items-center gap-2">
                                    <Select size="small" className="flex-1" value={viewPresetKey} options={FILM_CHARACTER_VIEW_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))} onChange={setViewPresetKey} />
                                    <Button size="small" loading={generatingAssetId === selected.id} onClick={() => onGenerateView(selected, viewPreset)}>
                                        生成视图
                                    </Button>
                                </div>
                                <p className="text-[11px] leading-5 text-muted-foreground/70">生成视图时会用主设定图作为参考，保持形象一致。</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Button
                                    type="primary"
                                    size="small"
                                    loading={generatingAssetId === selected.id}
                                    icon={<ImagePlus className="size-3.5" />}
                                    onClick={() => onGenerateAsset(selected, selection?.kind || "character")}
                                >
                                    {selected.imageUrl ? "重新生成设定图" : "生成设定图"}
                                </Button>
                                <Button size="small" icon={<Library className="size-3.5" />} onClick={saveToLibrary}>存入{selection?.kind === "location" ? "场景库" : "角色库"}</Button>
                                <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={removeSelected}>删除</Button>
                            </div>
                            <p className="text-[11px] leading-5 text-muted-foreground/70">生成分镜图时勾选这个角色或场景，会自动作为参考图使用。</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                        <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                            <ImagePlus className="size-5" />
                        </div>
                        <p className="mt-4 text-sm text-foreground">还没有资产</p>
                        <p className="mt-1.5 text-xs leading-6 text-muted-foreground">点「新建角色」或「新建场景」开始。</p>
                    </div>
                )}
            </section>

            <Modal title="从角色与场景库导入" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={760}>
                <div className="thin-scrollbar max-h-[60vh] overflow-y-auto">
                    <ImportSection title="角色库" kind="character" assets={libraryCharacters} onImport={importFromLibrary} />
                    <ImportSection title="场景库" kind="location" assets={libraryLocations} onImport={importFromLibrary} />
                </div>
            </Modal>
        </div>
    );
}

function ImportSection({ title, kind, assets, onImport }: {
    title: string;
    kind: FilmAssetKind;
    assets: FilmAsset[];
    onImport: (kind: FilmAssetKind, asset: FilmAsset) => void;
}) {
    return (
        <div className="mb-5 last:mb-0">
            <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{title}</span>
                <span aria-hidden className="h-px flex-1 bg-border/50" />
                <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{assets.length}</span>
            </div>
            {assets.length === 0 ? <p className="px-1 py-2 text-[11px] text-muted-foreground/60">库中还没有资产，先在项目里生成并点「存入角色库」。</p> : null}
            <div className="grid gap-2 sm:grid-cols-2">
                {assets.map((asset) => (
                    <button
                        key={asset.id}
                        type="button"
                        onClick={() => onImport(kind, asset)}
                        className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/50 p-2 text-left transition-colors hover:border-acid/50"
                    >
                        <FilmImageThumbnail url={asset.imageUrl} storageKey={asset.storageKey} alt={asset.name} className="size-12 shrink-0 rounded-md border border-border/60" />
                        <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                            <span className="mt-0.5 line-clamp-1 block text-[10px] leading-4 text-muted-foreground/70">{asset.description || "未填写描述"}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function AssetSection({ title, kind, assets, selection, onSelect, empty }: {
    title: string;
    kind: FilmAssetKind;
    assets: FilmAsset[];
    selection: Selection | null;
    onSelect: (id: string) => void;
    empty: string;
}) {
    return (
        <div className="mb-6 last:mb-0">
            <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{title}</span>
                <span aria-hidden className="h-px flex-1 bg-border/50" />
                <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{assets.length}</span>
            </div>
            {assets.length === 0 ? <p className="px-1 py-2 text-[11px] leading-5 text-muted-foreground/60">{empty}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => (
                    <button
                        key={asset.id}
                        type="button"
                        onClick={() => onSelect(asset.id)}
                        className={cn(
                            "group flex flex-col overflow-hidden rounded-lg border text-left transition-colors",
                            selection?.kind === kind && selection.id === asset.id ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-border",
                        )}
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
