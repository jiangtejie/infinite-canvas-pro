"use client";

import { DeleteOutlined, PlusOutlined, SyncOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Form, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { Prompt } from "@/services/api/prompts";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { AdminPageHeader } from "../components/admin-page-header";
import { buildAdminPagination, buildAdminTableProps } from "../components/admin-table-props";
import { PromptCategoryTabs } from "./components/prompt-category-tabs";
import { PromptFilterBar } from "./components/prompt-filter-bar";
import { PromptDetailDrawer, PromptEditorModal, PromptSyncModal } from "./components/prompt-modals";
import { buildPromptColumns } from "./components/prompt-table-columns";
import { useAdminPrompts } from "./use-admin-prompts";

export default function AdminPromptsPage() {
    const {
        categories,
        prompts,
        tags,
        keyword,
        category,
        tag,
        page,
        pageSize,
        total,
        isLoading,
        isSyncing,
        searchPrompts,
        changeCategory,
        changeTag,
        changePage,
        changePageSize,
        resetFilters,
        refreshPrompts,
        syncCategory,
        syncAllCategories,
        savePrompt: saveAdminPrompt,
        deletePrompt,
        deletePrompts,
    } = useAdminPrompts();
    const [form] = Form.useForm<Partial<Prompt> & { tagText?: string }>();
    const [editingPrompt, setEditingPrompt] = useState<Partial<Prompt> | null>(null);
    const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
    const [deletingPrompt, setDeletingPrompt] = useState<Prompt | null>(null);
    const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>([]);
    const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
    const [isSyncOpen, setIsSyncOpen] = useState(false);
    const defaultCategory = categories[0]?.category || "";

    useEffect(() => {
        if (editingPrompt) form.setFieldsValue({ ...editingPrompt, tagText: editingPrompt.tags?.join(", ") || "" });
    }, [editingPrompt, form]);

    const savePrompt = async () => {
        const value = await form.validateFields();
        await saveAdminPrompt({
            ...editingPrompt,
            ...value,
            category: value.category || defaultCategory,
            tags: (value.tagText || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
        });
        setEditingPrompt(null);
    };

    const batchDeletePrompts = async () => {
        await deletePrompts(selectedPromptIds);
        setSelectedPromptIds([]);
        setIsBatchDeleteOpen(false);
    };

    const columns = buildPromptColumns({
        categories,
        onDetail: setDetailPrompt,
        onEdit: setEditingPrompt,
        onDelete: setDeletingPrompt,
    });

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader
                actions={
                    <>
                        <Button icon={<SyncOutlined />} onClick={() => setIsSyncOpen(true)}>
                            同步
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditingPrompt({ category: defaultCategory, tags: [] })}>
                            新增
                        </Button>
                    </>
                }
            />
            <div className="flex flex-col gap-3">
                <PromptCategoryTabs categories={categories} value={category} onChange={changeCategory} />
                <PromptFilterBar
                    keyword={keyword}
                    tag={tag}
                    tags={tags}
                    onSearch={searchPrompts}
                    changeTag={changeTag}
                    onReset={resetFilters}
                />
            </div>
            <ProTable<Prompt>
                {...buildAdminTableProps({ onReload: () => void refreshPrompts() })}
                rowKey="id"
                columns={columns}
                dataSource={prompts}
                loading={isLoading}
                headerTitle={
                    <Space>
                        <Typography.Text strong>提示词列表</Typography.Text>
                        <Tag>{total} 条</Tag>
                    </Space>
                }
                rowSelection={{ selectedRowKeys: selectedPromptIds, onChange: (keys) => setSelectedPromptIds(keys.map(String)) }}
                tableAlertRender={false}
                toolBarRender={() => [
                    <Button key="sync-all" icon={<SyncOutlined />} loading={isSyncing} onClick={() => void syncAllCategories()}>
                        全部同步
                    </Button>,
                ]}
                pagination={buildAdminPagination({ page, pageSize, total, changePage, changePageSize })}
            />

            {selectedPromptIds.length ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
                    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pl-4 pr-1.5 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.55)] backdrop-blur">
                        <span className="text-xs text-muted-foreground">已选 {selectedPromptIds.length} 条</span>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setIsBatchDeleteOpen(true)}>
                            删除
                        </Button>
                        <Button size="small" type="text" onClick={() => setSelectedPromptIds([])}>
                            取消
                        </Button>
                    </div>
                </div>
            ) : null}

            <PromptEditorModal editingPrompt={editingPrompt} form={form} categories={categories} onCancel={() => setEditingPrompt(null)} onOk={() => void savePrompt()} />
            <PromptDetailDrawer detailPrompt={detailPrompt} categories={categories} onClose={() => setDetailPrompt(null)} />
            <PromptSyncModal open={isSyncOpen} syncing={isSyncing} categories={categories} onClose={() => setIsSyncOpen(false)} onSync={syncCategory} />

            <ConfirmDialog
                open={Boolean(deletingPrompt)}
                title="删除提示词"
                description={`确定删除「${deletingPrompt?.title}」吗？删除后会从当前分类中删除。`}
                confirmText="删除"
                tone="danger"
                onCancel={() => setDeletingPrompt(null)}
                onConfirm={async () => {
                    if (!deletingPrompt) return;
                    await deletePrompt(deletingPrompt.id);
                    setDeletingPrompt(null);
                }}
            />

            <ConfirmDialog
                open={isBatchDeleteOpen}
                title="批量删除提示词"
                description={`确定删除已选中的 ${selectedPromptIds.length} 条提示词吗？删除后会从当前分类中删除。`}
                confirmText="删除"
                tone="danger"
                onCancel={() => setIsBatchDeleteOpen(false)}
                onConfirm={batchDeletePrompts}
            />
        </main>
    );
}
