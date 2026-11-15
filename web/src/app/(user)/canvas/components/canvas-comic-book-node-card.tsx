"use client";

import { BookOpen, Layers } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";

type Props = {
    node: CanvasNodeData;
    pages: CanvasNodeData[];
    onOpen: () => void;
};

/** 漫画册节点卡片：封面 + 页数 + 格式，双击或按钮打开书本预览。 */
export function CanvasComicBookNodeCard({ node, pages, onOpen }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const book = node.metadata?.comicBook;
    const cover = pages.find((page) => page.id === book?.coverNodeId) || pages[0];
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();
    return (
        <div className="flex h-full w-full flex-col overflow-hidden text-left" style={{ color: theme.node.text }}>
            <div className="relative min-h-0 flex-1 p-3">
                <div className="absolute inset-x-5 bottom-3 top-3 rounded-xl border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, transform: "translateX(7px) translateY(-5px) rotate(2deg)" }} />
                <div className="relative h-full overflow-hidden rounded-xl border" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke }}>
                    {cover ? (
                        <img src={cover.metadata?.content} alt={cover.title} draggable={false} className="size-full object-cover" />
                    ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-2" style={{ color: theme.node.muted }}>
                            <BookOpen className="size-8 opacity-60" />
                            <span className="text-[11px]">还没有页面</span>
                        </div>
                    )}
                    {pages.length > 1 ? <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{pages.length} 页</span> : null}
                </div>
            </div>
            <div className="flex items-center gap-2 px-3.5 pb-3.5">
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{node.title || "漫画册"}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px]" style={{ color: theme.node.placeholder }}>
                        <Layers className="size-3" />
                        {book?.format === "strip" ? "条漫" : "页漫"} · {pages.length} 页
                    </div>
                </div>
                <button type="button" className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onOpen(); }}>预览</button>
            </div>
        </div>
    );
}
