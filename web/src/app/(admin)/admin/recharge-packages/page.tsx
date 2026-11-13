"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Card, Space, Tag, Typography } from "antd";

import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AdminRechargePackage } from "@/services/api/admin";

import { AdminPageHeader } from "../components/admin-page-header";
import { buildAdminTableProps } from "../components/admin-table-props";
import { RechargePackageModal } from "./components/recharge-package-modal";
import { buildRechargePackageColumns } from "./components/recharge-package-table-columns";
import { useAdminRechargePackages } from "./hooks/use-admin-recharge-packages";
import { DEFAULT_PACKAGE_VALUES } from "./recharge-package-utils";

export default function AdminRechargePackagesPage() {
    const { items, isLoading, editing, setEditing, saving, form, reload, save, remove, toggleEnabled } = useAdminRechargePackages();
    const confirm = useConfirm();
    const confirmDelete = async (item: AdminRechargePackage) => {
        const confirmed = await confirm({
            title: `删除套餐「${item.name}」？`,
            description: "删除后用户端不再展示该套餐，已生成的订单不受影响。",
            confirmText: "删除",
            tone: "danger",
        });
        if (confirmed) await remove(item);
    };
    const columns = buildRechargePackageColumns({ onEdit: setEditing, onDelete: (item) => void confirmDelete(item), onToggle: toggleEnabled });

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader />
            <Card variant="borderless">
                <Typography.Text type="secondary">
                    这里的调整会立即影响用户中心「微信充值」里展示的套餐；下架的套餐不再出现在用户端，已创建的订单不受影响。
                </Typography.Text>
            </Card>
            <ProTable<AdminRechargePackage>
                {...buildAdminTableProps({ scrollX: 1000, onReload: () => void reload() })}
                rowKey="id"
                columns={columns}
                dataSource={items}
                loading={isLoading}
                headerTitle={
                    <Space>
                        <Typography.Text strong>充值套餐</Typography.Text>
                        <Tag>{items.length} 个</Tag>
                    </Space>
                }
                toolBarRender={() => [
                    <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ ...DEFAULT_PACKAGE_VALUES, sort: items.length + 1 })}>
                        新增套餐
                    </Button>,
                ]}
                pagination={false}
            />

            <RechargePackageModal editing={editing} form={form} saving={saving} onCancel={() => setEditing(null)} onSave={() => void save()} />
        </main>
    );
}
