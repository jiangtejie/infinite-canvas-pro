"use client";

import { Copy, Download, FileUp, LayoutGrid, Package, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { App, Button, Drawer, Image, Input, Modal, Pagination, Tag } from "antd";
import { saveAs } from "file-saver";

import { PageHeader } from "@/components/ui/page-header";
import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { EmptyState } from "@/components/ui/state-panel";
import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes } from "@/lib/image-utils";
import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { exportAssets, readAssetPackage } from "./asset-transfer";
import { AssetFormModal } from "@/components/assets/asset-form-modal";

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export default function AssetsPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const assetInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [tagFilters, setTagFilters] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
    const validAssets = useMemo(() => assets.filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"), [assets]);
    const categories = useMemo(() => Array.from(new Set(validAssets.flatMap((asset) => asset.category ? [asset.category] : []))), [validAssets]);
    const tags = useMemo(() => Array.from(new Set(validAssets.flatMap((asset) => asset.tags))), [validAssets]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (categoryFilter && asset.category !== categoryFilter) return false;
            if (tagFilters.length && !tagFilters.some((tag) => asset.tags.includes(tag))) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter, categoryFilter, tagFilters]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

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
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        await exportAssets(validAssets);
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

    const confirmDelete = () => {
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success("素材已删除");
        setDeletingAsset(null);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                <div className="page-shell flex flex-col gap-7 py-10 sm:py-12">
                    <PageHeader
                        eyebrow="AI 素材库"
                        title="我的素材"
                        description="收藏和管理常用素材，按类型、标题、分类与标签快速定位。"
                        meta={
                            <>
                                <span className="chip chip-acid">{filteredAssets.length} 条结果</span>
                                <span className="chip">全部 {validAssets.length} 条</span>
                            </>
                        }
                        actions={
                            <>
                                <Button icon={<FileUp className="size-4" />} onClick={() => assetInputRef.current?.click()}>
                                    导入
                                </Button>
                                <Button icon={<Package className="size-4" />} onClick={() => void exportAllAssets()}>
                                    导出
                                </Button>
                                <Button icon={<LayoutGrid className="size-4" />} href="/asset-library">
                                    素材库
                                </Button>
                                <Button type="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
                                    新增素材
                                </Button>
                            </>
                        }
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
                                    placeholder="搜索标题、内容、分类、标签或来源"
                                    onChange={(event) => {
                                        setPage(1);
                                        setKeyword(event.target.value);
                                    }}
                                />
                                <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">/</kbd>
                            </div>
                            <FilterTagGroup inline options={kindOptions} isSelected={(value) => kindFilter === value} onSelect={(value) => { setPage(1); setKindFilter(value as AssetKind | "all"); }} />
                        </div>
                        {categories.length || tags.length ? (
                            <div className="grid gap-2 rounded-lg border border-border/70 bg-card/40 p-4">
                                {categories.length ? (
                                    <FilterTagGroup label="分类" options={[{ value: "", label: "全部" }, ...categories.map((category) => ({ value: category, label: category }))]} isSelected={(value) => categoryFilter === value} onSelect={(value) => { setPage(1); setCategoryFilter(value); }} />
                                ) : null}
                                {tags.length ? (
                                    <FilterTagGroup label="标签" options={[{ value: "", label: "全部" }, ...tags.map((tag) => ({ value: tag, label: tag }))]} isSelected={(value) => value ? tagFilters.includes(value) : tagFilters.length === 0} onSelect={(value) => { setPage(1); setTagFilters((items) => value ? (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]) : []); }} />
                                ) : null}
                            </div>
                        ) : null}
                    </section>

                    <section className="flex flex-col gap-5">
                        {visibleAssets.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {visibleAssets.map((asset, index) => (
                                    <div key={asset.id} className="enter-up" style={{ "--enter-index": Math.min(index, 10) } as React.CSSProperties}>
                                        <AssetCard asset={asset} onOpen={() => setPreviewAsset(asset)} onEdit={() => openEdit(asset)} onCopy={copyAssetText} onDownload={downloadAsset} onDelete={() => setDeletingAsset(asset)} />
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

                        {filteredAssets.length > pageSize ? (
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

            <AssetDrawer asset={previewAsset} onClose={() => setPreviewAsset(null)} onCopy={copyAssetText} onDownload={downloadAsset} />

            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>
        </div>
    );
}

function AssetCard({ asset, onOpen, onEdit, onCopy, onDownload, onDelete }: { asset: Asset; onOpen: () => void; onEdit: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void; onDelete: () => void }) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const summary = assetSummary(asset);
    const actions = [
        asset.kind === "text"
            ? { key: "copy", icon: <Copy className="size-3.5" />, label: "复制", onClick: () => void onCopy(asset) }
            : { key: "download", icon: <Download className="size-3.5" />, label: "下载", onClick: () => onDownload(asset) },
        { key: "edit", icon: <PencilLine className="size-3.5" />, label: "编辑", onClick: onEdit },
        { key: "delete", icon: <Trash2 className="size-3.5" />, label: "删除", onClick: onDelete },
    ];

    return (
        <article className="punk-card group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
            <button type="button" className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-muted/50 text-left" onClick={onOpen} aria-label={`查看 ${asset.title}`}>
                {cover ? (
                    <img loading="lazy" decoding="async" src={cover} alt={asset.title} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : asset.kind === "video" ? (
                    <video src={asset.data.url + "#t=0.1"} muted playsInline preload="metadata" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                    <span className="flex size-full items-center justify-center bg-muted/60 p-5 text-center text-xs leading-6 text-muted-foreground">{asset.kind === "text" ? asset.data.content : "暂无封面"}</span>
                )}
                <span className="absolute left-2.5 top-2.5 inline-flex h-5 items-center rounded-[3px] border border-white/15 bg-black/55 px-1.5 font-mono text-[10px] tracking-[0.12em] text-white/90 uppercase backdrop-blur">
                    {assetKindLabel(asset.kind)}
                </span>
            </button>
            <div className="flex flex-1 flex-col gap-2.5 p-4">
                <button type="button" className="cursor-pointer text-left" onClick={onOpen}>
                    <h2 className="line-clamp-1 text-sm font-medium text-foreground">{asset.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{summary}</p>
                </button>
                <div className="flex flex-wrap gap-1.5">
                    {(asset.tags || []).slice(0, 3).map((tag) => (
                        <Tag key={tag} className="!m-0 !rounded-[3px] !text-[10px]">{tag}</Tag>
                    ))}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <span className="truncate font-mono text-[10px] tracking-[0.1em] text-muted-foreground/70 uppercase">{asset.source || "未标注来源"}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                        {actions.map((action) => (
                            <Button key={action.key} type="text" size="small" className="!px-1.5" icon={action.icon} onClick={action.onClick} aria-label={action.label} title={action.label} />
                        ))}
                    </div>
                </div>
            </div>
        </article>
    );
}

function AssetDrawer({ asset, onClose, onCopy, onDownload }: { asset: Asset | null; onClose: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void }) {
    const copyText = useCopyText();
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    const prompt = asset ? assetPrompt(asset) : "";
    return (
        <Drawer title="素材详情" open={Boolean(asset)} size="large" onClose={onClose} destroyOnHidden>
            {asset ? (
                <div className="grid gap-4">
                    {asset.kind === "image" && cover ? (
                        <Image src={cover} alt={asset.title} className="rounded-xl border border-border/60" style={{ maxHeight: "42vh", width: "auto", maxWidth: "100%", objectFit: "contain" }} preview={{ getContainer: () => document.body }} />
                    ) : null}
                    {asset.kind === "video" ? <video src={asset.data.url} controls className="aspect-video w-full rounded-xl border border-border/60 bg-black" /> : null}
                    {asset.kind === "audio" ? <div className="rounded-xl border border-border/60 bg-card/40 p-4"><audio src={asset.data.url} controls className="w-full" /></div> : null}

                    <div>
                        <h2 className="break-words text-lg font-semibold leading-7 text-foreground">{asset.title || "未命名素材"}</h2>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Tag className="!m-0">{assetKindLabel(asset.kind)}</Tag>
                            {asset.category ? <Tag className="!m-0" color="processing">{asset.category}</Tag> : null}
                            {(asset.tags || []).map((tag) => <Tag key={tag} className="!m-0">{tag}</Tag>)}
                        </div>
                    </div>

                    {asset.kind === "text" ? (
                        <section className="grid gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">内容</span>
                                <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => onCopy(asset)}>复制文本</Button>
                            </div>
                            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground/85">{asset.data.content}</p>
                        </section>
                    ) : null}

                    {prompt ? (
                        <section className="grid gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">提示词</span>
                                <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(prompt, "提示词已复制")}>复制提示词</Button>
                            </div>
                            <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-background/40 px-2.5 py-2 font-mono text-[11px] leading-6 text-foreground/80">{prompt}</p>
                        </section>
                    ) : null}

                    <section className="grid gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
                        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60 uppercase">文件信息</span>
                        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                            {assetMetaLines(asset).map(([label, value]) => (
                                <div key={label} className="grid gap-0.5">
                                    <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/50 uppercase">{label}</span>
                                    <span className="break-words text-[11px] leading-5 text-foreground/80">{value}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="flex flex-wrap gap-2 pt-1">
                        {asset.kind === "text" ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(asset)}>复制文本</Button>
                        ) : (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(asset)}>
                                {asset.kind === "video" ? "下载视频" : asset.kind === "audio" ? "下载音频" : "下载图片"}
                            </Button>
                        )}
                    </div>
                </div>
            ) : null}
        </Drawer>
    );
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
    return [asset.title, asset.source || "", asset.category || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}

function assetKindLabel(kind: AssetKind) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "文本";
}
