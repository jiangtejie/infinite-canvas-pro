"use client";

import { CopyOutlined } from "@ant-design/icons";
import { Button, Flex, Form, Image, Input, Modal, Select, Space, Table, Tag, Typography, type FormInstance } from "antd";

import { useCopyText } from "@/hooks/use-copy-text";
import type { AdminPromptCategory } from "@/services/api/admin";
import type { Prompt } from "@/services/api/prompts";

export function PromptEditorModal({
    editingPrompt,
    form,
    categories,
    onCancel,
    onOk,
}: {
    editingPrompt: Partial<Prompt> | null;
    form: FormInstance<Partial<Prompt> & { tagText?: string }>;
    categories: AdminPromptCategory[];
    onCancel: () => void;
    onOk: () => void;
}) {
    return (
            <Modal forceRender title={editingPrompt?.id ? "编辑提示词" : "新增提示词"} open={Boolean(editingPrompt)} width={720} onCancel={onCancel} onOk={onOk} okText="保存" cancelText="取消">
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="category" label="分类">
                        <Select options={categories.map((item) => ({ label: item.name, value: item.category }))} />
                    </Form.Item>
                    <Form.Item name="coverUrl" label="封面 URL">
                        <Input />
                    </Form.Item>
                    <Form.Item name="tagText" label="标签，用逗号分隔">
                        <Input />
                    </Form.Item>
                    <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: "请输入提示词" }]}>
                        <Input.TextArea rows={6} />
                    </Form.Item>
                </Form>
            </Modal>
    );
}

export function PromptDetailModal({
    detailPrompt,
    categories,
    onClose,
}: {
    detailPrompt: Prompt | null;
    categories: AdminPromptCategory[];
    onClose: () => void;
}) {
    const copyText = useCopyText();
    const categoryName = (category: string) => categories.find((item) => item.category === category)?.name || category;
    return (
            <Modal title="提示词详情" open={Boolean(detailPrompt)} width={760} onCancel={onClose} footer={<Button onClick={() => onClose()}>关闭</Button>}>
                {detailPrompt ? (
                    <Flex vertical gap={14}>
                        <Flex gap={14} align="start">
                            <Image src={detailPrompt.coverUrl || "/logo.svg"} alt={detailPrompt.title} width={116} height={84} style={{ objectFit: "cover", borderRadius: 8 }} preview={{ mask: "放大" }} fallback="/logo.svg" />
                            <Flex vertical gap={8} style={{ minWidth: 0 }}>
                                <Typography.Title level={5} style={{ margin: 0 }}>
                                    {detailPrompt.title}
                                </Typography.Title>
                                <Space wrap>
                                    <Tag>{categoryName(detailPrompt.category)}</Tag>
                                    {(detailPrompt.tags || []).map((tag) => (
                                        <Tag key={tag}>{tag}</Tag>
                                    ))}
                                </Space>
                            </Flex>
                        </Flex>
                        {detailPrompt.preview ? (
                            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                                {detailPrompt.preview}
                            </Typography.Paragraph>
                        ) : null}
                        <Input.TextArea value={detailPrompt.prompt} rows={8} readOnly />
                        <Space>
                            <Button icon={<CopyOutlined />} onClick={() => copyText(detailPrompt.prompt)}>
                                复制提示词
                            </Button>
                        </Space>
                    </Flex>
                ) : null}
            </Modal>
    );
}

export function PromptSyncModal({
    open,
    syncing,
    categories,
    onClose,
    onSync,
}: {
    open: boolean;
    syncing: boolean;
    categories: AdminPromptCategory[];
    onClose: () => void;
    onSync: (category: string) => Promise<unknown>;
}) {
    return (
            <Modal
                title="同步远程提示词源"
                open={open}
                width={640}
                onCancel={() => !syncing && onClose()}
                mask={{ closable: !syncing }}
                footer={
                    <Button disabled={syncing} onClick={onClose}>
                        取消
                    </Button>
                }
            >
                <Table
                    rowKey="category"
                    dataSource={categories.filter((item) => item.remote)}
                    pagination={false}
                    columns={[
                        {
                            title: "远程源",
                            dataIndex: "name",
                            render: (_, item) => (
                                <Flex align="center" gap={8}>
                                    {item.name}
                                </Flex>
                            ),
                        },
                        {
                            title: "",
                            key: "sync",
                            width: 96,
                            render: (_, item) => (
                                <Button
                                    type="primary"
                                    loading={syncing}
                                    onClick={async () => {
                                        try {
                                            await onSync(item.category);
                                            onClose();
                                        } catch {}
                                    }}
                                >
                                    同步
                                </Button>
                            ),
                        },
                    ]}
                />
            </Modal>
    );
}
