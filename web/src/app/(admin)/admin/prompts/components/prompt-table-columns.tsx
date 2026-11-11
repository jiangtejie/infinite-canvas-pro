"use client";

import { DeleteOutlined, EditOutlined, EyeOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Image, Space, Tag, Tooltip, Typography } from "antd";

import type { AdminPromptCategory } from "@/services/api/admin";
import type { Prompt } from "@/services/api/prompts";

export function buildPromptColumns({
    categories,
    onDetail,
    onEdit,
    onDelete,
}: {
    categories: AdminPromptCategory[];
    onDetail: (prompt: Prompt) => void;
    onEdit: (prompt: Prompt) => void;
    onDelete: (prompt: Prompt) => void;
}): ProColumns<Prompt>[] {
    const categoryName = (category: string) => categories.find((item) => item.category === category)?.name || category;
    return [
        {
            title: "封面",
            dataIndex: "coverUrl",
            width: 88,
            render: (_, item) => <Image src={item.coverUrl || "/logo.svg"} alt={item.title} width={56} height={42} style={{ objectFit: "cover", borderRadius: 6 }} preview={{ mask: "放大" }} fallback="/logo.svg" />,
        },
        {
            title: "标题",
            dataIndex: "title",
            width: 260,
            render: (_, item) => (
                <button
                    type="button"
                    onClick={() => onDetail(item)}
                    title={item.title}
                    className="block max-w-[260px] cursor-pointer truncate text-left font-medium text-foreground transition-colors hover:text-acid"
                >
                    {item.title}
                </button>
            ),
        },
        {
            title: "分类",
            dataIndex: "category",
            width: 150,
            render: (_, item) => <Typography.Text type="secondary">{categoryName(item.category)}</Typography.Text>,
        },
        {
            title: "标签",
            dataIndex: "tags",
            width: 180,
            render: (_, item) => (
                <Space size={[4, 4]} wrap>
                    {(item.tags || []).slice(0, 3).map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: "操作",
            key: "actions",
            width: 112,
            align: "center",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="详情">
                        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => onDetail(item)} />
                    </Tooltip>
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
