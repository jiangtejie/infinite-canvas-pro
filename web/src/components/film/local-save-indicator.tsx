"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";

import { useSaveStatusStore } from "@/lib/persisted-store";
import { cn } from "@/lib/utils";
import { resolveSaveIndicator } from "./save-indicator-state";

/** 影视 / 剧本 / 漫画共用的保存状态提示；影视账号同步单独显示，不覆盖本地保存结果。 */
export function LocalSaveIndicator({ className, compact = false }: { className?: string; compact?: boolean }) {
    const status = useSaveStatusStore((state) => state.status);
    const syncStatus = useSaveStatusStore((state) => state.syncStatus);
    const state = resolveSaveIndicator(status, syncStatus, compact);
    const Icon = state.visual === "saving" || state.visual === "syncing" ? Loader2 : state.visual === "error" || state.visual === "sync-error" ? AlertTriangle : Check;
    return (
        <span
            title={state.title}
            className={cn(
                "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase",
                state.visual === "error" || state.visual === "sync-error" ? "text-hot" : state.visual === "saving" || state.visual === "syncing" ? "text-acid/80" : "text-muted-foreground/70",
                className,
            )}
        >
            <Icon className={cn("size-3 shrink-0", (state.visual === "saving" || state.visual === "syncing") && "animate-spin", state.visual === "saved" && "text-acid")} aria-hidden />
            <span>{state.label}</span>
            <span className="text-muted-foreground/50">{state.suffix}</span>
        </span>
    );
}
