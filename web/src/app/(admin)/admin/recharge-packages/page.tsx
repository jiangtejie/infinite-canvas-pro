"use client";

import { PlusOutlined } from "@ant-design/icons";
import { Button, Empty } from "antd";

import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AdminRechargePackage } from "@/services/api/admin";

import { AdminGallerySkeleton } from "../components/admin-gallery-skeleton";
import { AdminPageHeader } from "../components/admin-page-header";
import { RechargePackageCard } from "./components/recharge-package-card";
import { RechargePackageModal } from "./components/recharge-package-modal";
import { useAdminRechargePackages } from "./hooks/use-admin-recharge-packages";
import { DEFAULT_PACKAGE_VALUES } from "./recharge-package-utils";

export default function AdminRechargePackagesPage() {
    const { items, isLoading, editing, setEditing, saving, form, save, remove, toggleEnabled } = useAdminRechargePackages();
    const confirm = useConfirm();
    const editPackage = (item: AdminRechargePackage) =>
        setEditing({
            id: item.id,
            name: item.name,
            amountYuan: item.amountFen / 100,
            credits: item.credits,
            bonus: item.bonus,
            sort: item.sort,
            enabled: item.enabled,
        });
    const confirmDelete = async (item: AdminRechargePackage) => {
        const confirmed = await confirm({
            title: `删除套餐「${item.name}」？`,
            description: "删除后用户端不再展示该套餐，已生成的订单不受影响。",
            confirmText: "删除",
            tone: "danger",
        });
        if (confirmed) await remove(item);
    };

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader
                actions={
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ ...DEFAULT_PACKAGE_VALUES, sort: items.length + 1 })}>
                        新增套餐
                    </Button>
                }
            />
            <p className="text-[13px] leading-6 text-muted-foreground">这里的调整会立即影响用户中心「微信充值」里展示的套餐；下架的套餐不再出现在用户端，已创建的订单不受影响。</p>

            {isLoading && !items.length ? (
                <AdminGallerySkeleton count={3} className="xl:grid-cols-3" />
            ) : items.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => (
                        <RechargePackageCard key={item.id} item={item} onEdit={editPackage} onDelete={(item) => void confirmDelete(item)} onToggle={toggleEnabled} />
                    ))}
                </div>
            ) : (
                <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-[var(--admin-line)] bg-card/40">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无充值套餐">
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ ...DEFAULT_PACKAGE_VALUES, sort: 1 })}>
                            新增套餐
                        </Button>
                    </Empty>
                </div>
            )}

            <RechargePackageModal editing={editing} form={form} saving={saving} onCancel={() => setEditing(null)} onSave={() => void save()} />
        </main>
    );
}
