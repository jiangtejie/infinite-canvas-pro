"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Form, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AdminAsset } from "@/services/api/admin";

import { AdminPageHeader } from "../components/admin-page-header";
import { buildAdminPagination, buildAdminTableProps } from "../components/admin-table-props";
import type { AssetFormValues } from "./asset-utils";
import { AssetFilterBar } from "./components/asset-filter-bar";
import { AssetDeleteModal, AssetDetailModal, AssetEditorModal } from "./components/asset-modals";
import { buildAssetColumns } from "./components/asset-table-columns";
import { useAdminAssets } from "./use-admin-assets";

export default function AdminAssetsPage() {
    const { assets, tags, keyword, kind, tag, page, pageSize, total, isLoading, searchAssets, changeKind, changeTag, changePage, changePageSize, resetFilters, refreshAssets, saveAsset: saveAdminAsset, deleteAsset } = useAdminAssets();
    const [form] = Form.useForm<AssetFormValues>();
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

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader />
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
                toolBarRender={() => [
                    <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingAsset({ type: "text", tags: [] })}>
                        新增
                    </Button>,
                ]}
                pagination={buildAdminPagination({ page, pageSize, total, changePage, changePageSize })}
            />

            <AssetEditorModal editingAsset={editingAsset} form={form} onCancel={() => setEditingAsset(null)} onOk={() => void saveAsset()} />
            <AssetDetailModal detailAsset={detailAsset} onClose={() => setDetailAsset(null)} />
            <AssetDeleteModal deletingAsset={deletingAsset} onCancel={() => setDeletingAsset(null)} onOk={() => void deleteSelectedAsset()} />
        </main>
    );
}
