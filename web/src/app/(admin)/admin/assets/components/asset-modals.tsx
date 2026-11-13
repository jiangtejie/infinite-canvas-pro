"use client";

import { CopyOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, Modal, Select, Tag, type FormInstance } from "antd";
import dayjs from "dayjs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useCopyText } from "@/hooks/use-copy-text";
import type { AdminAsset } from "@/services/api/admin";

import { assetEditTypeOptions, assetTypeLabel, type AssetFormValues } from "../asset-utils";
import { AssetPreview } from "./asset-preview";

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
    // Form 必须常驻挂载：Modal 关闭时内容不渲染，若 useForm 实例一直没有连接 Form，开发环境会报 "Instance created by useForm is not connected to any Form element"。
    return (
            <Form form={form} component={false} layout="vertical" requiredMark={false}>
                <Modal forceRender title={editingAsset?.id ? "编辑素材" : "新增素材"} open={Boolean(editingAsset)} width={760} onCancel={onCancel} onOk={onOk} okText="保存" cancelText="取消">
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
                </Modal>
            </Form>
    );
}

export function AssetDetailDrawer({ detailAsset, onClose }: { detailAsset: AdminAsset | null; onClose: () => void }) {
    const copyText = useCopyText();
    const copyValue = detailAsset ? (detailAsset.type === "text" ? detailAsset.content : detailAsset.url || detailAsset.coverUrl) : "";
    return (
        <Drawer
            title="素材详情"
            open={Boolean(detailAsset)}
            size="min(860px, 96vw)"
            onClose={onClose}
            destroyOnHidden
            footer={
                <div className="flex justify-end">
                    <Button onClick={onClose}>关闭</Button>
                </div>
            }
        >
            {detailAsset ? (
                <div className="flex flex-col gap-5">
                    <div className="grid gap-5 sm:grid-cols-[240px_1fr]">
                        <div className="min-w-0">
                            <AssetPreview asset={detailAsset} mode="detail" />
                        </div>
                        <div className="flex min-w-0 flex-col gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">{detailAsset.title}</h2>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Tag>{assetTypeLabel(detailAsset.type)}</Tag>
                                    {detailAsset.category ? <Tag>{detailAsset.category}</Tag> : null}
                                    {(detailAsset.tags || []).map((tag) => (
                                        <Tag key={tag}>{tag}</Tag>
                                    ))}
                                </div>
                            </div>
                            {detailAsset.description ? <p className="text-sm leading-6 text-muted-foreground">{detailAsset.description}</p> : null}
                            {detailAsset.updatedAt ? <p className="text-xs text-muted-foreground">更新于 {dayjs(detailAsset.updatedAt).format("YYYY-MM-DD HH:mm")}</p> : null}
                            <Button className="self-start" icon={<CopyOutlined />} onClick={() => copyText(copyValue)}>
                                复制内容
                            </Button>
                        </div>
                    </div>
                    {detailAsset.type !== "text" ? (
                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-foreground">资源地址</h3>
                            <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-foreground">{copyValue || "-"}</pre>
                        </section>
                    ) : null}
                </div>
            ) : null}
        </Drawer>
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
