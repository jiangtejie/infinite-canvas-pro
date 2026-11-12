"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal, Pagination, Spin, Tabs, Tag } from "antd";
import { Plus, Search } from "lucide-react";

import { AssetFormModal } from "@/components/assets/asset-form-modal";
import { ASSET_KIND_OPTIONS, assetKindLabel } from "@/components/assets/asset-browser";
import { FilterTagGroup } from "@/components/ui/filter-tag-group";
import { EmptyState, ErrorState } from "@/components/ui/state-panel";
import { errorMessage } from "@/lib/utils";
import type { AssetKind } from "@/stores/use-asset-store";
import { assetInsertPayload, libraryInsertPayload, useLibraryAssetBrowser, useMyAssetBrowser } from "../lib/canvas-asset-query";
import type { InsertAssetPayload } from "../types";

export type { InsertAssetPayload } from "../types";

export type AssetPickerTab = "my-assets" | "library";

type Props = {
    open: boolean;
    defaultTab?: AssetPickerTab;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

export function AssetPickerModal({ open, defaultTab = "my-assets", onInsert, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<AssetPickerTab>(defaultTab);

    useEffect(() => {
        if (open) setActiveTab(defaultTab);
    }, [open, defaultTab]);

    return (
        <Modal title="选择素材" open={open} onCancel={onClose} footer={null} width={860} destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}>
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as AssetPickerTab)}
                items={[
                    { key: "my-assets", label: "我的素材", children: <MyAssetsTab onInsert={onInsert} /> },
                    { key: "library", label: "素材库", children: <LibraryTab onInsert={onInsert} /> },
                ]}
            />
        </Modal>
    );
}

const PAGE_SIZE = 8;

function AssetFilters({ categories, tags, category, selectedTags, onCategoryChange, onTagsChange }: { categories: string[]; tags: string[]; category: string; selectedTags: string[]; onCategoryChange: (value: string) => void; onTagsChange: (values: string[]) => void }) {
    return (
        <div className="grid gap-3">
            <FilterTagGroup
                label="分类"
                options={[{ value: "", label: "全部" }, ...categories.map((value) => ({ value, label: value }))]}
                isSelected={(value) => category === value}
                onSelect={onCategoryChange}
            />
            <FilterTagGroup
                label="标签"
                options={[{ value: "", label: "全部" }, ...tags.map((tag) => ({ value: tag, label: tag }))]}
                isSelected={(value) => value ? selectedTags.includes(value) : selectedTags.length === 0}
                onSelect={(value) => onTagsChange(value ? (selectedTags.includes(value) ? selectedTags.filter((tag) => tag !== value) : [...selectedTags, value]) : [])}
            />
        </div>
    );
}

function KindFilter({ kind, onChange }: { kind: string; onChange: (value: string) => void }) {
    return (
        <FilterTagGroup
            inline
            className="min-h-6 items-center"
            options={ASSET_KIND_OPTIONS}
            isSelected={(value) => (kind || "all") === value}
            onSelect={(value) => onChange(value === "all" ? "" : value)}
        />
    );
}

function LibraryTab({ onInsert }: { onInsert: (payload: InsertAssetPayload) => void }) {
    const { keyword, setKeyword, kind, setKind, category, setCategory, tags, setTags, page, setPage, query, items, categories, availableTags, total } = useLibraryAssetBrowser(PAGE_SIZE, "asset-picker-library");

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-56"
                    size="small"
                    prefix={<Search className="size-3.5 text-muted-foreground" />}
                    placeholder="搜索素材"
                    value={keyword}
                    allowClear
                    onChange={(event) => setKeyword(event.target.value)}
                />
                <KindFilter kind={kind} onChange={setKind} />
            </div>
            <AssetFilters categories={categories} tags={availableTags} category={category} selectedTags={tags} onCategoryChange={setCategory} onTagsChange={setTags} />

            {query.isLoading ? (
                <div className="flex justify-center py-16">
                    <Spin />
                </div>
            ) : query.isError ? (
                <ErrorState className="py-12" description={errorMessage(query.error, "获取素材库失败，请稍后重试。")} onRetry={() => void query.refetch()} />
            ) : items.length ? (
                <div className="grid grid-cols-4 gap-3">
                    {items.map((asset) => (
                        <PickerCard key={asset.id} title={asset.title} kind={asset.type} cover={asset.coverUrl} onClick={() => onInsert(libraryInsertPayload(asset))} />
                    ))}
                </div>
            ) : (
                <EmptyState className="py-12" title="没有素材" description="调整筛选条件或联系管理员补充素材库。" />
            )}

            {total > PAGE_SIZE && (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} showSizeChanger={false} />
                </div>
            )}
        </div>
    );
}

function PickerCard({ title, kind, cover, onClick }: { title: string; kind: AssetKind; cover: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-foreground/40 hover:shadow-md"
            onClick={onClick}
        >
            {cover ? (
                <img loading="lazy" decoding="async" src={cover} alt={title} className="aspect-[4/3] w-full object-cover" />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-muted p-3 text-center text-xs leading-5 text-muted-foreground">{title}</div>
            )}
            <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-medium text-foreground">{title}</span>
                    <Tag className="m-0 shrink-0 text-[10px]">{assetKindLabel(kind)}</Tag>
                </div>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-black/55 group-hover:opacity-100">插入</div>
        </button>
    );
}

function MyAssetsTab({ onInsert }: { onInsert: (payload: InsertAssetPayload) => void }) {
    const { keyword, setKeyword, kind, setKind, category, setCategory, tags, setTags, page, setPage, categories, availableTags, items, total } = useMyAssetBrowser(PAGE_SIZE);
    const [createOpen, setCreateOpen] = useState(false);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="w-56"
                    size="small"
                    prefix={<Search className="size-3.5 text-muted-foreground" />}
                    placeholder="搜索素材"
                    value={keyword}
                    allowClear
                    onChange={(event) => setKeyword(event.target.value)}
                />
                <KindFilter kind={kind} onChange={setKind} />
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                    新增素材
                </Button>
            </div>
            <AssetFilters categories={categories} tags={availableTags} category={category} selectedTags={tags} onCategoryChange={setCategory} onTagsChange={setTags} />

            {items.length ? (
                <div className="grid grid-cols-4 gap-3">
                    {items.map((asset) => (
                        <PickerCard
                            key={asset.id}
                            title={asset.title}
                            kind={asset.kind}
                            cover={asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "")}
                            onClick={() => onInsert(assetInsertPayload(asset))}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState className="py-12" title="没有素材" description="调整筛选条件或先新增素材。" />
            )}

            {total > PAGE_SIZE && (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} showSizeChanger={false} />
                </div>
            )}
            <AssetFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
}
