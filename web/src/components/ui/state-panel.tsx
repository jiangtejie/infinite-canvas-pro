"use client";

import type { ReactNode } from "react";
import { Empty, Spin } from "antd";

import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, className }: {
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} />
            <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
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
