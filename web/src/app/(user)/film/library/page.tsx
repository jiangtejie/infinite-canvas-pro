"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "antd";
import { ArrowLeft, Library, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { FilmAmbient } from "@/components/film/film-ambient";
import { Field } from "@/components/ui/field";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import { FilmAssetThumbnail, FilmImageThumbnail } from "../components/film-asset-thumbnail";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useFilmDeleteConfirm } from "../hooks/use-film-delete-confirm";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";

type Selection = { kind: FilmAssetKind; id: string };

export default function FilmLibraryPage() {
    const { confirmDelete } = useFilmDeleteConfirm();
    const hydrated = useFilmCastStore((state) => state.hydrated);
    const characters = useFilmCastStore((state) => state.characters);
    const locations = useFilmCastStore((state) => state.locations);
    const updateAsset = useFilmCastStore((state) => state.updateAsset);
    const removeAsset = useFilmCastStore((state) => state.removeAsset);
    const [selection, setSelection] = useState<Selection | null>(null);

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

    const updateSelected = (patch: Partial<FilmAsset>) => {
        if (selection) updateAsset(selection.kind, selection.id, patch);
    };

    const removeSelected = () => {
        if (!selection || !selected) return;
        confirmDelete({
            title: `从库中删除「${selected.name}」？`,
            description: "删除后已导入到项目里的副本不受影响。",
            detail: `${selection.kind === "character" ? "角色" : "场景"} · ${selected.views?.length || 0} 张视图`,
            confirmText: "从库中删除",
            onConfirm: () => {
                removeAsset(selection.kind, selection.id);
                setSelection(null);
            },
        });
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <div className="relative">
                        <FilmAmbient className="-inset-x-6 -top-10 h-[320px] opacity-80 sm:-inset-x-10" />
                        <div className="relative">
                    <PageHeader
                        eyebrow="创作工作台"
                        title="角色与场景库"
                        description="在影视项目里生成的角色设定和场景概念，存入这里后可以跨项目复用；导入项目后会生成一份独立副本。"
                        meta={
                            <>
                                <span className="chip chip-acid">{characters.length} 个角色</span>
                                <span className="chip">{locations.length} 个场景</span>
                            </>
                        }
                        actions={
                            <Button href="/film" icon={<ArrowLeft className="size-4" />}>
                                返回影视项目
                            </Button>
                        }
                    />
                        </div>
                    </div>

                    {!hydrated ? <LoadingState label="正在加载角色与场景库" /> : null}

                    {hydrated && characters.length === 0 && locations.length === 0 ? (
                        <EmptyState
                            title="库还是空的"
                            description="打开任意影视项目，在「角色与场景」里生成设定图后点「存入角色库」，就会出现在这里。"
                            icon={<Library className="size-6" />}
                            action={<Button type="primary" href="/film">去影视项目</Button>}
                        />
                    ) : null}

                    {hydrated && (characters.length > 0 || locations.length > 0) ? (
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
                            <section className="punk-panel flex flex-col gap-6 rounded-xl p-4">
                                <LibrarySection title="角色库" kind="character" assets={characters} selection={selection} onSelect={(id) => setSelection({ kind: "character", id })} />
                                <LibrarySection title="场景库" kind="location" assets={locations} selection={selection} onSelect={(id) => setSelection({ kind: "location", id })} />
                            </section>

                            <section className="punk-panel flex flex-col overflow-hidden rounded-xl">
                                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                                    <span className="eyebrow">{selection?.kind === "location" ? "场景详情" : "角色详情"}</span>
                                    {selected ? <span className="font-mono text-[10px] text-muted-foreground/70">{selected.views?.length || 0} 张视图</span> : null}
                                </div>
                                {selected ? (
                                    <div className="p-4">
                                        <FilmAssetThumbnail asset={selected} className="h-44 w-full rounded-lg border border-border/60" />
                                        <div className="mt-4 grid gap-3">
                                            <Field label="名称">
                                                <Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} />
                                            </Field>
                                            <Field label="描述">
                                                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={selected.description} onChange={(event) => updateSelected({ description: event.target.value })} />
                                            </Field>
                                            <Field label="视觉提示词">
                                                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={selected.visualPrompt} placeholder="留空则用名称和描述" onChange={(event) => updateSelected({ visualPrompt: event.target.value })} />
                                            </Field>
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
                                            <div className="pt-1">
                                                <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={removeSelected}>从库中删除</Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                                        <div className="grid size-12 place-items-center rounded-[10px] border border-dashed border-border/70 text-muted-foreground">
                                            <Library className="size-5" />
                                        </div>
                                        <p className="mt-4 text-sm text-foreground">选择一个资产</p>
                                    </div>
                                )}
                            </section>
                        </div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}

function LibrarySection({ title, kind, assets, selection, onSelect }: {
    title: string;
    kind: FilmAssetKind;
    assets: FilmAsset[];
    selection: Selection | null;
    onSelect: (id: string) => void;
}) {
    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">{title}</span>
                <span aria-hidden className="h-px flex-1 bg-border/50" />
                <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{assets.length}</span>
            </div>
            {assets.length === 0 ? <p className="px-1 py-2 text-[11px] text-muted-foreground/60">还没有资产，去影视项目里生成并存入。</p> : null}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset, index) => (
                    <button
                        key={asset.id}
                        type="button"
                        onClick={() => onSelect(asset.id)}
                        style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}
                        className={cn(
                            "punk-card enter-up group flex flex-col overflow-hidden rounded-lg border text-left",
                            selection?.kind === kind && selection.id === asset.id ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-acid/40",
                        )}
                    >
                        <div className="relative w-full overflow-hidden">
                            <FilmAssetThumbnail asset={asset} className="h-24 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent" />
                        </div>
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
