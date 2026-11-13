"use client";

import { Button, Tag, type TableColumnsType } from "antd";

import type { AdminAICallLog } from "@/services/api/admin";

export function buildAiLogColumns({ onDetail }: { onDetail: (log: AdminAICallLog) => void }): TableColumnsType<AdminAICallLog> {
    return [
        { title: "时间", dataIndex: "createdAt", width: 160, render: (value: string) => <span className="admin-cell-muted">{formatLogTime(value)}</span> },
        { title: "用户", dataIndex: "userDisplayName", width: 130, ellipsis: true, render: (_: string, item: AdminAICallLog) => item.userDisplayName || item.userId || "-" },
        {
            title: "模型 / 接口",
            dataIndex: "model",
            ellipsis: true,
            render: (_: string, item: AdminAICallLog) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{item.model || "-"}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{item.endpoint || "-"}</div>
                </div>
            ),
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 90,
            align: "center",
            render: (status: number, item: AdminAICallLog) => <Tag color={!item.failed && status >= 200 && status < 400 ? "success" : "error"}>{status || "失败"}</Tag>,
        },
        { title: "耗时", dataIndex: "durationMs", width: 90, align: "right", render: (value: number) => formatLogElapsed(value) },
        {
            title: "扣点",
            dataIndex: "credits",
            width: 80,
            align: "right",
            responsive: ["lg"],
            render: (value: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{value ?? 0}</span>,
        },
        {
            title: "操作",
            key: "actions",
            width: 80,
            align: "center",
            render: (_: unknown, item: AdminAICallLog) => (
                <Button type="text" size="small" onClick={() => onDetail(item)}>
                    详情
                </Button>
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
