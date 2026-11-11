"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Flex, Space, Table, Tag, Typography } from "antd";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { isWorkflowProtocol } from "@/lib/model-channel";

import { modelSummary } from "../settings-utils";
import type { AdminSettingsController } from "../use-admin-settings";

export function AdminSettingsPrivateChannels({ settings }: { settings: AdminSettingsController }) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const { channels, channelTableData, openChannelDrawer, openTestDialog, persistChannels } = settings;
    return (
        <>
                                <Flex justify="space-between" align="center" gap={12} wrap>
                                    <Typography.Text strong>渠道配置</Typography.Text>
                                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openChannelDrawer(null)}>
                                        新增渠道
                                    </Button>
                                </Flex>
                                <Table
                                    rowKey="_rowKey"
                                    pagination={false}
                                    dataSource={channelTableData}
                                    columns={[
                                        { title: "名称", dataIndex: "name", render: (value) => value || "未命名渠道" },
                                        { title: "协议", dataIndex: "protocol", width: 96, align: "center", render: (value) => <Tag>{value || "openai"}</Tag> },
                                        { title: "状态", dataIndex: "enabled", width: 120, align: "center", render: (value, item) => isWorkflowProtocol(item.protocol) ? <Tag>{`启用 ${(item.workflows || []).filter((entry) => entry.enabled).length} / ${(item.workflows || []).length} 条`}</Tag> : <Tag color={value ? "success" : "default"}>{value ? "已启用" : "已停用"}</Tag> },
                                        {
                                            title: "模型",
                                            dataIndex: "models",
                                            render: (value: string[], item) => (
                                                <Typography.Text ellipsis style={{ maxWidth: 360 }}>
                                                    {isWorkflowProtocol(item.protocol) ? (item.workflows || []).map((entry) => entry.title || entry.workflowId).join("、") || "未配置工作流" : modelSummary(value || [])}
                                                </Typography.Text>
                                            ),
                                        },
                                        { title: "权重", dataIndex: "weight", width: 88, align: "right" },
                                        { title: "超时", dataIndex: "timeout", width: 96, align: "right", render: (value) => `${value || 600}s` },
                                        {
                                            title: "操作",
                                            key: "actions",
                                            width: 220,
                                            align: "center",
                                            render: (_, item) => (
                                                <Space size={4}>
                                                    {!isWorkflowProtocol(item.protocol) ? <Button size="small" onClick={() => openTestDialog(item._index)}>测试</Button> : null}
                                                    <Button size="small" onClick={() => openChannelDrawer(item._index)}>
                                                        编辑
                                                    </Button>
                                                    <Button
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        onClick={async () => {
                                                            const confirmed = await confirm({
                                                                title: `删除渠道「${item.name || "未命名渠道"}」？`,
                                                                description: "删除后会立即保存当前表单的全部设置（含其它页签未保存的编辑），该操作不可撤销。",
                                                                confirmText: "删除",
                                                                tone: "danger",
                                                            });
                                                            if (!confirmed) return;
                                                            const nextChannels = [...channels];
                                                            nextChannels.splice(item._index, 1);
                                                            try {
                                                                await persistChannels(nextChannels);
                                                            } catch (error) {
                                                                message.error(error instanceof Error ? error.message : "删除渠道失败");
                                                            }
                                                        }}
                                                    />
                                                </Space>
                                            ),
                                        },
                                    ]}
                                />
        </>
    );
}
