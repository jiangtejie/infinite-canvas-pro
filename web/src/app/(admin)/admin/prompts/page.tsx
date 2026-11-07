"use client";

import { DeleteOutlined, PlusOutlined, SyncOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Flex, Form, Modal, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { Prompt } from "@/services/api/prompts";

import { PromptFilterBar } from "./components/prompt-filter-bar";
import { PromptDetailModal, PromptEditorModal, PromptSyncModal } from "./components/prompt-modals";
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
    const [keywordText, setKeywordText] = useState(keyword);
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

    useEffect(() => setKeywordText(keyword), [keyword]);

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
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <PromptFilterBar
                    keywordText={keywordText}
                    setKeywordText={setKeywordText}
                    category={category}
                    tag={tag}
                    categories={categories}
                    tags={tags}
                    searchPrompts={searchPrompts}
                    changeCategory={changeCategory}
                    changeTag={changeTag}
                    resetFilters={resetFilters}
                />
                <ProTable<Prompt>
                    rowKey="id"
                    columns={columns}
                    dataSource={prompts}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1000 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>提示词列表</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshPrompts() }}
                    rowSelection={{ selectedRowKeys: selectedPromptIds, onChange: (keys) => setSelectedPromptIds(keys.map(String)) }}
                    toolBarRender={() => [
                        <Button key="batch-delete" danger icon={<DeleteOutlined />} disabled={!selectedPromptIds.length} onClick={() => setIsBatchDeleteOpen(true)}>
                            批量删除{selectedPromptIds.length ? ` ${selectedPromptIds.length}` : ""}
                        </Button>,
                        <Button key="sync" icon={<SyncOutlined />} onClick={() => setIsSyncOpen(true)}>
                            同步
                        </Button>,
                        <Button key="sync-all" icon={<SyncOutlined />} loading={isSyncing} onClick={() => void syncAllCategories()}>
                            全部同步
                        </Button>,
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingPrompt({ category: defaultCategory, tags: [] })}>
                            新增
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Flex>

            <PromptEditorModal editingPrompt={editingPrompt} form={form} categories={categories} onCancel={() => setEditingPrompt(null)} onOk={() => void savePrompt()} />
            <PromptDetailModal detailPrompt={detailPrompt} categories={categories} onClose={() => setDetailPrompt(null)} />
            <PromptSyncModal open={isSyncOpen} syncing={isSyncing} categories={categories} onClose={() => setIsSyncOpen(false)} onSync={syncCategory} />

            <Modal
                title="删除提示词"
                open={Boolean(deletingPrompt)}
                onCancel={() => setDeletingPrompt(null)}
                onOk={async () => {
                    if (!deletingPrompt) return;
                    await deletePrompt(deletingPrompt.id);
                    setDeletingPrompt(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deletingPrompt?.title}」吗？删除后会从当前分类中删除。
            </Modal>

            <Modal title="批量删除提示词" open={isBatchDeleteOpen} onCancel={() => setIsBatchDeleteOpen(false)} onOk={() => void batchDeletePrompts()} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除已选中的 {selectedPromptIds.length} 条提示词吗？删除后会从当前分类中删除。
            </Modal>
        </main>
    );
}
