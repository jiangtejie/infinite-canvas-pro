"use client";

import { FolderPlus, Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Input, Pagination } from "antd";
import { AssetBrowserCard, AssetBrowserEmpty, AssetBrowserLoading, AssetKindFilter, type AssetBrowserItem, type AssetFilterKind } from "@/components/assets/asset-browser";
import { AssetDetailDrawer, type AssetDetailModel } from "@/components/assets/asset-detail-drawer";
import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/state-panel";
import { getProxyUrl } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { fetchAssetLibrary, type AssetLibraryItem } from "@/services/api/assets";
import { errorMessage } from "@/lib/utils";

const PAGE_SIZE = 12;

export default function AssetLibraryPage() {
    const { message } = App.useApp();
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
                        actions={<Button className="max-sm:!h-10" href="/assets">返回我的素材</Button>}
                    />

                    <section className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-card/70 px-3.5 backdrop-blur-xl transition-colors focus-within:border-acid/50 lg:max-w-md">
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
                            <AssetKindFilter
                                value={(selectedType || "all") as AssetFilterKind}
                                onChange={(value) => {
                                    setPage(1);
                                    setSelectedType(value === "all" ? "" : value);
                                }}
                            />
                        </div>
                        {categories.length || availableTags.length ? (
                            <div className="filter-tag-sheet grid gap-2 sm:gap-2.5">
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
                                        collapsible
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
                        {!isReady ? (
                            <AssetBrowserLoading label="正在加载素材库" />
                        ) : query.isError ? (
                            <ErrorState
                                className="py-16"
                                description={errorMessage(query.error, "获取素材库失败，请稍后重试。")}
                                onRetry={() => void query.refetch()}
                            />
                        ) : items.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {items.map((asset, index) => (
                                    <div key={asset.id} className="enter-up" style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}>
                                        <AssetBrowserCard
                                            item={toBrowserItem(asset)}
                                            onOpen={() => setSelectedAsset(asset)}
                                            actions={
                                                <>
                                                    <Button size="small" onClick={() => setSelectedAsset(asset)}>查看</Button>
                                                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => void saveToMyAssets(asset)}>加入素材</Button>
                                                </>
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <AssetBrowserEmpty onClear={clearFilters} />
                        )}

                        {isReady && !query.isError && total > PAGE_SIZE ? (
                            <div className="flex justify-center pt-2">
                                <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={(nextPage) => setPage(nextPage)} />
                            </div>
                        ) : null}
                    </section>
                </div>
            </main>

            <AssetDetailDrawer
                detail={selectedAsset ? toAssetDetail(selectedAsset) : null}
                onClose={() => setSelectedAsset(null)}
                extraActions={selectedAsset ? (
                    <Button icon={<FolderPlus className="size-4" />} onClick={() => void saveToMyAssets(selectedAsset)}>
                        加入我的素材
                    </Button>
                ) : null}
            />
        </div>
    );
}

function toBrowserItem(asset: AssetLibraryItem): AssetBrowserItem {
    return {
        id: asset.id,
        title: asset.title,
        coverUrl: asset.coverUrl,
        videoUrl: asset.type === "video" ? asset.url : undefined,
        kind: asset.type,
        summary: asset.type === "text" ? asset.content : asset.url,
        tags: asset.tags,
        meta: asset.category || "未分类",
    };
}

function toAssetDetail(asset: AssetLibraryItem): AssetDetailModel {
    const isText = asset.type === "text";
    return {
        kind: asset.type,
        title: asset.title,
        coverUrl: asset.coverUrl,
        fallbackText: asset.coverUrl ? undefined : asset.content || "暂无封面",
        tags: asset.tags,
        textContent: isText ? asset.content : undefined,
        contentUrl: isText ? undefined : asset.url,
        description: asset.description,
        copyValue: isText ? asset.content : asset.url,
        actionLabel: isText ? "复制文本" : "复制链接",
    };
}
