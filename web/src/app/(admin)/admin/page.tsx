"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Tag } from "antd";
import dayjs from "dayjs";
import { Activity, ChevronRight, Coins, Gauge, RefreshCw, UserPlus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn, errorMessage } from "@/lib/utils";
import { fetchAdminOverview } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

import { AdminPageHeader } from "./components/admin-page-header";
import { OverviewPanel, OverviewStatCard, OverviewTrendChart } from "./components/overview/overview-widgets";

const creditTypeLabels: Record<string, string> = {
    admin_adjust: "后台调整",
    ai_consume: "模型消费",
    ai_refund: "失败返还",
    recharge: "充值",
};

const quickLinks = [
    { href: "/admin/users", label: "用户管理" },
    { href: "/admin/prompts", label: "提示词管理" },
    { href: "/admin/skills", label: "Skill 管理" },
    { href: "/admin/assets", label: "素材库" },
    { href: "/admin/recharge-packages", label: "充值套餐" },
    { href: "/admin/settings", label: "系统设置" },
];

const countFormatter = new Intl.NumberFormat("zh-CN");
const creditFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

export default function AdminOverviewPage() {
    const token = useUserStore((state) => state.token);
    const query = useQuery({
        queryKey: ["admin", "overview", token],
        queryFn: () => fetchAdminOverview(token),
        enabled: Boolean(token),
        staleTime: 60_000,
        retry: false,
    });
    const overview = query.data;
    const refresh = () => void query.refetch();

    if (!overview) {
        if (query.isError) {
            return (
                <main className="flex flex-col gap-5">
                    <AdminPageHeader actions={<Button icon={<RefreshCw className="size-3.5" />} onClick={refresh}>重试</Button>} />
                    <div className="rounded-xl border border-[var(--admin-line)] bg-card p-10 text-center">
                        <p className="text-sm text-muted-foreground">读取概览失败：{errorMessage(query.error, "请稍后重试")}</p>
                    </div>
                </main>
            );
        }
        return <OverviewSkeleton />;
    }

    const todayCalls = overview.ai.todayCalls;
    const successToday = todayCalls - overview.ai.todayFailed;
    const storageValue = overview.storage.configured ? (
        <span className="flex flex-col items-end gap-0.5">
            <span>{overview.storage.configured} 个配置</span>
            <span className="text-[10px] text-muted-foreground">
                已用 {formatBytes(overview.storage.usedBytes)}
                {overview.storage.limitBytes > 0 ? ` / ${formatBytes(overview.storage.limitBytes)}` : ""}
            </span>
            {overview.storage.exceeded > 0 ? <span className="text-[10px] text-[var(--hot)]">{overview.storage.exceeded} 个超限</span> : null}
        </span>
    ) : (
        "未配置"
    );

    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader
                actions={
                    <Button icon={<RefreshCw className="size-3.5" />} loading={query.isFetching} onClick={refresh}>
                        刷新
                    </Button>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <OverviewStatCard
                    icon={Activity}
                    label="今日 AI 调用"
                    value={formatCount(todayCalls)}
                    hint={todayCalls ? `${formatCount(successToday)} 成功 · ${formatCount(overview.ai.todayFailed)} 失败` : "今日暂无调用"}
                />
                <OverviewStatCard
                    icon={Coins}
                    label="今日算力消耗"
                    value={formatCredits(overview.credits.todayConsumed)}
                    hint={`发放 +${formatCredits(overview.credits.todayGranted)}`}
                />
                <OverviewStatCard
                    icon={UserPlus}
                    label="今日新增用户"
                    value={formatCount(overview.users.newToday)}
                    hint={`总用户 ${formatCount(overview.users.total)} · 近 7 日登录用户 ${formatCount(overview.users.active7d)}`}
                />
                <OverviewStatCard
                    icon={Gauge}
                    label="今日成功率"
                    value={todayCalls ? `${overview.ai.successRate}%` : "-"}
                    hint={todayCalls ? `平均耗时 ${formatDuration(overview.ai.avgDurationMs)}` : "今日暂无调用"}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <OverviewPanel title="近 7 天调用与算力" description="调用来自 AI 日志，算力来自算力点流水。" extra={<span className="text-[11px] text-muted-foreground">累计 {formatCount(overview.ai.total)} 次调用</span>}>
                    <OverviewTrendChart data={overview.ai.trend} />
                </OverviewPanel>
                <OverviewPanel title="平台状态" description="渠道、存储与内容资产。" className="flex flex-col">
                    <div className="flex flex-col">
                        <StatusRow label="模型渠道" value={overview.channels.total ? `${overview.channels.enabled}/${overview.channels.total} 启用` : "未配置"} href="/admin/settings" />
                        <StatusRow label="存储配置" value={storageValue} href="/admin/settings" warning={overview.storage.exceeded > 0} />
                        <StatusRow label="上架套餐" value={`${formatCount(overview.content.enabledPackages)} 个`} href="/admin/recharge-packages" />
                        <StatusRow label="用户算力余额" value={formatCredits(overview.credits.totalBalance)} />
                        <StatusRow label="内容资产" value={`${formatCount(overview.content.prompts)} 提示词 · ${formatCount(overview.content.assets)} 素材 · ${formatCount(overview.content.skills)} Skill`} />
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-border/50 pt-4">
                        {quickLinks.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] !text-muted-foreground transition-colors hover:!border-acid/40 hover:!text-foreground"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </OverviewPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <OverviewPanel
                    title="最近 AI 调用"
                    extra={<Link href="/admin/ai-logs" className="text-[11px] !text-muted-foreground transition-colors hover:!text-acid">查看全部</Link>}
                >
                    {overview.recentAiLogs.length ? (
                        <div className="flex flex-col">
                            {overview.recentAiLogs.map((log) => {
                                const ok = !log.failed && log.status >= 200 && log.status < 400;
                                return (
                                    <div key={log.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 last:border-0">
                                        <div className="min-w-0">
                                            <p className="truncate text-[12px] font-medium text-foreground">{log.model || "-"}</p>
                                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                {formatTime(log.createdAt)} · {log.userDisplayName || "未知用户"}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2 text-[11px]">
                                            <Tag color={ok ? "success" : "error"} className="!m-0">
                                                {log.status || "失败"}
                                            </Tag>
                                            <span className="w-12 text-right tabular-nums text-muted-foreground">{formatDuration(log.durationMs)}</span>
                                            <span className="w-10 text-right tabular-nums text-foreground">{formatCredits(log.credits)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyHint text="暂无调用记录" />
                    )}
                </OverviewPanel>

                <OverviewPanel
                    title="最近算力变动"
                    extra={<Link href="/admin/credit-logs" className="text-[11px] !text-muted-foreground transition-colors hover:!text-acid">查看全部</Link>}
                >
                    {overview.recentCreditLogs.length ? (
                        <div className="flex flex-col">
                            {overview.recentCreditLogs.map((log) => (
                                <div key={log.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 last:border-0">
                                    <div className="min-w-0">
                                        <p className="truncate text-[12px] font-medium text-foreground">{log.userDisplayName || "未知用户"}</p>
                                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                            {formatTime(log.createdAt)} · {creditTypeLabels[log.type] || log.type}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className={cn("text-[12px] tabular-nums", log.amount >= 0 ? "text-[var(--acid-ink)]" : "text-[var(--hot)]")}>
                                            {log.amount > 0 ? `+${formatCredits(log.amount)}` : formatCredits(log.amount)}
                                        </p>
                                        <p className="mt-0.5 text-[10px] text-muted-foreground">余额 {formatCredits(log.balance)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyHint text="暂无算力变动" />
                    )}
                </OverviewPanel>
            </div>

            <p className="text-[11px] leading-5 text-muted-foreground">按服务器本地日期统计；AI 调用汇总来自本地日志文件，算力消耗来自算力点流水。</p>
        </main>
    );
}

function StatusRow({ label, value, href, warning }: { label: string; value: ReactNode; href?: string; warning?: boolean }) {
    const content = (
        <>
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className={cn("flex min-w-0 items-center justify-end gap-1.5 text-right", warning ? "text-[var(--hot)]" : "text-foreground")}>
                <span className="min-w-0">{value}</span>
                {href ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" /> : null}
            </span>
        </>
    );
    const className = "flex items-center justify-between gap-3 border-b border-border/50 py-2.5 text-[12px] last:border-0";
    return href ? (
        <Link href={href} className={cn(className, "group")}>
            {content}
        </Link>
    ) : (
        <div className={className}>{content}</div>
    );
}

function EmptyHint({ text }: { text: string }) {
    return <div className="grid h-40 place-items-center text-xs text-muted-foreground">{text}</div>;
}

function OverviewSkeleton() {
    return (
        <main className="flex flex-col gap-5">
            <AdminPageHeader actions={<Button icon={<RefreshCw className="size-3.5" />} loading>刷新</Button>} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-[136px] rounded-xl border border-[var(--admin-line)] bg-card motion-safe:animate-pulse" />
                ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="h-[340px] rounded-xl border border-[var(--admin-line)] bg-card motion-safe:animate-pulse" />
                <div className="h-[340px] rounded-xl border border-[var(--admin-line)] bg-card motion-safe:animate-pulse" />
            </div>
        </main>
    );
}

function formatCount(value: number) {
    return countFormatter.format(value);
}

function formatCredits(value: number) {
    return creditFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatDuration(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return "-";
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index++;
    }
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value: string) {
    const date = dayjs(value);
    return date.isValid() ? date.format("MM-DD HH:mm") : "-";
}
