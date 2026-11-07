"use client";

import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Avatar, Button, Flex, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";

import type { AdminUser } from "@/services/api/admin";

export function buildUserColumns({
    onEdit,
    onDelete,
}: {
    onEdit: (user: AdminUser) => void;
    onDelete: (user: AdminUser) => void;
}): ProColumns<AdminUser>[] {
    return [
        {
            title: "用户",
            dataIndex: "username",
            width: 260,
            render: (_, item) => (
                <Flex align="center" gap={10} style={{ minWidth: 0 }}>
                    <Avatar src={item.avatarUrl || undefined}>{(item.displayName || item.username || "U").slice(0, 1).toUpperCase()}</Avatar>
                    <Flex vertical style={{ minWidth: 0 }}>
                        <Typography.Text strong ellipsis>
                            {item.displayName || item.username}
                        </Typography.Text>
                        <Typography.Text type="secondary" ellipsis>
                            {item.username}
                        </Typography.Text>
                    </Flex>
                </Flex>
            ),
        },
        {
            title: "角色",
            dataIndex: "role",
            width: 100,
            render: (_, item) => <Tag color={item.role === "admin" ? "gold" : "default"}>{item.role === "admin" ? "管理员" : "用户"}</Tag>,
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 90,
            render: (_, item) => <Tag color={item.status === "ban" ? "red" : "green"}>{item.status === "ban" ? "禁用" : "正常"}</Tag>,
        },
        {
            title: "算力点",
            dataIndex: "credits",
            width: 100,
            render: (_, item) => <Typography.Text>{item.credits}</Typography.Text>,
        },
        {
            title: "最近登录",
            dataIndex: "lastLoginAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.lastLoginAt ? dayjs(item.lastLoginAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
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
