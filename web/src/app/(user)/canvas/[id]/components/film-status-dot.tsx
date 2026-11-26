"use client";

import { Loader2 } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";

export type FilmStatusTone = "ready" | "done" | "busy" | "failed" | "blocked";

const STATUS_LABELS: Record<FilmStatusTone, string> = {
    ready: "可执行",
    done: "已完成",
    busy: "生成中",
    failed: "失败",
    blocked: "不可执行",
};

/** 影视卡片/列表统一状态点：圆点或加载图标 + 文案；筛选器仍用胶囊。 */
export function FilmStatusDot({ theme, tone, label, className = "" }: { theme: CanvasTheme; tone: FilmStatusTone; label?: string; className?: string }) {
    const color = tone === "done" ? canvasStatusColors.success : tone === "failed" ? canvasStatusColors.error : tone === "busy" ? canvasStatusColors.loading : tone === "blocked" ? theme.node.muted : theme.node.text;
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${className}`} style={{ color }}>
            {tone === "busy" ? <Loader2 className="size-2.5 animate-spin" /> : <span className="size-1.5 rounded-full" style={{ background: color }} />}
            {label ?? STATUS_LABELS[tone]}
        </span>
    );
}
