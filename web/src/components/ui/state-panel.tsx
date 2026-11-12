"use client";

import type { ReactNode } from "react";
import { Spin } from "antd";
import { AlertCircle, Inbox, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, icon, className }: {
    title: string;
    description?: string;
    action?: ReactNode;
    icon?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col items-center justify-center px-6 py-20 text-center", className)}>
            <div className="relative mb-6">
                <div aria-hidden className="absolute -inset-3 rounded-[18px] border border-dashed border-border/70" />
                <div aria-hidden className="hazard-tape absolute -right-3 -top-3 size-8 rounded-[3px]" />
                <div className="relative grid size-14 place-items-center rounded-[10px] border border-border bg-card text-foreground/70 shadow-[inset_0_1px_0_var(--glass-highlight)]">
                    {icon ?? <Inbox className="size-6" />}
                </div>
            </div>
            <div className="flex items-center justify-center gap-2">
                <span aria-hidden className="punk-signal" />
                <p className="text-sm font-medium tracking-tight text-foreground">{title}</p>
            </div>
            {description ? <p className="mt-2 max-w-sm text-xs leading-6 text-muted-foreground">{description}</p> : null}
            {action ? <div className="mt-6">{action}</div> : null}
        </div>
    );
}

export function LoadingState({ label = "正在加载...", className }: { label?: string; className?: string }) {
    return (
        <div className={cn("flex min-h-40 flex-col items-center justify-center gap-4 text-xs tracking-[0.12em] text-muted-foreground uppercase", className)}>
            <Spin />
            <span className="font-mono">{label}</span>
        </div>
    );
}

export function ErrorState({ title = "加载失败", description, detail, onRetry, className }: {
    title?: string;
    description?: string;
    detail?: string;
    onRetry?: () => void;
    className?: string;
}) {
    return (
        <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-20 text-center", className)}>
            <div className="grid size-12 place-items-center rounded-[10px] border border-destructive/30 bg-destructive/8 text-destructive">
                <AlertCircle className="size-6" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
            {description ? <p className="mt-2 max-w-md text-xs leading-6 text-muted-foreground">{description}</p> : null}
            {detail && detail !== description ? (
                <details className="mt-3 w-full max-w-md text-left">
                    <summary className="cursor-pointer font-mono text-[11px] tracking-wide text-muted-foreground uppercase">查看详情</summary>
                    <pre className="thin-scrollbar mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted p-3 text-xs whitespace-pre-wrap text-foreground">{detail}</pre>
                </details>
            ) : null}
            {onRetry ? (
                <button type="button" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition hover:border-acid/60 hover:bg-accent" onClick={onRetry}>
                    <RotateCcw className="size-3.5" aria-hidden />
                    重试
                </button>
            ) : null}
        </div>
    );
}
