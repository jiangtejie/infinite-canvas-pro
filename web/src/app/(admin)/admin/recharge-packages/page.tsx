"use client";

import { PlusOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { Button, Card, Space, Tag, Typography } from "antd";

import type { AdminRechargePackage } from "@/services/api/admin";

import { RechargePackageModal } from "./components/recharge-package-modal";
import { buildRechargePackageColumns } from "./components/recharge-package-table-columns";
import { useAdminRechargePackages } from "./hooks/use-admin-recharge-packages";
import { DEFAULT_PACKAGE_VALUES } from "./recharge-package-utils";

export default function AdminRechargePackagesPage() {
    const { items, isLoading, editing, setEditing, saving, form, reload, save, remove, toggleEnabled } = useAdminRechargePackages();
    const columns = buildRechargePackageColumns({ onEdit: setEditing, onDelete: remove, onToggle: toggleEnabled });

    return (
        <main style={{ padding: 24 }}>
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Card variant="borderless">
                    <Typography.Text type="secondary">
                        这里的调整会立即影响用户中心「微信充值」里展示的套餐；下架的套餐不再出现在用户端，已创建的订单不受影响。
                    </Typography.Text>
                </Card>
                <ProTable<AdminRechargePackage>
                    rowKey="id"
                    columns={columns}
                    dataSource={items}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    scroll={{ x: 1000 }}
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>充值套餐</Typography.Text>
                            <Tag>{items.length} 个</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void reload() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ ...DEFAULT_PACKAGE_VALUES, sort: items.length + 1 })}>
                            新增套餐
                        </Button>,
                    ]}
                    pagination={false}
                />
            </Space>

            <RechargePackageModal editing={editing} form={form} saving={saving} onCancel={() => setEditing(null)} onSave={() => void save()} />
        </main>
    );
}
