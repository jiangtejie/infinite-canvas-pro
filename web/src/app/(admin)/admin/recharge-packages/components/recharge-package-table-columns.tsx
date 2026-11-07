"use client";

import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Popconfirm, Space, Switch, Tag, Typography } from "antd";
import dayjs from "dayjs";

import type { AdminRechargePackage } from "@/services/api/admin";

import type { PackageFormValues } from "../recharge-package-utils";

export function buildRechargePackageColumns({
    onEdit,
    onDelete,
    onToggle,
}: {
    onEdit: (values: PackageFormValues) => void;
    onDelete: (item: AdminRechargePackage) => void;
    onToggle: (item: AdminRechargePackage, enabled: boolean) => void;
}): ProColumns<AdminRechargePackage>[] {
    return [
            { title: "套餐名称", dataIndex: "name", width: 160 },
            {
                title: "价格",
                dataIndex: "amountFen",
                width: 120,
                render: (_, item) => <Typography.Text strong>¥{(item.amountFen / 100).toFixed(2)}</Typography.Text>,
            },
            { title: "到账算力", dataIndex: "credits", width: 110, render: (_, item) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{item.credits}</span> },
            {
                title: "赠送算力",
                dataIndex: "bonus",
                width: 110,
                render: (_, item) =>
                    item.bonus > 0 ? <Tag color="gold">+{item.bonus}</Tag> : <Typography.Text type="secondary">-</Typography.Text>,
            },
            { title: "排序", dataIndex: "sort", width: 80 },
            {
                title: "上架状态",
                dataIndex: "enabled",
                width: 120,
                render: (_, item) => (
                    <Switch
                        checked={item.enabled}
                        checkedChildren="在售"
                        unCheckedChildren="下架"
                        onChange={(checked) => void onToggle(item, checked)}
                    />
                ),
            },
            {
                title: "更新时间",
                dataIndex: "updatedAt",
                width: 180,
                render: (_, item) => (
                    <Typography.Text type="secondary">
                        {item.updatedAt ? dayjs(item.updatedAt).format("YYYY-MM-DD HH:mm") : "-"}
                    </Typography.Text>
                ),
            },
            {
                title: "操作",
                key: "actions",
                width: 110,
                render: (_, item) => (
                    <Space size={4}>
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() =>
                                onEdit({
                                    id: item.id,
                                    name: item.name,
                                    amountYuan: item.amountFen / 100,
                                    credits: item.credits,
                                    bonus: item.bonus,
                                    sort: item.sort,
                                    enabled: item.enabled,
                                })
                            }
                        />
                        <Popconfirm title={`删除套餐「${item.name}」？`} description="已生成的订单不受影响。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void onDelete(item)}>
                            <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Space>
                ),
            },
    ];
}
