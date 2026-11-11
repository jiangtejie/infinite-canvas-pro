"use client";

import { EyeOutlined } from "@ant-design/icons";
import { Button, Space, Tag, type TableColumnsType } from "antd";

import type { AdminAICallLog } from "@/services/api/admin";

export type AiLogDetail = { title: string; value: string };

export function buildAiLogColumns({ onDetail }: { onDetail: (detail: AiLogDetail) => void }): TableColumnsType<AdminAICallLog> {
    return [
            { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => <span className="admin-cell-muted">{formatLogTime(value)}</span> },
            { title: "用户", dataIndex: "userDisplayName", width: 150, render: (_: string, item: AdminAICallLog) => item.userDisplayName || item.userId || "-" },
            { title: "接口", dataIndex: "endpoint", width: 170 },
            { title: "模型", dataIndex: "model", width: 180, ellipsis: true },
            { title: "渠道", dataIndex: "channelName", width: 150, ellipsis: true, render: (_: string, item: AdminAICallLog) => item.channelName || item.channelId || "-" },
            { title: "状态", dataIndex: "status", width: 90, align: "center", render: (status: number, item: AdminAICallLog) => <Tag color={!item.failed && status >= 200 && status < 400 ? "success" : "error"}>{status || "失败"}</Tag> },
            { title: "耗时", dataIndex: "durationMs", width: 110, align: "right", render: (value: number) => formatLogElapsed(value) },
            { title: "扣点", dataIndex: "credits", width: 80, align: "right" },
            {
                title: "操作",
                key: "actions",
                width: 180,
                align: "center",
                fixed: "right" as const,
                render: (_: unknown, item: AdminAICallLog) => (
                    <Space size={6}>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => onDetail({ title: "请求详情", value: item.requestBody })}>
                            请求详情
                        </Button>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => onDetail({ title: "返回详情", value: item.responseBody || item.error })}>
                            返回详情
                        </Button>
                    </Space>
                ),
            },
    ];
}

export function formatLogTime(value: string) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatLogElapsed(value: number) {
    if (!Number.isFinite(value) || value <= 0) return "-";
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}
