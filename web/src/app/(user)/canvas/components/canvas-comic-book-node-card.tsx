"use client";

import { AlertCircle, ArrowUpRight, BookOpen, Captions, Layers, MoreHorizontal, Plus } from "lucide-react";
import { Dropdown } from "antd";

import { useComicStore } from "@/app/(user)/comic/stores/use-comic-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { resolveCanvasComicBookState } from "../utils/comic-book-state";
import type { CanvasNodeData } from "../types";

type Props = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    selectedImageCount: number;
    onOpenBook: () => void;
    onEnterLettering: () => void;
    onOpenProject: (projectId: string) => void;
    onAddSelectedPages: () => void;
    onFocusPage: (pageNodeId: string) => void;
    onHandleMissingPages: () => void;
    onAssociateProject: () => void;
};

const stageLabels = { concept: "企划", cast: "设定", script: "剧本", layout: "页布局", review: "审稿" } as const;

export function CanvasComicBookNodeCard({ node, nodes, selectedImageCount, onOpenBook, onEnterLettering, onOpenProject, onAddSelectedPages, onFocusPage, onHandleMissingPages, onAssociateProject }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const projects = useComicStore((state) => state.projects);
    const projectsHydrated = useComicStore((state) => state.hydrated);
    const state = resolveCanvasComicBookState({ node, nodes, projects, projectsHydrated, selectedImageCount });
    const book = node.metadata?.comicBook;
    const linkedProjectId = state.project.kind === "linked" ? state.project.project.id : "";
    const coverSlot = state.pageSlots.find((slot) => slot.kind === "available" && slot.page.id === book?.coverNodeId);
    const cover = coverSlot?.kind === "available" ? coverSlot.page : state.validPages[0];
    const previewSlots = state.pageSlots.slice(0, 3);
    const statusLabel = state.project.kind === "loading"
        ? "正在读取项目…"
        : state.project.kind === "standalone"
            ? "未关联项目"
            : state.project.kind === "project-missing"
                ? "关联项目不在本机"
                : projectProgressLabel(state.project.progress);
    const primaryLabel = state.primaryAction === "add-selected-pages"
        ? "加入选中图片"
        : state.primaryAction === "handle-missing-pages"
            ? "处理缺页"
            : state.primaryAction === "continue-layout"
                ? "继续拼合"
                : state.primaryAction === "continue-review"
                    ? "继续审稿"
                    : "打开漫画册";
    const primaryAction = state.primaryAction === "add-selected-pages"
        ? onAddSelectedPages
        : state.primaryAction === "handle-missing-pages"
            ? onHandleMissingPages
            : state.primaryAction === "continue-layout" || state.primaryAction === "continue-review"
                ? () => { if (linkedProjectId) onOpenProject(linkedProjectId); }
                : onOpenBook;
    const menuItems = [
        state.project.kind === "linked"
            ? { key: "project", label: state.project.progress.stage === "layout" ? "打开漫画项目" : "查看漫画项目", onClick: () => { if (linkedProjectId) onOpenProject(linkedProjectId); } }
            : { key: "associate", label: state.project.kind === "project-missing" ? "重新关联项目" : "关联漫画项目", onClick: onAssociateProject },
        ...(state.primaryAction !== "open-book" ? [{ key: "book", label: "打开漫画册", onClick: onOpenBook }] : []),
        ...(state.validPages.length ? [{ key: "lettering", label: "直接贴字", onClick: onEnterLettering }] : []),
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
                        <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                            <button type="button" aria-label="漫画册更多操作" className="grid size-7 shrink-0 place-items-center rounded-md border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.muted }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => event.stopPropagation()}><MoreHorizontal className="size-4" /></button>
                        </Dropdown>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: state.project.kind === "project-missing" || state.missingPageIds.length ? "var(--ant-color-warning)" : theme.node.muted }}>
                        {state.project.kind === "project-missing" || state.missingPageIds.length ? <AlertCircle className="size-3" /> : <span className="size-1.5 rounded-full" style={{ background: theme.node.activeStroke }} />}
                        <span className="truncate">{statusLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: theme.node.placeholder }}><span>画布册 {state.validPages.length} 页</span>{state.project.kind === "linked" ? <span>项目 {state.project.progress.totalPages} 页</span> : null}</div>
                    <div className="min-h-0 flex-1">
                        <div className="grid grid-cols-3 gap-1.5">
                            {previewSlots.map((slot, index) => slot.kind === "available" ? (
                                <button key={slot.pageNodeId} type="button" aria-label={`定位第 ${index + 1} 页：${slot.page.title}`} className="relative aspect-[3/4] overflow-hidden rounded-md border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.activeBg }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onFocusPage(slot.pageNodeId); }}><img src={slot.page.metadata?.content} alt={slot.page.title} draggable={false} className="size-full object-cover" /><span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{String(index + 1).padStart(2, "0")}</span></button>
                            ) : (
                                <div key={slot.pageNodeId} className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[9px]" style={{ borderColor: theme.node.stroke, color: theme.node.placeholder }}><AlertCircle className="size-3.5" />缺页</div>
                            ))}
                        </div>
                    </div>
                    {state.missingPageIds.length ? <div className="truncate text-[10px]" style={{ color: "var(--ant-color-warning)" }}>缺少 {state.missingPageIds.length} 页引用</div> : null}
                    {state.project.kind === "linked" && state.project.progress.stage === "layout" && state.project.progress.composedPages !== undefined ? <div className="h-1 overflow-hidden rounded-full" style={{ background: theme.toolbar.itemHover }}><span className="block h-full rounded-full" style={{ width: `${state.project.progress.totalPages ? Math.round((state.project.progress.composedPages / state.project.progress.totalPages) * 100) : 0}%`, background: theme.node.activeStroke }} /></div> : null}
                </div>
            </div>
            <div className="flex items-center gap-2 px-3 pb-3">
                <button type="button" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg border px-2 text-[11px] font-medium" style={{ background: theme.toolbar.activeBg, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); primaryAction(); }}><ArrowUpRight className="size-3.5 shrink-0" />{primaryLabel}</button>
                {state.validPages.length ? <button type="button" aria-label="直接贴字" className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onEnterLettering(); }}><Captions className="size-3.5" /></button> : null}
                {!state.validPages.length && selectedImageCount ? <button type="button" aria-label={`加入选中图片，共 ${selectedImageCount} 张`} className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={(event) => { event.stopPropagation(); onAddSelectedPages(); }}><Plus className="size-3.5" /></button> : null}
            </div>
        </div>
    );
}

function projectProgressLabel(progress: { stage: keyof typeof stageLabels; totalPages: number; composedPages?: number; approvedPages?: number }) {
    const stage = stageLabels[progress.stage];
    if (progress.stage === "layout" && progress.composedPages !== undefined) return `${stage} · ${progress.composedPages}/${progress.totalPages} 页已合成`;
    if (progress.stage === "review" && progress.approvedPages !== undefined) return `${stage} · ${progress.approvedPages}/${progress.totalPages} 页已通过`;
    return stage;
}
