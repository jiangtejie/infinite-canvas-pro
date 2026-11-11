"use client";

import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";

import type { AdminCreditLog } from "@/services/api/admin";

const creditLogTypeLabels: Record<string, string> = {
    admin_adjust: "后台调整",
    ai_consume: "模型消费",
    ai_refund: "失败返还",
};

export function buildCreditLogColumns({
    onEdit,
    onDelete,
}: {
    onEdit: (log: AdminCreditLog) => void;
    onDelete: (log: AdminCreditLog) => void;
}): ProColumns<AdminCreditLog>[] {
    return [
        {
            title: "用户",
            dataIndex: "userDisplayName",
            width: 150,
            render: (_, item) => item.userDisplayName || "-",
        },
        {
            title: "用户 ID",
            dataIndex: "userId",
            width: 220,
            render: (_, item) => <Typography.Text copyable>{item.userId}</Typography.Text>,
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 140,
            align: "center",
            render: (_, item) => <Tag>{creditLogTypeLabels[item.type] || item.type || "-"}</Tag>,
        },
        {
            title: "变动",
            dataIndex: "amount",
            width: 100,
            align: "right",
            render: (_, item) => <Typography.Text type={item.amount >= 0 ? "success" : "danger"}>{item.amount}</Typography.Text>,
        },
        {
            title: "余额",
            dataIndex: "balance",
            width: 100,
            align: "right",
        },
        {
            title: "备注",
            dataIndex: "remark",
            ellipsis: true,
            render: (_, item) => <Typography.Text type="secondary">{item.remark || "-"}</Typography.Text>,
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "center",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => onDelete(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];
}
