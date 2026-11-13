"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Empty, Form, Pagination, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AdminAsset } from "@/services/api/admin";

import { AdminGallerySkeleton } from "../components/admin-gallery-skeleton";
import { AdminPageHeader } from "../components/admin-page-header";
import { buildAdminPagination, buildAdminTableProps } from "../components/admin-table-props";
import { AdminViewToggle, type AdminViewMode } from "../components/admin-view-toggle";
import type { AssetFormValues } from "./asset-utils";
import { AssetFilterBar } from "./components/asset-filter-bar";
import { AssetGalleryCard } from "./components/asset-gallery-card";
import { AssetDeleteModal, AssetDetailDrawer, AssetEditorModal } from "./components/asset-modals";
import { buildAssetColumns } from "./components/asset-table-columns";
import { useAdminAssets } from "./use-admin-assets";

export default function AdminAssetsPage() {
    const { assets, tags, keyword, kind, tag, page, pageSize, total, isLoading, searchAssets, changeKind, changeTag, changePage, changePageSize, resetFilters, refreshAssets, saveAsset: saveAdminAsset, deleteAsset } = useAdminAssets();
    const [form] = Form.useForm<AssetFormValues>();
    const [view, setView] = useState<AdminViewMode>("grid");
    const [editingAsset, setEditingAsset] = useState<Partial<AdminAsset> | null>(null);
    const [detailAsset, setDetailAsset] = useState<AdminAsset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<AdminAsset | null>(null);

    useEffect(() => {
        if (!editingAsset) return;
        form.setFieldsValue({
            type: "text",
            title: "",
            coverUrl: "",
            category: "",
            description: "",
            content: "",
            url: "",
            ...editingAsset,
            tagText: editingAsset.tags?.join(", ") || "",
        });
    }, [editingAsset, form]);

    const saveAsset = async () => {
        const value = await form.validateFields();
        const nextType = value.type || "text";
        await saveAdminAsset({
            ...editingAsset,
            ...value,
            type: nextType,
            coverUrl: value.coverUrl || (nextType === "image" ? value.url : ""),
            tags: (value.tagText || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
        });
        setEditingAsset(null);
    };

    const deleteSelectedAsset = async () => {
        if (!deletingAsset) return;
        await deleteAsset(deletingAsset.id);
        setDeletingAsset(null);
    };

    const columns = buildAssetColumns({
        onDetail: setDetailAsset,
        onEdit: setEditingAsset,
        onDelete: setDeletingAsset,
    });
    const pagination = buildAdminPagination({ page, pageSize, total, changePage, changePageSize });

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader
                actions={
                    <>
                        <AdminViewToggle value={view} onChange={setView} />
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditingAsset({ type: "text", tags: [] })}>
                            新增素材
                        </Button>
                    </>
                }
            />
            <AssetFilterBar
                keyword={keyword}
                kind={kind}
                tag={tag}
                tags={tags}
                onSearch={searchAssets}
                changeKind={changeKind}
                changeTag={changeTag}
                onReset={resetFilters}
            />

            {view === "grid" ? (
                <div className="flex flex-col gap-4">
                    <p className="text-[13px] text-muted-foreground">共 {total} 个素材</p>
                    {isLoading && !assets.length ? (
                        <AdminGallerySkeleton count={8} />
                    ) : assets.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {assets.map((asset) => (
                                <AssetGalleryCard key={asset.id} asset={asset} onDetail={setDetailAsset} onEdit={setEditingAsset} onDelete={setDeletingAsset} />
                            ))}
                        </div>
                    ) : (
                        <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-[var(--admin-line)] bg-card/40">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无素材">
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditingAsset({ type: "text", tags: [] })}>
                                    新增素材
                                </Button>
                            </Empty>
                        </div>
                    )}
                    {total > 0 ? (
                        <div className="flex justify-end">
                            <Pagination {...pagination} />
                        </div>
                    ) : null}
                </div>
            ) : (
                <ProTable<AdminAsset>
                    {...buildAdminTableProps({ onReload: () => void refreshAssets() })}
                    rowKey="id"
                    columns={columns}
                    dataSource={assets}
                    loading={isLoading}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>素材列表</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    pagination={pagination}
                />
            )}

            <AssetEditorModal editingAsset={editingAsset} form={form} onCancel={() => setEditingAsset(null)} onOk={() => void saveAsset()} />
            <AssetDetailDrawer detailAsset={detailAsset} onClose={() => setDetailAsset(null)} />
            <AssetDeleteModal deletingAsset={deletingAsset} onCancel={() => setDeletingAsset(null)} onOk={() => void deleteSelectedAsset()} />
        </main>
    );
}
