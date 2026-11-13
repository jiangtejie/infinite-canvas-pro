"use client";

import { MoreOutlined } from "@ant-design/icons";
import { Button, Dropdown, Switch, Tag } from "antd";
import dayjs from "dayjs";

import type { AdminRechargePackage } from "@/services/api/admin";

export function RechargePackageCard({
    item,
    onEdit,
    onDelete,
    onToggle,
}: {
    item: AdminRechargePackage;
    onEdit: (item: AdminRechargePackage) => void;
    onDelete: (item: AdminRechargePackage) => void;
    onToggle: (item: AdminRechargePackage, enabled: boolean) => void;
}) {
    return (
        <article className="admin-gallery-card flex flex-col gap-5 p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-foreground" title={item.name}>
                        {item.name}
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        排序 {item.sort} · {item.updatedAt ? dayjs(item.updatedAt).format("YYYY-MM-DD HH:mm") : "-"}
                    </p>
                </div>
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [
                            { key: "edit", label: "编辑套餐" },
                            { type: "divider" },
                            { key: "delete", label: "删除套餐", danger: true },
                        ],
                        onClick: ({ key }) => (key === "edit" ? onEdit(item) : onDelete(item)),
                    }}
                >
                    <Button type="text" size="small" icon={<MoreOutlined />} aria-label="套餐操作" title="套餐操作" />
                </Dropdown>
            </div>

            <div className="flex items-end justify-between gap-3">
                <div>
                    <p className="text-[11px] text-muted-foreground">售价</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                        <span className="mr-0.5 text-sm font-normal text-muted-foreground">¥</span>
                        {(item.amountFen / 100).toFixed(2)}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-muted/60 px-2.5 py-1 text-[12px] text-foreground">到账 {item.credits}</span>
                {item.bonus > 0 ? (
                    <Tag className="!m-0" color="warning">
                        赠送 +{item.bonus}
                    </Tag>
                ) : null}
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="text-[11px] text-muted-foreground">上架状态</span>
                <Switch checked={item.enabled} checkedChildren="在售" unCheckedChildren="下架" onChange={(checked) => void onToggle(item, checked)} />
            </div>
        </article>
    );
}
