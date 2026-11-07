"use client";

import { CopyOutlined } from "@ant-design/icons";
import { Button, Flex, Form, Image, Input, Modal, Select, Space, Tag, Typography, type FormInstance } from "antd";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useCopyText } from "@/hooks/use-copy-text";
import type { AdminAsset } from "@/services/api/admin";

import { assetEditTypeOptions, assetTypeLabel, type AssetFormValues } from "../asset-utils";

export function AssetEditorModal({
    editingAsset,
    form,
    onCancel,
    onOk,
}: {
    editingAsset: Partial<AdminAsset> | null;
    form: FormInstance<AssetFormValues>;
    onCancel: () => void;
    onOk: () => void;
}) {
    const formType = Form.useWatch("type", form) || editingAsset?.type || "text";
    return (
            <Modal forceRender title={editingAsset?.id ? "编辑素材" : "新增素材"} open={Boolean(editingAsset)} width={760} onCancel={onCancel} onOk={onOk} okText="保存" cancelText="取消">
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
                        <Select options={assetEditTypeOptions} />
                    </Form.Item>
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="coverUrl" label="封面 URL">
                        <Input />
                    </Form.Item>
                    <Form.Item name="tagText" label="标签，用逗号分隔">
                        <Input />
                    </Form.Item>
                    <Form.Item name="category" label="分类">
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    {formType === "image" || formType === "video" || formType === "audio" ? (
                        <Form.Item name="url" label={formType === "image" ? "图片 URL" : formType === "video" ? "视频 URL" : "音频 URL"} rules={[{ required: true, message: formType === "image" ? "请输入图片 URL" : formType === "video" ? "请输入视频 URL" : "请输入音频 URL" }]}>
                            <Input />
                        </Form.Item>
                    ) : (
                        <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                            <Input.TextArea rows={6} />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
    );
}

export function AssetDetailModal({ detailAsset, onClose }: { detailAsset: AdminAsset | null; onClose: () => void }) {
    const copyText = useCopyText();
    return (
            <Modal title="素材详情" open={Boolean(detailAsset)} width={760} onCancel={onClose} footer={<Button onClick={() => onClose()}>关闭</Button>}>
                {detailAsset ? (
                    <Flex vertical gap={14}>
                        <Flex gap={14} align="start">
                            <Image src={detailAsset.coverUrl || detailAsset.url || "/logo.svg"} alt={detailAsset.title} width={116} height={84} style={{ objectFit: "cover", borderRadius: 8 }} preview={{ mask: "放大" }} fallback="/logo.svg" />
                            <Flex vertical gap={8} style={{ minWidth: 0 }}>
                                <Typography.Title level={5} style={{ margin: 0 }}>
                                    {detailAsset.title}
                                </Typography.Title>
                                <Space wrap>
                                    <Tag>{assetTypeLabel(detailAsset.type)}</Tag>
                                    {detailAsset.category ? <Tag>{detailAsset.category}</Tag> : null}
                                    {(detailAsset.tags || []).map((tag) => (
                                        <Tag key={tag}>{tag}</Tag>
                                    ))}
                                </Space>
                            </Flex>
                        </Flex>
                        {detailAsset.description ? (
                            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                                {detailAsset.description}
                            </Typography.Paragraph>
                        ) : null}
                        <Input.TextArea value={detailAsset.type === "text" ? detailAsset.content : detailAsset.url || detailAsset.coverUrl} rows={7} readOnly />
                        <Flex gap={8} wrap>
                            <Button icon={<CopyOutlined />} onClick={() => copyText(detailAsset.type === "text" ? detailAsset.content : detailAsset.url || detailAsset.coverUrl)}>
                                复制内容
                            </Button>
                        </Flex>
                    </Flex>
                ) : null}
            </Modal>
    );
}

export function AssetDeleteModal({
    deletingAsset,
    onCancel,
    onOk,
}: {
    deletingAsset: AdminAsset | null;
    onCancel: () => void;
    onOk: () => Promise<void> | void;
}) {
    return (
        <ConfirmDialog
            open={Boolean(deletingAsset)}
            title="删除素材"
            description={`确定删除「${deletingAsset?.title}」吗？删除后会从服务器素材库中移除。`}
            confirmText="删除"
            tone="danger"
            onCancel={onCancel}
            onConfirm={onOk}
        />
    );
}
