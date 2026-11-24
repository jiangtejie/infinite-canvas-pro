"use client";

import { AlertCircle, ArrowUpRight, BookOpen, Captions, Layers, MoreHorizontal } from "lucide-react";
import { Dropdown } from "antd";

import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasComicMeta } from "../[id]/lib/comic-graph-types";
import type { CanvasNodeData } from "../types";
import { resolveComicPageSlots } from "../utils/comic-book-state";

const STAGE_LABELS = { concept: "企划", cast: "设定", script: "剧本", layout: "页布局", review: "审稿" } as const;

export function ComicProjectBookNodeCard({ node, nodes, comic, onOpenWorkbench, onOpenBook, onEnterLettering, onHandleMissingPages }: {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    comic: CanvasComicMeta;
    onOpenWorkbench: () => void;
    onOpenBook: () => void;
    onEnterLettering: () => void;
    onHandleMissingPages: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const book = node.metadata?.comicBook;
    const { pageSlots, validPages, missingPageIds } = resolveComicPageSlots({ pageNodeIds: book?.pageNodeIds || [], nodes });
    const composedPages = validPages.filter((page) => page.metadata?.comicPage?.pageImage).length;
    const approvedPages = validPages.filter((page) => page.metadata?.comicPage?.reviewStatus === "approved").length;
    const cover = pageSlots.find((slot) => slot.kind === "available" && slot.page.id === book?.coverNodeId) || pageSlots.find((slot) => slot.kind === "available");
    const previewSlots = pageSlots.slice(0, 3);
    const primary = missingPageIds.length
        ? { label: "处理缺页", action: onHandleMissingPages }
        : !pageSlots.length || comic.stage === "layout" || comic.stage === "review"
            ? { label: !pageSlots.length ? "打开漫画工作台" : comic.stage === "layout" ? "继续页布局" : "继续审稿", action: onOpenWorkbench }
            : { label: "打开漫画册", action: onOpenBook };
    const menuItems = [
        { key: "workbench", label: "打开漫画工作台", onClick: onOpenWorkbench },
        { key: "book", label: "打开漫画册", onClick: onOpenBook },
        ...(validPages.length ? [{ key: "lettering", label: "直接贴字", onClick: onEnterLettering }] : []),
    ];
    const stopPointer = (event: { stopPropagation: () => void }) => event.stopPropagation();

    return (
        <div className="flex h-full w-full flex-col overflow-hidden text-left" style={{ color: theme.node.text }}>
            <div className="flex min-h-0 flex-1 gap-2.5 p-3">
                <div className="relative min-h-0 w-[46%] shrink-0 overflow-hidden rounded-xl border" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke }}>
                    {cover?.kind === "available" ? <ComicPageThumb node={cover.page} /> : <div className="flex size-full flex-col items-center justify-center gap-2" style={{ color: theme.node.muted }}><BookOpen className="size-8 opacity-60" /><span className="text-[11px]">还没有页面</span></div>}
                    <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>封面</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{node.title || "漫画册"}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[10px]" style={{ color: theme.node.placeholder }}><Layers className="size-3" />{comic.format === "strip" ? "条漫" : "页漫"} · {comic.direction === "ltr" ? "左→右" : "右→左"}</div>
                        </div>
                        <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                            <button type="button" aria-label="漫画册更多操作" className="grid size-7 shrink-0 place-items-center rounded-md border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.muted }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => event.stopPropagation()}><MoreHorizontal className="size-4" /></button>
                        </Dropdown>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: missingPageIds.length ? "var(--ant-color-warning)" : theme.node.muted }}>
                        {missingPageIds.length ? <AlertCircle className="size-3" /> : <span className="size-1.5 rounded-full" style={{ background: theme.node.activeStroke }} />}
                        <span className="truncate">{STAGE_LABELS[comic.stage]} · {validPages.length} 页</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]" style={{ color: theme.node.placeholder }}>
                        <span>已合成 {composedPages}</span>
                        <span>已通过 {approvedPages}</span>
                        {missingPageIds.length ? <span>缺页 {missingPageIds.length}</span> : null}
                    </div>
                    <div className="min-h-0 flex-1">
                        <div className="grid grid-cols-3 gap-1.5">
                            {previewSlots.map((slot, index) => slot.kind === "available" ? (
                                <div key={slot.pageNodeId} className="relative aspect-[3/4] overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.activeBg }}>
                                    <ComicPageThumb node={slot.page} />
                                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{String(index + 1).padStart(2, "0")}</span>
                                </div>
                            ) : (
                                <div key={slot.pageNodeId} className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[9px]" style={{ borderColor: theme.node.stroke, color: theme.node.placeholder }}><AlertCircle className="size-3.5" />缺页</div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 px-3 pb-3">
                <button type="button" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg border px-2 text-[11px] font-medium" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); primary.action(); }}><ArrowUpRight className="size-3.5 shrink-0" />{primary.label}</button>
                {validPages.length ? <button type="button" aria-label="直接贴字" className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onEnterLettering(); }}><Captions className="size-3.5" /></button> : null}
            </div>
        </div>
    );
}

function ComicPageThumb({ node }: { node: CanvasNodeData }) {
    const image = node.metadata?.comicPage?.pageImage;
    const src = useResolvedMediaSrc(image?.url, image?.storageKey, "image");
    return src ? <img src={src} alt={node.metadata?.comicPage?.title || node.title} draggable={false} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center" style={{ color: "var(--muted-foreground)" }}><BookOpen className="size-5 opacity-50" /></div>;
}
