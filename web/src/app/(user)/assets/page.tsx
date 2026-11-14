"use client";

import { Copy, Download, FileUp, LayoutGrid, Package, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { App, Button, Input, Pagination, type InputRef } from "antd";
import { saveAs } from "file-saver";

import { AssetBrowserCard, AssetBrowserEmpty, AssetBrowserLoading, AssetKindFilter, assetKindLabel, type AssetBrowserItem, type AssetFilterKind } from "@/components/assets/asset-browser";
import { AssetDetailDrawer, type AssetDetailModel } from "@/components/assets/asset-detail-drawer";
import { PageHeader } from "@/components/ui/page-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes } from "@/lib/image-utils";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { exportAssets, readAssetPackage } from "./asset-transfer";
import { AssetFormModal } from "@/components/assets/asset-form-modal";

export default function AssetsPage() {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const copyText = useCopyText();
    const assetInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<InputRef>(null);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetFilterKind>("all");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [tagFilters, setTagFilters] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [assetsHydrated, setAssetsHydrated] = useState(false);
    const categories = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.category ? [asset.category] : []))), [assets]);
    const tags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags))), [assets]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (categoryFilter && asset.category !== categoryFilter) return false;
            if (tagFilters.length && !tagFilters.some((tag) => asset.tags.includes(tag))) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [assets, keyword, kindFilter, categoryFilter, tagFilters]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    useEffect(() => {
        if (assetsHydrated) return;
        const unsubscribe = useAssetStore.persist.onFinishHydration(() => setAssetsHydrated(true));
        if (useAssetStore.persist.hasHydrated()) setAssetsHydrated(true);
        return unsubscribe;
    }, [assetsHydrated]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            event.preventDefault();
            searchInputRef.current?.focus();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    const clearFilters = () => {
        setPage(1);
        setKeyword("");
        setKindFilter("all");
        setCategoryFilter("");
        setTagFilters([]);
    };

    const openCreate = () => {
        setEditingAsset(null);
        setIsAssetOpen(true);
    };

    const openEdit = (asset: Asset) => {
        setEditingAsset(asset);
        setIsAssetOpen(true);
    };

    const copyAssetText = async (asset: Asset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadAsset = (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return;
        const url = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
        saveAs(url, `${asset.title || "asset"}.${asset.data.mimeType.split("/")[1] || "png"}`);
    };

    const exportAllAssets = async () => {
        if (!assets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        await exportAssets(assets);
    };

    const importAssetZip = async (file?: File) => {
        if (!file) return;
        try {
            const importedAssets = await readAssetPackage(file);
            importedAssets.forEach((asset) => {
                const payload = { ...asset } as Record<string, unknown>;
                delete payload.id;
                delete payload.createdAt;
                delete payload.updatedAt;
                addAsset(payload as Parameters<typeof addAsset>[0]);
            });
            message.success(`已导入 ${importedAssets.length} 个素材`);
        } catch {
            message.error("导入失败，请选择有效的素材压缩包");
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const deleteAsset = async (asset: Asset) => {
        const confirmed = await confirm({ title: "删除素材", description: `确定删除「${asset.title}」吗？删除后会从我的素材中移除。`, confirmText: "删除", tone: "danger" });
        if (!confirmed) return;
        try {
            const { assertMarketingAssetCanBeRemoved } = await import("@/stores/use-marketing-store");
            await assertMarketingAssetCanBeRemoved(asset.id);
            removeAsset(asset.id);
            message.success("素材已删除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材删除失败");
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <PageHeader
                        eyebrow="素材与提示词"
                        title="我的素材"
                        description="收藏和管理常用素材，按类型、标题、分类与标签快速定位。"
                        meta={
                            <>
                                <span className="chip chip-acid">{filteredAssets.length} 条结果</span>
                                <span className="chip">全部 {assets.length} 条</span>
                            </>
                        }
                        actions={
                            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                                <Button href="/marketing">营销资料</Button>
                                <Button className="max-sm:!h-10" icon={<FileUp className="size-4" />} onClick={() => assetInputRef.current?.click()}>
                                    导入
                                </Button>
                                <Button className="max-sm:!h-10" icon={<Package className="size-4" />} onClick={() => void exportAllAssets()}>
                                    导出
                                </Button>
                                <Button className="max-sm:col-span-2 max-sm:!h-10" icon={<LayoutGrid className="size-4" />} href="/asset-library">
                                    素材库
                                </Button>
                                <Button type="primary" className="max-sm:order-first max-sm:col-span-2 max-sm:!h-10" icon={<Plus className="size-4" />} onClick={openCreate}>
                                    新增素材
                                </Button>
                            </div>
                        }
                    />

                    <section className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-card/70 px-3.5 backdrop-blur-xl transition-colors focus-within:border-acid/50 lg:max-w-md">
                                <Search className="size-4 shrink-0 text-muted-foreground" />
                                <Input
                                    ref={searchInputRef}
                                    variant="borderless"
                                    className="!bg-transparent"
                                    allowClear
                                    value={keyword}
                                    placeholder="搜索标题、内容、分类、标签或来源"
                                    onChange={(event) => {
                                        setPage(1);
                                        setKeyword(event.target.value);
                                    }}
                                />
                                <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">/</kbd>
                            </div>
                            <AssetKindFilter value={kindFilter} onChange={(value) => { setPage(1); setKindFilter(value); }} />
                        </div>
                        {categories.length || tags.length ? (
                            <div className="filter-tag-sheet grid gap-2 sm:gap-2.5">
                                {categories.length ? (
                                    <FilterTagGroup label="分类" options={[{ value: "", label: "全部" }, ...categories.map((category) => ({ value: category, label: category }))]} isSelected={(value) => categoryFilter === value} onSelect={(value) => { setPage(1); setCategoryFilter(value); }} />
                                ) : null}
                                {tags.length ? (
                                    <FilterTagGroup label="标签" collapsible options={[{ value: "", label: "全部" }, ...tags.map((tag) => ({ value: tag, label: tag }))]} isSelected={(value) => value ? tagFilters.includes(value) : tagFilters.length === 0} onSelect={(value) => { setPage(1); setTagFilters((items) => value ? (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]) : []); }} />
                                ) : null}
                            </div>
                        ) : null}
                    </section>

                    <section className="flex flex-col gap-5">
                        {!assetsHydrated ? (
                            <AssetBrowserLoading label="正在加载我的素材" />
                        ) : visibleAssets.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {visibleAssets.map((asset, index) => (
                                    <div key={asset.id} className="enter-up" style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}>
                                        <AssetBrowserCard
                                            item={toBrowserItem(asset)}
                                            onOpen={() => setPreviewAsset(asset)}
                                            actions={
                                                <>
                                                    {asset.kind === "text" ? (
                                                        <Button type="text" size="small" className="!px-1.5" icon={<Copy className="size-3.5" />} onClick={() => void copyAssetText(asset)} aria-label="复制" title="复制" />
                                                    ) : (
                                                        <Button type="text" size="small" className="!px-1.5" icon={<Download className="size-3.5" />} onClick={() => downloadAsset(asset)} aria-label="下载" title="下载" />
                                                    )}
                                                    <Button type="text" size="small" className="!px-1.5" icon={<PencilLine className="size-3.5" />} onClick={() => openEdit(asset)} aria-label="编辑" title="编辑" />
                                                    <Button type="text" size="small" className="!px-1.5" icon={<Trash2 className="size-3.5" />} onClick={() => void deleteAsset(asset)} aria-label="删除" title="删除" />
                                                </>
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <AssetBrowserEmpty onClear={clearFilters} />
                        )}

                        {assetsHydrated && filteredAssets.length > pageSize ? (
                            <div className="flex justify-center pt-2">
                                <Pagination
                                    current={page}
                                    pageSize={pageSize}
                                    total={filteredAssets.length}
                                    showSizeChanger
                                    pageSizeOptions={[12, 24, 48, 96]}
                                    onChange={(nextPage, nextPageSize) => {
                                        setPage(nextPage);
                                        setPageSize(nextPageSize);
                                    }}
                                />
                            </div>
                        ) : null}
                    </section>
                </div>
            </main>

            <AssetFormModal open={isAssetOpen} asset={editingAsset} onClose={() => setIsAssetOpen(false)} />

            <AssetDetailDrawer detail={previewAsset ? toAssetDetail(previewAsset) : null} onClose={() => setPreviewAsset(null)} />

            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />

        </div>
    );
}

function toBrowserItem(asset: Asset): AssetBrowserItem {
    return {
        id: asset.id,
        title: asset.title,
        coverUrl: asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : ""),
        videoUrl: asset.kind === "video" ? asset.data.url : undefined,
        kind: asset.kind,
        summary: assetSummary(asset),
        tags: asset.tags,
        meta: asset.source || "未标注来源",
    };
}

function toAssetDetail(asset: Asset): AssetDetailModel {
    return {
        kind: asset.kind,
        title: asset.title,
        coverUrl: asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : ""),
        videoUrl: asset.kind === "video" ? asset.data.url : undefined,
        audioUrl: asset.kind === "audio" ? asset.data.url : undefined,
        tags: asset.tags,
        category: asset.category,
        textContent: asset.kind === "text" ? asset.data.content : undefined,
        prompt: assetPrompt(asset) || undefined,
        metaLines: assetMetaLines(asset),
        copyValue: asset.kind === "text" ? asset.data.content : undefined,
        inlineCopy: true,
        downloadUrl: asset.kind === "image" ? asset.data.dataUrl : asset.kind === "video" || asset.kind === "audio" ? asset.data.url : undefined,
        downloadFileName: asset.kind === "text" ? undefined : `${asset.title || "asset"}.${asset.data.mimeType.split("/")[1] || "png"}`,
        actionLabel: asset.kind === "text" ? "复制文本" : asset.kind === "video" ? "下载视频" : asset.kind === "audio" ? "下载音频" : "下载图片",
    };
}

function assetPrompt(asset: Asset) {
    const prompt = asset.metadata?.prompt;
    return typeof prompt === "string" ? prompt.trim() : "";
}

function assetMetaLines(asset: Asset): Array<[string, string]> {
    const metadataSource = asset.metadata?.source;
    const source = asset.source || (typeof metadataSource === "string" ? metadataSource : "");
    const lines: Array<[string, string]> = [["类型", assetKindLabel(asset.kind)]];
    if (asset.kind === "text") {
        lines.push(["字数", `${asset.data.content.length} 字`]);
    } else {
        if ("width" in asset.data && "height" in asset.data && asset.data.width && asset.data.height) lines.push(["尺寸", `${asset.data.width} × ${asset.data.height}`]);
        if ("bytes" in asset.data && asset.data.bytes) lines.push(["大小", formatBytes(asset.data.bytes)]);
        lines.push(["格式", asset.data.mimeType]);
        if (asset.kind === "audio" && asset.data.durationMs) lines.push(["时长", `${(asset.data.durationMs / 1000).toFixed(1)} 秒`]);
    }
    if (source) lines.push(["来源", source]);
    if (asset.category) lines.push(["分类", asset.category]);
    lines.push(["创建时间", dayjs(asset.createdAt).format("YYYY-MM-DD HH:mm")]);
    lines.push(["更新时间", dayjs(asset.updatedAt).format("YYYY-MM-DD HH:mm")]);
    return lines;
}

function assetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    if (asset.kind === "audio") return `${formatBytes(asset.data.bytes || 0)} · ${asset.data.mimeType}`;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.category || "", asset.tags.join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}

