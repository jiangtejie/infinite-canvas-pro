"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminOverviewAITrend } from "@/services/api/admin";

export function OverviewPanel({
    title,
    description,
    extra,
    children,
    className,
}: {
    title: string;
    description?: string;
    extra?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("rounded-xl border border-[var(--admin-line)] bg-card", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--admin-line)] px-4 py-3.5">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    {description ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p> : null}
                </div>
                {extra ? <div className="shrink-0">{extra}</div> : null}
            </div>
            <div className="p-4">{children}</div>
        </section>
    );
}

export function OverviewStatCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: ReactNode; hint: string }) {
    return (
        <article className="flex flex-col gap-3 rounded-xl border border-[var(--admin-line)] bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted-foreground">{label}</span>
                <span className="grid size-8 place-items-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                    <Icon className="size-4" />
                </span>
            </div>
            <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
            <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p>
        </article>
    );
}

export function OverviewTrendChart({ data }: { data: AdminOverviewAITrend[] }) {
    const hasData = data.some((item) => item.calls > 0 || item.credits > 0);
    if (!data.length || !hasData) {
        return <div className="grid h-48 place-items-center text-xs text-muted-foreground">近 7 天暂无调用</div>;
    }
    return (
        <div className="flex flex-col gap-5">
            <TrendSeries label="调用次数" unit="次" data={data.map((item) => ({ date: item.date, value: item.calls }))} tone="acid" />
            <TrendSeries label="算力消耗" data={data.map((item) => ({ date: item.date, value: item.credits }))} tone="muted" />
        </div>
    );
}

function TrendSeries({ label, unit = "", data, tone }: { label: string; unit?: string; data: { date: string; value: number }[]; tone: "acid" | "muted" }) {
    const maxValue = Math.max(...data.map((item) => item.value));
    const max = maxValue > 0 ? maxValue : 1;
    const peak = maxValue;
    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{label}</span>
                <span className="tabular-nums">
                    峰值 {formatNumber(peak)} {unit}
                </span>
            </div>
            <div className="flex h-24 items-end gap-1.5">
                {data.map((item) => (
                    <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${item.date}：${formatNumber(item.value)}${unit}`}>
                        <div className="flex h-20 w-full items-end justify-center">
                            <div
                                className={cn("w-1/2 rounded-t-[3px]", tone === "acid" ? "bg-acid/70" : "bg-muted-foreground/25")}
                                style={{ height: `${Math.max(3, (item.value / max) * 100)}%` }}
                            />
                        </div>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{item.date.slice(5)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
