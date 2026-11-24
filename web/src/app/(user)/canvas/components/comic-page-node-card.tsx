"use client";

import { BookOpen, CheckCircle2, CircleDashed, Eye } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { CanvasNodeData } from "../types";

const STATUS_LABELS = {
    draft: "草稿",
    pending: "待审",
    approved: "已通过",
    changes: "需修改",
} as const;

export function ComicPageNodeCard({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const page = node.metadata?.comicPage;
    const src = useResolvedMediaSrc(page?.pageImage?.url, page?.pageImage?.storageKey, "image");
    const status = page?.reviewStatus ?? "draft";
    const panelCount = page?.panels.length ?? 0;
    const readyPanels = page?.panels.filter((panel) => panel.image).length ?? 0;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden text-left" style={{ color: theme.node.text }}>
            <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: theme.toolbar.activeBg }}>
                {src ? (
                    <img src={src} alt={page?.title || node.title || "漫画页"} draggable={false} className="size-full object-contain" />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2" style={{ color: theme.node.muted }}>
                        <BookOpen className="size-8 opacity-60" />
                        <span className="text-[11px]">还没有合成页图</span>
                    </div>
                )}
                <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>
                    {page?.chapterId === "unassigned" ? "未分章" : "漫画页"}
                </span>
            </div>
            <div className="flex shrink-0 flex-col gap-1 border-t px-2.5 py-2" style={{ borderColor: theme.node.stroke }}>
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{page?.title || node.title || "未命名页面"}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px]" style={{ color: status === "approved" ? theme.node.activeStroke : theme.node.muted }}>
                        {status === "approved" ? <CheckCircle2 className="size-3" /> : status === "changes" ? <CircleDashed className="size-3" /> : <Eye className="size-3" />}
                        {STATUS_LABELS[status]}
                    </span>
                </div>
                <div className="flex items-center justify-between text-[10px]" style={{ color: theme.node.placeholder }}>
                    <span>{panelCount} 格</span>
                    <span>{readyPanels}/{panelCount} 格有图</span>
                </div>
            </div>
        </div>
    );
}
