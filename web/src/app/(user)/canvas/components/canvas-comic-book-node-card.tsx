"use client";

import { AlertCircle, ArrowUpRight, BookOpen, Captions, Layers, MoreHorizontal, Plus } from "lucide-react";
import { Dropdown } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { resolveComicPageSlots } from "../utils/comic-book-state";
import type { CanvasNodeData } from "../types";

type Props = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    selectedImageCount: number;
    onOpenBook: () => void;
    onEnterLettering: () => void;
    onAddSelectedPages: () => void;
    onFocusPage: (pageNodeId: string) => void;
    onHandleMissingPages: () => void;
};

export function CanvasComicBookNodeCard({ node, nodes, selectedImageCount, onOpenBook, onEnterLettering, onAddSelectedPages, onFocusPage, onHandleMissingPages }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const book = node.metadata?.comicBook;
    const { pageSlots, validPages, missingPageIds } = resolveComicPageSlots({ pageNodeIds: book?.pageNodeIds || [], nodes });
    const coverSlot = pageSlots.find((slot) => slot.kind === "available" && slot.page.id === book?.coverNodeId);
    const cover = coverSlot?.kind === "available" ? coverSlot.page : validPages[0];
    const previewSlots = pageSlots.slice(0, 3);
    const primaryLabel = missingPageIds.length ? "处理缺页" : !validPages.length && selectedImageCount ? "加入选中图片" : "打开漫画册";
    const primaryAction = missingPageIds.length ? onHandleMissingPages : !validPages.length && selectedImageCount ? onAddSelectedPages : onOpenBook;
    const menuItems = [
        ...(primaryAction !== onOpenBook ? [{ key: "book", label: "打开漫画册", onClick: onOpenBook }] : []),
        ...(validPages.length ? [{ key: "lettering", label: "直接贴字", onClick: onEnterLettering }] : []),
        ...(selectedImageCount ? [{ key: "add", label: `加入选中图片 (${selectedImageCount})`, onClick: onAddSelectedPages }] : []),
    ];
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();

    return (
        <div className="flex h-full w-full flex-col overflow-hidden text-left" style={{ color: theme.node.text }}>
            <div className="flex min-h-0 flex-1 gap-2.5 p-3">
                <div className="relative min-h-0 w-[46%] shrink-0 overflow-hidden rounded-xl border" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke }}>
                    {cover ? <img src={cover.metadata?.content} alt={cover.title} draggable={false} className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-2" style={{ color: theme.node.muted }}><BookOpen className="size-8 opacity-60" /><span className="text-[11px]">还没有页面</span></div>}
                    <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>封面</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{node.title || "漫画册"}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[10px]" style={{ color: theme.node.placeholder }}><Layers className="size-3" />{book?.format === "strip" ? "条漫" : "页漫"} · {book?.direction === "ltr" ? "左→右" : "右→左"}</div>
                        </div>
                        {menuItems.length ? <Dropdown trigger={["click"]} menu={{ items: menuItems }}><button type="button" aria-label="漫画册更多操作" className="grid size-7 shrink-0 place-items-center rounded-md border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.muted }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => event.stopPropagation()}><MoreHorizontal className="size-4" /></button></Dropdown> : null}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: missingPageIds.length ? "var(--ant-color-warning)" : theme.node.muted }}>
                        {missingPageIds.length ? <AlertCircle className="size-3" /> : <span className="size-1.5 rounded-full" style={{ background: theme.node.activeStroke }} />}
                        <span className="truncate">{missingPageIds.length ? `缺少 ${missingPageIds.length} 页引用` : `${validPages.length} 页`}</span>
                    </div>
                    <div className="min-h-0 flex-1">
                        <div className="grid grid-cols-3 gap-1.5">
                            {previewSlots.map((slot, index) => slot.kind === "available" ? (
                                <button key={slot.pageNodeId} type="button" aria-label={`定位第 ${index + 1} 页：${slot.page.title}`} className="relative aspect-[3/4] overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.activeBg }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onFocusPage(slot.pageNodeId); }}><img src={slot.page.metadata?.content} alt={slot.page.title} draggable={false} className="size-full object-cover" /><span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{String(index + 1).padStart(2, "0")}</span></button>
                            ) : (
                                <div key={slot.pageNodeId} className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[9px]" style={{ borderColor: theme.node.stroke, color: theme.node.placeholder }}><AlertCircle className="size-3.5" />缺页</div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 px-3 pb-3">
                <button type="button" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg border px-2 text-[11px] font-medium" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); primaryAction(); }}><ArrowUpRight className="size-3.5 shrink-0" />{primaryLabel}</button>
                {validPages.length ? <button type="button" aria-label="直接贴字" className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onEnterLettering(); }}><Captions className="size-3.5" /></button> : null}
                {!validPages.length && selectedImageCount ? <button type="button" aria-label={`加入选中图片，共 ${selectedImageCount} 张`} className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onAddSelectedPages(); }}><Plus className="size-3.5" /></button> : null}
            </div>
        </div>
    );
}
