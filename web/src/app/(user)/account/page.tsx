"use client";

import { App, Button, Empty, Form, Input, Modal, QRCode, Table, Tag } from "antd";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CreditCard, FileText, LockKeyhole, ReceiptText, Wallet } from "lucide-react";

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

const CARD = "acct-card";
const LABEL = "flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground/80 uppercase";
const PAGE_SIZE = 10;

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
    const [orderTotal, setOrderTotal] = useState(0);
    const [orderPage, setOrderPage] = useState(1);
    const [logs, setLogs] = useState<CreditLog[]>([]);
    const [logTotal, setLogTotal] = useState(0);
    const [logPage, setLogPage] = useState(1);
    const [invoices, setInvoices] = useState<InvoiceRequest[]>([]);
    const [activeOrder, setActiveOrder] = useState<RechargeOrder | null>(null);
    const [saving, setSaving] = useState(false);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    // 头像菜单等入口会以 /account?tab=recharge 打开；同路由跳转时组件不重建，需要跟随参数切页签。
    useEffect(() => {
        if (params.get("tab") === "recharge") setTab("微信充值");
    }, [params]);

    useEffect(() => {
        if (!token) return;
        Promise.all([fetchAccountProfile(token), fetchRechargePackages(token), fetchRechargeOrders(token, 1, PAGE_SIZE), fetchCreditLogs(token, 1, PAGE_SIZE), fetchInvoices(token)])
            .then(([profile, pkgs, os, ls, inv]) => {
                setSession(token, profile);
                setPackages(pkgs);
                setOrders(os.items);
                setOrderTotal(os.total);
                setLogs(ls.items);
                setLogTotal(ls.total);
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
                    const [profile, os, ls] = await Promise.all([fetchAccountProfile(token), fetchRechargeOrders(token, 1, PAGE_SIZE), fetchCreditLogs(token, 1, PAGE_SIZE)]);
                    setSession(token, profile);
                    setOrders(os.items);
                    setOrderTotal(os.total);
                    setOrderPage(1);
                    setLogs(ls.items);
                    setLogTotal(ls.total);
                    setLogPage(1);
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
    const activeTabIndex = TABS.indexOf(tab);

    const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + step + TABS.length) % TABS.length;
        tabRefs.current[nextIndex]?.focus();
        setTab(TABS[nextIndex]);
    };

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

    async function loadOrders(page: number) {
        try {
            const result = await fetchRechargeOrders(token, page, PAGE_SIZE);
            setOrders(result.items);
            setOrderTotal(result.total);
            setOrderPage(page);
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    async function loadLogs(page: number) {
        try {
            const result = await fetchCreditLogs(token, page, PAGE_SIZE);
            setLogs(result.items);
            setLogTotal(result.total);
            setLogPage(page);
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    return (
        <main className="account-shell h-full overflow-y-auto bg-transparent">
            <div className="page-shell py-12 sm:py-16">
                <button
                    type="button"
                    className="mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-none"
                    onClick={() => router.push("/")}
                >
                    <ArrowLeft className="size-3.5" />
                    返回工作台
                </button>

                <section className="relative overflow-hidden pb-10">
                    <div aria-hidden className="neon-bloom-b pointer-events-none -right-16 -top-24 h-[260px] w-[380px] opacity-30" />
                    <div className="relative flex flex-wrap items-end justify-between gap-8">
                        <div className="flex min-w-0 items-center gap-5">
                            <div
                                className="grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-[8px] border text-xl font-semibold text-foreground"
                                style={{ backgroundColor: "color-mix(in oklch, var(--acid) 12%, transparent)", borderColor: "color-mix(in oklch, var(--acid) 35%, transparent)" }}
                            >
                                {user?.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={displayName} referrerPolicy="no-referrer" className="size-full object-cover" />
                                ) : (
                                    displayName.slice(0, 1).toUpperCase()
                                )}
                            </div>
                            <div className="min-w-0">
                                <span className="eyebrow">账户中心</span>
                                <h1 className="mt-3 truncate text-[clamp(1.9rem,2.8vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">{displayName}</h1>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[11px] text-muted-foreground">@{user?.username || "guest"}</span>
                                    <span className="chip">{user?.role === "admin" ? "管理员" : "普通用户"}</span>
                                </div>
                            </div>
                        </div>
                        <div className="punk-panel flex w-full flex-col gap-2.5 rounded-[8px] px-6 py-5 sm:w-auto sm:min-w-[240px]">
                            <div className={LABEL}>
                                <Wallet className="size-3.5" />
                                算力点余额
                            </div>
                            <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{balance}</div>
                        </div>
                    </div>
                    <div aria-hidden className="punk-rule mt-10" />
                </section>

                <div role="tablist" aria-label="用户中心分区" className="acct-tabs -mt-1">
                    {TABS.map((item, index) => (
                        <button
                            key={item}
                            ref={(node) => {
                                tabRefs.current[index] = node;
                            }}
                            type="button"
                            role="tab"
                            id={`acct-tab-${index}`}
                            aria-controls="acct-tabpanel"
                            aria-selected={tab === item}
                            tabIndex={tab === item ? 0 : -1}
                            data-active={tab === item}
                            className="acct-tab"
                            style={tab === item ? { backgroundColor: "transparent" } : undefined}
                            onClick={() => setTab(item)}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                        >
                            {item}
                        </button>
                    ))}
                </div>

                <div id="acct-tabpanel" role="tabpanel" aria-labelledby={`acct-tab-${activeTabIndex}`} className="mt-8 pb-16">
                    {tab === "概览" ? (
                        <div className="grid gap-5 sm:grid-cols-3">
                            <div className={cn(CARD, "acct-stat flex min-h-[112px] items-center gap-5 p-6")}>
                                <span className="grid size-12 shrink-0 place-items-center rounded-[8px] border border-border bg-background text-foreground/70"><CreditCard className="size-5" /></span>
                                <div className="min-w-0">
                                    <div className={LABEL}>充值订单</div>
                                    <div className="mt-1 font-mono text-3xl font-semibold tabular-nums">{orderTotal} <span className="text-sm font-normal text-foreground/55">笔</span></div>
                                </div>
                            </div>
                            <div className={cn(CARD, "acct-stat flex min-h-[112px] items-center gap-5 p-6")}>
                                <span className="grid size-12 shrink-0 place-items-center rounded-[8px] border border-border bg-background text-foreground/70"><FileText className="size-5" /></span>
                                <div className="min-w-0">
                                    <div className={LABEL}>积分流水</div>
                                    <div className="mt-1 font-mono text-3xl font-semibold tabular-nums">{logTotal} <span className="text-sm font-normal text-foreground/55">条</span></div>
                                </div>
                            </div>
                            <div className={cn(CARD, "acct-stat flex min-h-[112px] items-center gap-5 p-6")}>
                                <span className="grid size-12 shrink-0 place-items-center rounded-[8px] border border-border bg-background text-foreground/70"><ReceiptText className="size-5" /></span>
                                <div className="min-w-0">
                                    <div className={LABEL}>开票申请</div>
                                    <div className="mt-1 font-mono text-3xl font-semibold tabular-nums">{invoices.length} <span className="text-sm font-normal text-foreground/55">单</span></div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {tab === "账户资料" ? (
                        <div className="grid gap-5 md:grid-cols-2">
                            <div className={cn(CARD, "p-7")}>
                                <h2 className="text-base font-semibold">基本资料</h2>
                                <Form className="mt-4" layout="vertical" requiredMark={false} initialValues={{ displayName: user?.displayName, avatarUrl: user?.avatarUrl, email: user?.email ?? "" }} onFinish={saveProfile}>
                                    <Form.Item label="昵称" name="displayName"><Input maxLength={40} /></Form.Item>
                                    <Form.Item label="头像地址" name="avatarUrl"><Input maxLength={500} /></Form.Item>
                                    <Form.Item label="邮箱" name="email"><Input type="email" maxLength={120} /></Form.Item>
                                    <Button type="primary" htmlType="submit" loading={saving}>保存资料</Button>
                                </Form>
                            </div>
                            <div className={cn(CARD, "p-7")}>
                                <h2 className="flex items-center gap-2 text-base font-semibold"><LockKeyhole className="size-4" />修改密码</h2>
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
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {packages.map((pkg) => (
                                    <div key={pkg.id} className="acct-card punk-card relative flex flex-col p-6">
                                        <span className="text-sm font-medium text-foreground">{pkg.name}</span>
                                        <div className="mt-4 flex items-baseline gap-1">
                                            <span className="text-sm text-muted-foreground">¥</span>
                                            <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{(pkg.amountFen / 100).toFixed(2)}</span>
                                        </div>
                                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                            到账 <span className="font-medium text-foreground">{pkg.credits + pkg.bonus}</span> 算力点
                                            {pkg.bonus ? `（含赠送 ${pkg.bonus}）` : ""}
                                        </p>
                                        <Button type="primary" className="mt-6" onClick={() => void buy(pkg)}>
                                            微信扫码支付
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={cn(CARD, "p-5")}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用充值套餐" /></div>
                        )
                    ) : null}

                    {tab === "充值订单" ? (
                        <div className={cn(CARD, "thin-scrollbar overflow-x-auto p-2.5 [&_.ant-table]:min-w-[760px] [&_.ant-table-cell]:whitespace-nowrap")}>
                            <Table
                                rowKey="id"
                                size="middle"
                                dataSource={orders}
                                pagination={{ current: orderPage, pageSize: PAGE_SIZE, total: orderTotal, showSizeChanger: false, hideOnSinglePage: true, onChange: (page) => void loadOrders(page) }}
                                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无充值订单" /> }}
                                columns={[
                                    { title: "订单号", dataIndex: "orderNo" },
                                    { title: "套餐", dataIndex: "packageName" },
                                    { title: "金额", align: "right", render: (_, order: RechargeOrder) => `¥${(order.amountFen / 100).toFixed(2)}` },
                                    { title: "到账算力点", dataIndex: "credits", align: "right" },
                                    { title: "状态", align: "center", render: (_, order: RechargeOrder) => <Tag color={order.status === "paid" ? "green" : order.status === "pending" ? "gold" : "default"}>{order.status === "paid" ? "已支付" : order.status === "pending" ? "待支付" : "已过期"}</Tag> },
                                    { title: "创建时间", dataIndex: "createdAt" },
                                ]}
                            />
                        </div>
                    ) : null}

                    {tab === "积分流水" ? (
                        <div className={cn(CARD, "thin-scrollbar overflow-x-auto p-2.5 [&_.ant-table]:min-w-[720px] [&_.ant-table-cell]:whitespace-nowrap")}>
                            <Table
                                rowKey="id"
                                size="middle"
                                dataSource={logs}
                                pagination={{ current: logPage, pageSize: PAGE_SIZE, total: logTotal, showSizeChanger: false, hideOnSinglePage: true, onChange: (page) => void loadLogs(page) }}
                                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无积分流水" /> }}
                                columns={[
                                    { title: "类型", dataIndex: "type", align: "center", render: (value: string) => ({ recharge: "充值", ai_consume: "AI 消耗", ai_refund: "AI 退款", admin_adjust: "管理员调整" })[value] || value },
                                    { title: "变动", dataIndex: "amount", align: "right", render: (value: number) => <span className={cn("tabular-nums", value > 0 ? "text-emerald-500" : "text-rose-500")}>{value > 0 ? "+" : ""}{value}</span> },
                                    { title: "余额", dataIndex: "balance", align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
                                    { title: "说明", dataIndex: "remark" },
                                    { title: "时间", dataIndex: "createdAt" },
                                ]}
                            />
                        </div>
                    ) : null}

                    {tab === "开票申请" ? (
                        <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
                            <div className={cn(CARD, "p-7")}>
                                <h2 className="flex items-center gap-2 text-base font-semibold"><ReceiptText className="size-4" />提交开票申请</h2>
                                <Form className="mt-4" layout="vertical" requiredMark={false} onFinish={submitInvoice}>
                                    <Form.Item label="已支付订单号" name="orderNo" rules={[{ required: true }]}><Input /></Form.Item>
                                    <Form.Item label="发票抬头" name="title" rules={[{ required: true }]}><Input /></Form.Item>
                                    <Form.Item label="税号" name="taxNumber"><Input /></Form.Item>
                                    <Form.Item label="接收邮箱" name="email" rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
                                    <Button type="primary" htmlType="submit">提交申请</Button>
                                </Form>
                            </div>
                            <div className={cn(CARD, "p-7")}>
                                <h2 className="text-base font-semibold">申请记录</h2>
                                {invoices.length ? (
                                    <div className="mt-2 divide-y divide-border/60">
                                        {invoices.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between gap-3 py-3.5 text-sm">
                                                <span className="min-w-0 truncate">{item.title} <span className="font-mono text-[11px] text-muted-foreground">· {item.orderNo}</span></span>
                                                <Tag className="!m-0">{item.status === "pending" ? "处理中" : item.status}</Tag>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无开票申请" />
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <Modal title="微信扫码支付" className="acct-modal" open={Boolean(activeOrder)} footer={null} centered onCancel={() => setActiveOrder(null)}>
                {activeOrder ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                        <p className="text-sm text-foreground/70">{activeOrder.packageName} · ¥{(activeOrder.amountFen / 100).toFixed(2)}</p>
                        {activeOrder.codeUrl ? <QRCode value={activeOrder.codeUrl} size={240} /> : <p className="text-sm">订单状态：{activeOrder.status}</p>}
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
