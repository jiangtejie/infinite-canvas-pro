"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";

import { useSaveStatusStore, type SaveStatus } from "@/lib/persisted-store";
import { cn } from "@/lib/utils";

const LABEL: Record<SaveStatus, string> = {
    idle: "自动保存",
    saving: "保存中…",
    saved: "已保存",
    error: "保存失败",
};

/** 影视 / 剧本共用的保存状态提示，并明示数据只在本机。 */
export function LocalSaveIndicator({ className, compact = false }: { className?: string; compact?: boolean }) {
    const status = useSaveStatusStore((state) => state.status);
    const Icon = status === "saving" ? Loader2 : status === "error" ? AlertTriangle : Check;
    return (
        <span
            title="数据仅保存在本机浏览器，换设备或清理浏览器缓存后会丢失，重要项目请用「导出」备份。"
            className={cn(
                "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase",
                status === "error" ? "text-hot" : status === "saving" ? "text-acid/80" : "text-muted-foreground/70",
                className,
            )}
        >
            <Icon className={cn("size-3 shrink-0", status === "saving" && "animate-spin", status === "saved" && "text-acid")} aria-hidden />
            <span>{LABEL[status]}</span>
            <span className="text-muted-foreground/50">{compact ? "· 仅存本机浏览器" : "· 仅保存在本机浏览器"}</span>
        </span>
    );
}
