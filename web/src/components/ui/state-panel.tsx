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
        <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
            <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-dashed border-border/80 bg-muted/40 text-foreground/45 shadow-[0_0_40px_-20px_var(--neon-line)]">
                {icon ?? <Inbox className="size-6" />}
            </div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            {description ? <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p> : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}

export function LoadingState({ label = "正在加载...", className }: { label?: string; className?: string }) {
    return (
        <div className={cn("flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground", className)}>
            <Spin />
            {label}
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
        <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
            <AlertCircle className="size-7 text-red-500" aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
            {description ? <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{description}</p> : null}
            {detail && detail !== description ? (
                <details className="mt-2 w-full max-w-md text-left">
                    <summary className="cursor-pointer text-xs text-muted-foreground">查看详情</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-foreground">{detail}</pre>
                </details>
            ) : null}
            {onRetry ? (
                <button type="button" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent" onClick={onRetry}>
                    <RotateCcw className="size-3.5" aria-hidden />
                    重试
                </button>
            ) : null}
        </div>
    );
}
