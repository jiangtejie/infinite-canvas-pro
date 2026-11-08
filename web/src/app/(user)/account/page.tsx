"use client";

import { Avatar, App, Button, Empty, Form, Input, Modal, QRCode, Table, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CreditCard, FileText, LockKeyhole, ReceiptText, UserRound, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/use-user-store";
import {
    changeAccountPassword,
    createInvoice,
    createRechargeOrder,
    fetchAccountProfile,
    fetchCreditLogs,
    fetchInvoices,
    fetchRechargeOrder,
    fetchRechargeOrders,
    fetchRechargePackages,
    updateAccountProfile,
    type CreditLog,
    type InvoiceRequest,
    type RechargeOrder,
    type RechargePackage,
} from "@/services/api/account";

const TABS = ["概览", "账户资料", "微信充值", "充值订单", "积分流水", "开票申请"] as const;
type Tab = (typeof TABS)[number];

const CARD = "rounded-xl border border-border bg-card/60";
const LABEL = "flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground/80 uppercase";

export default function AccountPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const params = useSearchParams();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const setSession = useUserStore((state) => state.setSession);
    const [tab, setTab] = useState<Tab>(params.get("tab") === "recharge" ? "微信充值" : "概览");
    const [packages, setPackages] = useState<RechargePackage[]>([]);
    const [orders, setOrders] = useState<RechargeOrder[]>([]);
    const [logs, setLogs] = useState<CreditLog[]>([]);
    const [invoices, setInvoices] = useState<InvoiceRequest[]>([]);
    const [activeOrder, setActiveOrder] = useState<RechargeOrder | null>(null);
    const [saving, setSaving] = useState(false);

    // 头像菜单等入口会以 /account?tab=recharge 打开；同路由跳转时组件不重建，需要跟随参数切页签。
    useEffect(() => {
        if (params.get("tab") === "recharge") setTab("微信充值");
    }, [params]);

    useEffect(() => {
        if (!token) return;
        Promise.all([fetchAccountProfile(token), fetchRechargePackages(token), fetchRechargeOrders(token), fetchCreditLogs(token), fetchInvoices(token)])
            .then(([profile, pkgs, os, ls, inv]) => {
                setSession(token, profile);
                setPackages(pkgs);
                setOrders(os.items);
                setLogs(ls.items);
                setInvoices(inv);
            })
            .catch((error) => message.error(error.message));
    }, [message, setSession, token]);

    useEffect(() => {
        if (!activeOrder || activeOrder.status !== "pending") return;
        const timer = window.setInterval(async () => {
            try {
                const next = await fetchRechargeOrder(activeOrder.id, token);
                setActiveOrder(next);
                if (next.status === "paid") {
                    const [profile, os, ls] = await Promise.all([fetchAccountProfile(token), fetchRechargeOrders(token), fetchCreditLogs(token)]);
                    setSession(token, profile);
                    setOrders(os.items);
                    setLogs(ls.items);
                    message.success("充值成功");
                }
            } catch {
                /* transient polling errors retry on next interval */
            }
        }, 2000);
        return () => window.clearInterval(timer);
    }, [activeOrder, message, setSession, token]);

    const balance = useMemo(() => Number(user?.credits || 0).toLocaleString(), [user?.credits]);
    const displayName = user?.displayName || user?.username || "未登录";

    async function saveProfile(values: { displayName: string; avatarUrl: string; email: string }) {
        setSaving(true);
        try {
            setSession(token, await updateAccountProfile(values, token));
            message.success("资料已保存");
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setSaving(false);
        }
    }

    async function savePassword(values: { oldPassword: string; newPassword: string }) {
        setSaving(true);
        try {
            await changeAccountPassword(values.oldPassword, values.newPassword, token);
            useUserStore.getState().clearSession();
            message.success("密码已修改，请重新登录");
            router.replace("/login?redirect=%2Faccount");
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setSaving(false);
        }
    }

    async function buy(pkg: RechargePackage) {
        try {
            setActiveOrder(await createRechargeOrder(pkg.id, token));
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    async function submitInvoice(values: { orderNo: string; title: string; taxNumber: string; email: string }) {
        try {
            const item = await createInvoice(values, token);
            setInvoices((old) => [item, ...old]);
            message.success("开票申请已提交");
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    return (
        <main className="h-full overflow-y-auto bg-transparent">
            <div className="page-shell py-10 sm:py-12">
                <button
                    type="button"
                    className="mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-none"
                    onClick={() => router.push("/")}
                >
                    <ArrowLeft className="size-3.5" />
                    返回工作台
                </button>

                <section className="relative overflow-hidden pb-8">
                    <div aria-hidden className="neon-bloom-b pointer-events-none -right-16 -top-24 h-[260px] w-[380px] opacity-30" />
                    <div className="relative flex flex-wrap items-end justify-between gap-8">
                        <div className="flex min-w-0 items-center gap-5">
                            <Avatar
                                size={64}
                                src={user?.avatarUrl ? <img src={user.avatarUrl} alt={displayName} referrerPolicy="no-referrer" /> : undefined}
                                className="!flex !items-center !justify-center rounded-xl border border-border bg-muted text-lg font-semibold text-foreground"
                            >
                                {displayName.slice(0, 1).toUpperCase()}
                            </Avatar>
                            <div className="min-w-0">
                                <span className="eyebrow">账户中心</span>
                                <h1 className="mt-3 truncate text-[clamp(1.65rem,2.6vw,2.35rem)] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">{displayName}</h1>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[11px] text-muted-foreground">@{user?.username || "guest"}</span>
                                    <span className="chip">{user?.role === "admin" ? "管理员" : "普通用户"}</span>
                                </div>
                            </div>
                        </div>
                        <div className="punk-panel flex w-full flex-col gap-2 rounded-xl px-5 py-4 sm:w-auto sm:min-w-[220px]">
                            <div className={LABEL}>
                                <Wallet className="size-3.5" />
                                算力点余额
                            </div>
                            <div className="text-3xl font-semibold tabular-nums tracking-tight">{balance}</div>
                        </div>
                    </div>
                    <div aria-hidden className="punk-rule mt-8" />
                </section>

                <div role="tablist" aria-label="用户中心分区" className="hide-scrollbar -mt-1 flex gap-1 overflow-x-auto scroll-px-3 border-b border-border/70 pr-8 [mask-image:linear-gradient(to_right,black_calc(100%_-_28px),transparent)] sm:pr-0 sm:[mask-image:none]">
                    {TABS.map((item) => (
                        <button
                            key={item}
                            type="button"
                            role="tab"
                            aria-selected={tab === item}
                            className={cn(
                                "relative inline-flex min-h-10 shrink-0 items-center px-3 pb-2.5 pt-1.5 text-[13px] transition-colors focus-visible:outline-none sm:px-3.5 sm:pb-3 sm:pt-2",
                                tab === item ? "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:bg-acid" : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => setTab(item)}
                        >
                            {item}
                        </button>
                    ))}
                </div>

                <div className="mt-6 pb-10">
                    {tab === "概览" ? (
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className={cn(CARD, "flex min-h-[92px] items-center gap-4 p-5 transition-colors hover:border-acid/40")}>
                                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground/70"><UserRound className="size-4.5" /></span>
                                <div className="min-w-0">
                                    <div className={LABEL}>账户</div>
                                    <div className="mt-1 truncate text-lg font-semibold">{displayName}</div>
                                </div>
                            </div>
                            <div className={cn(CARD, "flex min-h-[92px] items-center gap-4 p-5 transition-colors hover:border-acid/40")}>
                                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground/70"><CreditCard className="size-4.5" /></span>
                                <div>
                                    <div className={LABEL}>算力点余额</div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">{balance}</div>
                                </div>
                            </div>
                            <div className={cn(CARD, "flex min-h-[92px] items-center gap-4 p-5 transition-colors hover:border-acid/40")}>
                                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground/70"><FileText className="size-4.5" /></span>
                                <div>
                                    <div className={LABEL}>充值记录</div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">{orders.length} <span className="text-sm font-normal text-foreground/55">笔订单</span></div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {tab === "账户资料" ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className={cn(CARD, "p-6")}>
                                <h2 className="text-sm font-semibold">基本资料</h2>
                                <Form className="mt-4" layout="vertical" requiredMark={false} initialValues={{ displayName: user?.displayName, avatarUrl: user?.avatarUrl, email: "" }} onFinish={saveProfile}>
                                    <Form.Item label="昵称" name="displayName"><Input maxLength={40} /></Form.Item>
                                    <Form.Item label="头像地址" name="avatarUrl"><Input maxLength={500} /></Form.Item>
                                    <Form.Item label="邮箱" name="email"><Input type="email" maxLength={120} /></Form.Item>
                                    <Button type="primary" htmlType="submit" loading={saving}>保存资料</Button>
                                </Form>
                            </div>
                            <div className={cn(CARD, "p-6")}>
                                <h2 className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="size-4" />修改密码</h2>
                                <Form className="mt-4" layout="vertical" requiredMark={false} onFinish={savePassword}>
                                    <Form.Item label="当前密码" name="oldPassword" rules={[{ required: true }]}><Input.Password /></Form.Item>
                                    <Form.Item label="新密码（至少 6 位）" name="newPassword" rules={[{ required: true, min: 6 }]}><Input.Password /></Form.Item>
                                    <Button htmlType="submit" loading={saving}>更新密码</Button>
                                </Form>
                            </div>
                        </div>
                    ) : null}

                    {tab === "微信充值" ? (
                        packages.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {packages.map((pkg) => (
                                    <div key={pkg.id} className="punk-card brackets relative flex flex-col rounded-xl border border-border bg-card/60 p-5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-foreground">{pkg.name}</span>
                                            <span className="chip">微信支付</span>
                                        </div>
                                        <div className="mt-4 flex items-baseline gap-1">
                                            <span className="text-sm text-muted-foreground">¥</span>
                                            <span className="text-3xl font-semibold tabular-nums tracking-tight">{(pkg.amountFen / 100).toFixed(2)}</span>
                                        </div>
                                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                            到账 <span className="font-medium text-foreground">{pkg.credits + pkg.bonus}</span> 算力点
                                            {pkg.bonus ? `（含赠送 ${pkg.bonus}）` : ""}
                                        </p>
                                        <Button type="primary" className="mt-5" onClick={() => void buy(pkg)}>
                                            微信扫码支付
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={cn(CARD, "p-4")}><Empty description="暂无可用充值套餐" /></div>
                        )
                    ) : null}

                    {tab === "充值订单" ? (
                        <div className={cn(CARD, "thin-scrollbar overflow-x-auto p-2 [&_.ant-table]:min-w-[760px] [&_.ant-table-cell]:whitespace-nowrap")}>
                            <Table
                                rowKey="id"
                                size="middle"
                                dataSource={orders}
                                pagination={false}
                                locale={{ emptyText: <Empty description="暂无充值订单" /> }}
                                columns={[
                                    { title: "订单号", dataIndex: "orderNo" },
                                    { title: "套餐", dataIndex: "packageName" },
                                    { title: "金额", render: (_, order: RechargeOrder) => `¥${(order.amountFen / 100).toFixed(2)}` },
                                    { title: "到账算力点", dataIndex: "credits" },
                                    { title: "状态", render: (_, order: RechargeOrder) => <Tag color={order.status === "paid" ? "green" : order.status === "pending" ? "gold" : "default"}>{order.status === "paid" ? "已支付" : order.status === "pending" ? "待支付" : "已过期"}</Tag> },
                                    { title: "创建时间", dataIndex: "createdAt" },
                                ]}
                            />
                        </div>
                    ) : null}

                    {tab === "积分流水" ? (
                        <div className={cn(CARD, "thin-scrollbar overflow-x-auto p-2 [&_.ant-table]:min-w-[720px] [&_.ant-table-cell]:whitespace-nowrap")}>
                            <Table
                                rowKey="id"
                                size="middle"
                                dataSource={logs}
                                pagination={{ pageSize: 10 }}
                                locale={{ emptyText: <Empty description="暂无积分流水" /> }}
                                columns={[
                                    { title: "类型", dataIndex: "type", render: (value: string) => ({ recharge: "充值", ai_consume: "AI 消耗", ai_refund: "AI 退款", admin_adjust: "管理员调整" })[value] || value },
                                    { title: "变动", dataIndex: "amount", render: (value: number) => <span className={cn("tabular-nums", value > 0 ? "text-emerald-500" : "text-rose-500")}>{value > 0 ? "+" : ""}{value}</span> },
                                    { title: "余额", dataIndex: "balance", render: (value: number) => <span className="tabular-nums">{value}</span> },
                                    { title: "说明", dataIndex: "remark" },
                                    { title: "时间", dataIndex: "createdAt" },
                                ]}
                            />
                        </div>
                    ) : null}

                    {tab === "开票申请" ? (
                        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
                            <div className={cn(CARD, "p-6")}>
                                <h2 className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="size-4" />提交开票申请</h2>
                                <Form className="mt-4" layout="vertical" requiredMark={false} onFinish={submitInvoice}>
                                    <Form.Item label="已支付订单号" name="orderNo" rules={[{ required: true }]}><Input /></Form.Item>
                                    <Form.Item label="发票抬头" name="title" rules={[{ required: true }]}><Input /></Form.Item>
                                    <Form.Item label="税号" name="taxNumber"><Input /></Form.Item>
                                    <Form.Item label="接收邮箱" name="email" rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
                                    <Button type="primary" htmlType="submit">提交申请</Button>
                                </Form>
                            </div>
                            <div className={cn(CARD, "p-6")}>
                                <h2 className="text-sm font-semibold">申请记录</h2>
                                {invoices.length ? (
                                    <div className="mt-2 divide-y divide-border/60">
                                        {invoices.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                                                <span className="min-w-0 truncate">{item.title} · {item.orderNo}</span>
                                                <Tag className="!m-0">{item.status === "pending" ? "处理中" : item.status}</Tag>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Empty description="暂无开票申请" />
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <Modal title="微信扫码支付" open={Boolean(activeOrder)} footer={null} centered onCancel={() => setActiveOrder(null)}>
                {activeOrder ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                        <p className="text-sm text-foreground/70">{activeOrder.packageName} · ¥{(activeOrder.amountFen / 100).toFixed(2)}</p>
                        {activeOrder.codeUrl ? <QRCode value={activeOrder.codeUrl} size={220} /> : <p className="text-sm">订单状态：{activeOrder.status}</p>}
                        <p className="text-xs text-muted-foreground">请使用微信扫码，订单 15 分钟内有效</p>
                        <Tag color={activeOrder.status === "paid" ? "green" : "gold"} className="!m-0">
                            {activeOrder.status === "paid" ? "支付成功" : activeOrder.status === "expired" ? "订单已过期" : "等待支付"}
                        </Tag>
                    </div>
                ) : null}
            </Modal>
        </main>
    );
}
