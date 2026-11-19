"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Image, Input } from "antd";
import { ArrowLeft, Library, Search, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { FilmAmbient } from "@/components/film/film-ambient";
import { Field } from "@/components/ui/field";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { cn } from "@/lib/utils";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import { FilmAssetThumbnail, FilmImageThumbnail } from "../components/film-asset-thumbnail";
import { useFilmImageUrl } from "../hooks/use-film-image-url";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useFilmStore } from "@/stores/use-film-store";
import { useFilmDeleteConfirm } from "../hooks/use-film-delete-confirm";
import { EMPTY_FILM_LIBRARY_USAGE, filmLibraryUsageIndex } from "../utils/film-library";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";

const TABS: Array<{ kind: FilmAssetKind; label: string }> = [
    { kind: "character", label: "角色" },
    { kind: "location", label: "场景" },
    { kind: "prop", label: "道具" },
    { kind: "costume", label: "服装" },
    { kind: "style", label: "风格" },
];

export default function FilmLibraryPage() {
    const { confirmDelete } = useFilmDeleteConfirm();
    const hydrated = useFilmCastStore((state) => state.hydrated);
    const characters = useFilmCastStore((state) => state.characters);
    const locations = useFilmCastStore((state) => state.locations);
    const props = useFilmCastStore((state) => state.props);
    const costumes = useFilmCastStore((state) => state.costumes);
    const styles = useFilmCastStore((state) => state.styles);
    const updateAsset = useFilmCastStore((state) => state.updateAsset);
    const removeAsset = useFilmCastStore((state) => state.removeAsset);
    const projects = useFilmStore((state) => state.projects);
    const [tab, setTab] = useState<FilmAssetKind>("character");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState("");

    const lists: Record<FilmAssetKind, FilmAsset[]> = { character: characters, location: locations, prop: props, costume: costumes, style: styles };
    const list = lists[tab];
    const keyword = search.trim().toLowerCase();
    const filtered = keyword
        ? list.filter((asset) => [asset.name, ...asset.aliases, ...(asset.tags || [])].join(" ").toLowerCase().includes(keyword))
        : list;

    useEffect(() => {
        if (selectedId && list.some((asset) => asset.id === selectedId)) return;
        setSelectedId(list[0]?.id || "");
    }, [list, selectedId]);

    const selected = list.find((asset) => asset.id === selectedId) || null;
    const usageIndex = useMemo(() => filmLibraryUsageIndex(projects, tab), [projects, tab]);
    const usage = selected ? usageIndex.get(selected.id) || EMPTY_FILM_LIBRARY_USAGE : null;
    const updateSelected = (patch: Partial<FilmAsset>) => {
        if (selected) updateAsset(tab, selected.id, patch);
    };

    const removeSelected = () => {
        if (!selected || !usage) return;
        confirmDelete({
            title: `从库中删除「${selected.name}」？`,
            description: "删除后已导入到项目里的副本不受影响。",
            detail: `${FILM_ASSET_KIND_LABELS[tab]} · ${usage.projects} 个项目使用 · ${usage.bindings} 处镜头 / 造型引用`,
            confirmText: "从库中删除",
            onConfirm: () => {
                removeAsset(tab, selected.id);
                setSelectedId("");
            },
        });
    };

    const totalCount = TABS.reduce((total, item) => total + lists[item.kind].length, 0);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <div className="relative">
                        <FilmAmbient className="-inset-x-6 -top-10 h-[320px] opacity-80 sm:-inset-x-10" />
                        <div className="relative">
                            <PageHeader
                                eyebrow="创作工作台"
                                title="影视资产库"
                                description="角色、场景、道具、服装与风格圣经的母版库；存入时按来源去重，从库更新或推送到库都由你确认覆盖方向。"
                                meta={<span className="chip chip-acid">{totalCount} 个条目</span>}
                                actions={
                                    <Button href="/film" icon={<ArrowLeft className="size-4" />}>
                                        返回影视项目
                                    </Button>
                                }
                            />
                        </div>
                    </div>

                    {!hydrated ? <LoadingState label="正在加载影视资产库" /> : null}

                    {hydrated ? (
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                            <section className="punk-panel flex flex-col gap-4 rounded-xl p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border/60 bg-background/40 p-0.5">
                                        {TABS.map((item) => (
                                            <button
                                                key={item.kind}
                                                type="button"
                                                onClick={() => { setTab(item.kind); setSelectedId(""); }}
                                                aria-pressed={tab === item.kind}
                                                className={cn("rounded px-2.5 py-1 text-[11px] transition-colors", tab === item.kind ? "bg-acid/10 text-acid" : "text-muted-foreground hover:text-foreground")}
                                            >
                                                {item.label} {lists[item.kind].length}
                                            </button>
                                        ))}
                                    </div>
                                    <Input
                                        size="small"
                                        allowClear
                                        className="ml-auto max-w-56"
                                        prefix={<Search className="size-3.5 text-muted-foreground/50" />}
                                        placeholder="搜索名称 / 别名 / 标签"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                    />
                                </div>

                                {filtered.length === 0 ? (
                                    <EmptyState
                                        className="py-12"
                                        title={list.length ? "没有匹配的条目" : `${FILM_ASSET_KIND_LABELS[tab]}库还是空的`}
                                        description={list.length ? "换一个关键词试试。" : "在影视项目里打磨资产后点「存入…库」，就会出现在这里。"}
                                        icon={<Library className="size-6" />}
                                        action={<Button type="primary" href="/film">去影视项目</Button>}
                                    />
                                ) : (
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {filtered.map((asset, index) => {
                                            const itemUsage = usageIndex.get(asset.id) || EMPTY_FILM_LIBRARY_USAGE;
                                            return (
                                                <button
                                                    key={asset.id}
                                                    type="button"
                                                    onClick={() => setSelectedId(asset.id)}
                                                    style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}
                                                    className={cn(
                                                        "punk-card enter-up group flex flex-col overflow-hidden rounded-lg border text-left",
                                                        selectedId === asset.id ? "border-acid/60 bg-acid/[0.05]" : "border-border/70 bg-card/50 hover:border-acid/40",
                                                    )}
                                                >
                                                    <div className="relative w-full overflow-hidden">
                                                        <FilmAssetThumbnail asset={asset} className="h-24 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                                                        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent" />
                                                    </div>
                                                    <span className="p-2.5">
                                                        <span className="block truncate text-xs font-medium text-foreground">{asset.name}</span>
                                                        <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-muted-foreground/70">{asset.description || "未填写描述"}</span>
                                                        {asset.tags?.length ? (
                                                            <span className="mt-1 flex flex-wrap gap-1">
                                                                {asset.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-muted/60 px-1 font-mono text-[8px] text-muted-foreground/70">{tag}</span>)}
                                                            </span>
                                                        ) : null}
                                                        <span className="mt-1 block font-mono text-[9px] text-muted-foreground/50">{itemUsage.projects} 个项目 · {itemUsage.bindings} 处引用</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            <section className="punk-panel flex flex-col overflow-hidden rounded-xl">
                                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                                    <span className="eyebrow">{FILM_ASSET_KIND_LABELS[tab]}详情</span>
                                    {selected ? <span className="font-mono text-[10px] text-muted-foreground/70">{selected.concept.images.length} 概念 · {selected.views?.images.length || 0} 视图</span> : null}
                                </div>
                                {selected ? (
                                    <div className="p-4">
                                        <LibraryPreview asset={selected} />
                                        <div className="mt-4 grid gap-3">
                                            <Field label="名称">
                                                <Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} />
                                            </Field>
                                            <Field label="别名">
                                                <Input value={selected.aliases.join("，")} placeholder="使用逗号分隔" onChange={(event) => updateSelected({ aliases: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean) })} />
                                            </Field>
                                            <Field label="描述">
                                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={selected.description} onChange={(event) => updateSelected({ description: event.target.value })} />
                                            </Field>
                                            <Field label="视觉提示词">
                                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={selected.visualPrompt} placeholder="留空则用名称和描述" onChange={(event) => updateSelected({ visualPrompt: event.target.value })} />
                                            </Field>
                                            <Field label="标签">
                                                <Input value={(selected.tags || []).join("，")} placeholder="用逗号分隔，用于库内搜索" onChange={(event) => updateSelected({ tags: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean) })} />
                                            </Field>
                                            {selected.views?.images.length ? (
                                                <div className="grid gap-2">
                                                    <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">视图设定</span>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {selected.views.images.map((view) => (
                                                            <div key={view.id} className="relative overflow-hidden rounded-md border border-border/60">
                                                                <FilmImageThumbnail url={view.url} storageKey={view.storageKey} alt={view.label} className="h-24 w-full" />
                                                                <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-foreground/80">{view.label || "视图"}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                            <div className="grid gap-1 rounded-md border border-border/50 bg-background/25 p-2 text-[11px] leading-5 text-muted-foreground/70">
                                                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">使用情况</span>
                                                <span>{usage && usage.projects ? `${usage.projects} 个项目 · ${usage.copies} 份副本 · ${usage.bindings} 处镜头 / 造型引用` : "还没有项目导入这个条目"}</span>
                                                {usage?.projectTitles.length ? <span className="line-clamp-1">来源项目：{usage.projectTitles.join("、")}</span> : null}
                                                <span>更新于 {new Date(selected.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                                            </div>
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

function LibraryPreview({ asset }: { asset: FilmAsset }) {
    const image = asset.concept.images.find((item) => item.id === asset.concept.activeImageId) || asset.concept.images[asset.concept.images.length - 1];
    const src = useFilmImageUrl(image?.url, image?.storageKey);
    if (!src) return <FilmAssetThumbnail asset={asset} className="h-56 w-full rounded-lg border border-border/60" />;
    return (
        <Image
            src={src}
            alt={asset.name}
            className="w-full rounded-lg border border-border/60 object-contain"
            style={{ maxHeight: 260 }}
            preview={{ mask: "大图预览" }}
        />
    );
}
