"use client";

import { DeleteOutlined, EditOutlined, EyeOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Image, Space, Tag, Tooltip, Typography } from "antd";

import type { AdminAsset } from "@/services/api/admin";

import { assetTypeLabel } from "../asset-utils";

export function buildAssetColumns({
    onDetail,
    onEdit,
    onDelete,
}: {
    onDetail: (asset: AdminAsset) => void;
    onEdit: (asset: AdminAsset) => void;
    onDelete: (asset: AdminAsset) => void;
}): ProColumns<AdminAsset>[] {
    return [
        {
            title: "封面",
            dataIndex: "coverUrl",
            width: 88,
            render: (_, item) => <Image src={item.coverUrl || item.url || "/logo.svg"} alt={item.title} width={56} height={42} style={{ objectFit: "cover", borderRadius: 6 }} preview={{ mask: "放大" }} fallback="/logo.svg" />,
        },
        {
            title: "标题",
            dataIndex: "title",
            width: 260,
            render: (_, item) => (
                <Typography.Link strong ellipsis style={{ maxWidth: 260, display: "block" }} onClick={() => onDetail(item)}>
                    {item.title}
                </Typography.Link>
            ),
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 84,
            render: (_, item) => <Tag>{assetTypeLabel(item.type)}</Tag>,
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
            title: "分类",
            dataIndex: "category",
            width: 120,
            render: (_, item) => <Typography.Text type="secondary">{item.category || "未标注"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 112,
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
