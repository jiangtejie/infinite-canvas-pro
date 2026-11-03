"use client";

import { Copy, FolderPlus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Drawer, Image, Input, Pagination, Tag, Typography } from "antd";
import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import { useCopyText } from "@/hooks/use-copy-text";
import { getProxyUrl } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { fetchAssetLibrary, type AssetLibraryItem } from "@/services/api/assets";

const PAGE_SIZE = 12;

export default function AssetLibraryPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [keyword, setKeyword] = useState("");
    const [selectedType, setSelectedType] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [selectedAsset, setSelectedAsset] = useState<AssetLibraryItem | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);

    const query = useQuery({
        queryKey: ["asset-library", keyword, selectedType, selectedCategory, selectedTags, page],
        queryFn: () => fetchAssetLibrary({ keyword, type: selectedType, category: selectedCategory, tag: selectedTags, page, pageSize: PAGE_SIZE }),
        placeholderData: (previousData) => previousData,
        retry: false,
    });

    useEffect(() => {
        if (query.isError) {
            message.error(query.error instanceof Error ? query.error.message : "获取素材库失败");
        }
    }, [message, query.error, query.isError]);

    const isReady = Boolean(query.data) || query.isError;
    const items = query.data?.items || [];
    const categories = query.data?.categories || [];
    const availableTags = query.data?.tags || [];
    const total = query.data?.total || 0;

    const toggleTag = (tag: string) => {
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const saveToMyAssets = async (asset: AssetLibraryItem) => {
        try {
            if (useAssetStore.getState().assets.some((item) => item.metadata?.source === "asset-library" && item.metadata.assetId === asset.id)) return void message.info("该素材已在我的素材中");
            if (asset.type === "image") {
                const blob = await (await fetch(getProxyUrl(asset.url))).blob();
                const bitmap = await createImageBitmap(blob);
                const { width, height } = bitmap;
                bitmap.close();
                if (useAssetStore.getState().assets.some((item) => item.metadata?.source === "asset-library" && item.metadata.assetId === asset.id)) return void message.info("该素材已在我的素材中");
                addAsset({
                    kind: "image",
                    title: asset.title,
                    coverUrl: asset.coverUrl,
                    tags: asset.tags,
                    category: asset.category,
                    source: "素材库",
                    data: { dataUrl: asset.url, width, height, bytes: blob.size, mimeType: blob.type || "image/*" },
                    metadata: { source: "asset-library", assetId: asset.id },
                });
            } else if (asset.type === "video") {
                addAsset({
                    kind: "video",
                    title: asset.title,
                    coverUrl: asset.coverUrl,
                    tags: asset.tags,
                    category: asset.category,
                    source: "素材库",
                    data: { url: asset.url, width: 0, height: 0, bytes: 0, mimeType: "video/mp4" },
                    metadata: { source: "asset-library", assetId: asset.id },
                });
            } else if (asset.type === "audio") {
                addAsset({
                    kind: "audio",
                    title: asset.title,
                    coverUrl: asset.coverUrl,
                    tags: asset.tags,
                    category: asset.category,
                    source: "素材库",
                    data: { url: asset.url, mimeType: "audio/mpeg" },
                    metadata: { source: "asset-library", assetId: asset.id },
                });
            } else {
                addAsset({
                    kind: "text",
                    title: asset.title,
                    coverUrl: asset.coverUrl,
                    tags: asset.tags,
                    category: asset.category,
                    source: "素材库",
                    data: { content: asset.content },
                    metadata: { source: "asset-library", assetId: asset.id },
                });
            }
            message.success("已加入我的素材");
        } catch {
            message.error("加入失败");
        }
    };

    const clearFilters = () => {
        setPage(1);
        setKeyword("");
        setSelectedType("");
        setSelectedCategory("");
        setSelectedTags([]);
    };

    if (!isReady) return <LoadingState className="h-full" label="正在加载素材库" />;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <PageHeader
                        eyebrow="团队素材库"
                        title="素材库"
                        description="挑选团队沉淀的文本、图片与视频，加入我的素材后即可在画布继续编辑。"
                        meta={
                            <>
                                <span className="chip chip-acid">{total} 条素材</span>
                                <span className="chip">{categories.length} 个分类</span>
                            </>
                        }
                        actions={<Button href="/assets">返回我的素材</Button>}
                    />

                    <section className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card/70 px-3.5 backdrop-blur-xl transition-colors focus-within:border-acid/50 lg:max-w-md">
                                <Search className="size-4 shrink-0 text-muted-foreground" />
                                <Input
                                    variant="borderless"
                                    className="!bg-transparent"
                                    allowClear
                                    value={keyword}
                                    placeholder="搜索标题、内容、分类或标签"
                                    onChange={(event) => {
                                        setPage(1);
                                        setKeyword(event.target.value);
                                    }}
                                />
                            </div>
                            <FilterTagGroup
                                inline
                                options={[
                                    { label: "全部", value: "" },
                                    { label: "文本", value: "text" },
                                    { label: "图片", value: "image" },
                                    { label: "视频", value: "video" },
                                    { label: "音频", value: "audio" },
                                ]}
                                isSelected={(value) => selectedType === value}
                                onSelect={(value) => {
                                    setPage(1);
                                    setSelectedType(value);
                                }}
                            />
                        </div>
                        {categories.length || availableTags.length ? (
                            <div className="grid gap-2 rounded-lg border border-border/70 bg-card/40 p-4">
                                {categories.length ? (
                                    <FilterTagGroup
                                        label="分类"
                                        options={[{ value: "", label: "全部" }, ...categories.map((item) => ({ value: item, label: item }))]}
                                        isSelected={(value) => selectedCategory === value}
                                        onSelect={(value) => {
                                            setPage(1);
                                            setSelectedCategory(value);
                                        }}
                                    />
                                ) : null}
                                {availableTags.length ? (
                                    <FilterTagGroup
                                        label="标签"
                                        options={[{ value: "", label: "全部" }, ...availableTags.map((tag) => ({ value: tag, label: tag }))]}
                                        isSelected={(value) => value ? selectedTags.includes(value) : selectedTags.length === 0}
                                        onSelect={(value) => {
                                            setPage(1);
                                            if (value) toggleTag(value);
                                            else setSelectedTags([]);
                                        }}
                                    />
                                ) : null}
                            </div>
                        ) : null}
                    </section>

                    <section className="flex flex-col gap-5">
                        {items.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {items.map((asset, index) => (
                                    <div key={asset.id} className="enter-up" style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}>
                                        <LibraryCard asset={asset} onOpen={() => setSelectedAsset(asset)} onAdd={() => void saveToMyAssets(asset)} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                className="rounded-xl border border-dashed border-border bg-card/40"
                                title="没有找到素材"
                                description="调整类型、分类、标签或搜索关键词后再试。"
                                action={<Button onClick={clearFilters}>清空筛选</Button>}
                            />
                        )}

                        {total > PAGE_SIZE ? (
                            <div className="flex justify-center pt-2">
                                <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={(nextPage) => setPage(nextPage)} />
                            </div>
                        ) : null}
                    </section>
                </div>
            </main>

            <Drawer title="素材详情" open={Boolean(selectedAsset)} size="large" onClose={() => setSelectedAsset(null)}>
                {selectedAsset ? (
                    <div className="space-y-5">
                        {selectedAsset.coverUrl ? (
                            <Image src={selectedAsset.coverUrl} alt={selectedAsset.title} className="rounded-lg" style={{ maxHeight: "46vh", width: "auto", maxWidth: "100%", objectFit: "contain" }} preview={{ getContainer: () => document.body }} />
                        ) : (
                            <div className="rounded-lg border border-border bg-muted p-5 text-sm leading-6 text-muted-foreground">{selectedAsset.content || "暂无封面"}</div>
                        )}
                        <div>
                            <Typography.Title level={4} className="!mb-2">
                                {selectedAsset.title}
                            </Typography.Title>
                            <div className="flex flex-wrap gap-1.5">
                                <Tag>{assetTypeLabel(selectedAsset.type)}</Tag>
                                {selectedAsset.tags.map((tag) => (
                                    <Tag key={tag}>{tag}</Tag>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <Typography.Text type="secondary" className="block text-xs">
                                内容
                            </Typography.Text>
                            {selectedAsset.type === "text" ? <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{selectedAsset.content}</Typography.Paragraph> : <Typography.Text className="mt-2 block">{selectedAsset.url}</Typography.Text>}
                        </div>
                        {selectedAsset.description ? <Typography.Paragraph type="secondary">{selectedAsset.description}</Typography.Paragraph> : null}
                        <div className="flex flex-wrap gap-2">
                            {selectedAsset.type === "text" ? (
                                <Button type="primary" icon={<Copy className="size-4" />} onClick={() => copyText(selectedAsset.content)}>
                                    复制文本
                                </Button>
                            ) : null}
                            {selectedAsset.type !== "text" ? (
                                <Button type="primary" icon={<Copy className="size-4" />} onClick={() => copyText(selectedAsset.url)}>
                                    复制链接
                                </Button>
                            ) : null}
                            <Button icon={<FolderPlus className="size-4" />} onClick={() => void saveToMyAssets(selectedAsset)}>
                                加入我的素材
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Drawer>
        </div>
    );
}

function LibraryCard({ asset, onOpen, onAdd }: { asset: AssetLibraryItem; onOpen: () => void; onAdd: () => void }) {
    const cover = asset.coverUrl;
    return (
        <article className="punk-card group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
            <button type="button" className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-muted/50 text-left" onClick={onOpen} aria-label={`查看 ${asset.title}`}>
                {cover ? (
                    <img loading="lazy" decoding="async" src={cover} alt={asset.title} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                    <span className="flex size-full items-center justify-center bg-muted/60 p-5 text-center text-xs leading-6 text-muted-foreground">{asset.content || "暂无封面"}</span>
                )}
                <span className="absolute left-2.5 top-2.5 inline-flex h-5 items-center rounded-[3px] border border-white/15 bg-black/55 px-1.5 font-mono text-[10px] tracking-[0.12em] text-white/90 uppercase backdrop-blur">
                    {assetTypeLabel(asset.type)}
                </span>
            </button>
            <div className="flex flex-1 flex-col gap-2.5 p-4">
                <button type="button" className="cursor-pointer text-left" onClick={onOpen}>
                    <h2 className="line-clamp-1 text-sm font-medium text-foreground">{asset.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{asset.type === "text" ? asset.content : asset.url}</p>
                </button>
                <div className="flex flex-wrap gap-1.5">
                    {asset.tags.slice(0, 3).map((tag) => (
                        <Tag key={tag} className="!m-0 !rounded-[3px] !text-[10px]">
                            {tag}
                        </Tag>
                    ))}
                    {!asset.tags.length ? <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground/60 uppercase">无标签</span> : null}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <span className="truncate font-mono text-[10px] tracking-[0.1em] text-muted-foreground/70 uppercase">{asset.category || "未分类"}</span>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button size="small" onClick={onOpen}>查看</Button>
                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={onAdd}>加入素材</Button>
                    </div>
                </div>
            </div>
        </article>
    );
}

function assetTypeLabel(type: AssetLibraryItem["type"]) {
    if (type === "image") return "图片";
    if (type === "video") return "视频";
    if (type === "audio") return "音频";
    return "文本";
}
