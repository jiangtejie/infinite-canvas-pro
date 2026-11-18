"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, BookOpen, Captions, ChevronLeft, ChevronRight, Download, FileArchive, FileText, GripVertical, ImagePlus, Link2, LoaderCircle, MessageCircle, Settings2, Star, StickyNote, X, Zap } from "lucide-react";
import { App, Button, Dropdown, Input, InputNumber, Modal, Segmented, Select, Switch, Tag, Tooltip } from "antd";
import { motion } from "motion/react";
import { nanoid } from "nanoid";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useComicStore } from "@/app/(user)/comic/stores/use-comic-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { exportComicCbz, exportComicPdf, exportComicStrip } from "../[id]/lib/comic-export";
import type { CanvasComicBook, CanvasNodeData, ComicExportPreset, ComicLetterElement, ComicLetterKind } from "../types";
import { COMIC_LETTER_TEMPLATE_OPTIONS, comicLetterTailX, comicLetterTemplate, defaultComicLetterTemplate, fitComicLetterWidth } from "../utils/comic-lettering";
import { resolveComicPageSlots } from "../utils/comic-book-state";
import { associateComicProject, buildComicLetteringSync, replaceMissingComicBookPage } from "../utils/comic-book-project-link";

const LETTER_KIND_OPTIONS: { value: ComicLetterKind; label: string }[] = [
    { value: "speech", label: "对白框" },
    { value: "thought", label: "思考框" },
    { value: "caption", label: "旁白" },
    { value: "sfx", label: "拟声词" },
];
const LETTER_KIND_LABEL: Record<ComicLetterKind, string> = { speech: "对白", thought: "思考", caption: "旁白", sfx: "拟声" };

type Props = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    selectedImageNodes: CanvasNodeData[];
    initialMode: "preview" | "lettering" | "manage" | "associate";
    onChange: (patch: Partial<CanvasNodeData["metadata"]>) => void;
    onClose: () => void;
};

export function CanvasComicBookOverlay({ node, nodes, selectedImageNodes, initialMode, onChange, onClose }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { message } = App.useApp();
    const confirm = useConfirm();
    const comicProjects = useComicStore((state) => state.projects);
    const book: CanvasComicBook = node.metadata?.comicBook || { pageNodeIds: [], format: "page", direction: "rtl" };
    const { pageSlots } = useMemo(() => resolveComicPageSlots({ pageNodeIds: book.pageNodeIds, nodes }), [book.pageNodeIds, nodes]);
    const pageNodes = pageSlots.flatMap((slot) => slot.kind === "available" ? [slot.page] : []);
    const missing = pageSlots.filter((slot) => slot.kind === "missing").length;
    const [pageIndex, setPageIndex] = useState(() => initialMode === "manage" ? Math.max(0, pageSlots.findIndex((slot) => slot.kind === "missing")) : 0);
    const [spread, setSpread] = useState<"single" | "double">(initialMode === "lettering" ? "single" : "double");
    const [exporting, setExporting] = useState("");
    const [exportSettingsOpen, setExportSettingsOpen] = useState(false);
    const [projectLinkOpen, setProjectLinkOpen] = useState(initialMode === "associate");
    const [linkedProjectId, setLinkedProjectId] = useState(book.comicProjectId || "");
    const [draggingId, setDraggingId] = useState("");
    const [dragOverId, setDragOverId] = useState("");
    const [replacementPageId, setReplacementPageId] = useState("");
    const [letteringMode, setLetteringMode] = useState(initialMode === "lettering");
    const [selectedLetterId, setSelectedLetterId] = useState("");
    const [letterDrag, setLetterDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
    const letterDragRef = useRef<{ id: string; startX: number; startY: number; frameW: number; frameH: number } | null>(null);
    const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const step = spread === "double" ? 2 : 1;
    const safeIndex = Math.min(pageIndex, Math.max(0, pageSlots.length - 1));
    const visibleSlots = spread === "double" ? pageSlots.slice(safeIndex, safeIndex + 2) : pageSlots.slice(safeIndex, safeIndex + 1);
    const canPrev = safeIndex > 0;
    const canNext = safeIndex + step < pageSlots.length;
    const addableImages = selectedImageNodes.filter((item) => item.metadata?.content && !book.pageNodeIds.includes(item.id));
    const title = node.title || "漫画册";
    const lettering = book.lettering || {};
    const exportPreset: ComicExportPreset = book.exportPreset || { pageSize: "fit", dpi: 150, pageNumbers: false, titlePage: false };
    const patchExportPreset = (patch: Partial<ComicExportPreset>) => updateBook({ exportPreset: { ...exportPreset, ...patch } });
    const activeSlot = pageSlots[safeIndex];
    const activePage = activeSlot?.kind === "available" ? activeSlot.page : undefined;
    const activeLetters = activePage ? lettering[activePage.id] || [] : [];
    const selectedLetter = activeLetters.find((item) => item.id === selectedLetterId) || null;
    const selectedTemplate = selectedLetter ? comicLetterTemplate(selectedLetter) : undefined;

    const updateBook = (patch: Partial<CanvasComicBook>) => onChange({ comicBook: { ...book, ...patch } });
    const patchLetters = (pageId: string, elements: ComicLetterElement[]) => updateBook({ lettering: { ...lettering, [pageId]: elements } });
    const patchLetter = (pageId: string, letterId: string, patch: Partial<ComicLetterElement>) => {
        patchLetters(pageId, (lettering[pageId] || []).map((item) => item.id === letterId ? { ...item, ...patch } : item));
    };
    const updateLetter = (letterId: string, patch: Partial<ComicLetterElement>) => {
        if (!activePage) return;
        patchLetter(activePage.id, letterId, patch);
    };
    const addLetter = (kind: ComicLetterKind) => {
        if (!activePage) return;
        const defaults: Record<ComicLetterKind, string> = { speech: "对白", thought: "心里话", caption: "旁白", sfx: "咚" };
        const tail = kind === "speech" ? "right" : "none";
        const element: ComicLetterElement = { id: nanoid(), kind, text: defaults[kind], x: 0.12, y: 0.1, width: kind === "caption" ? 0.46 : 0.32, fontSize: 0.034, align: "left", tail, template: defaultComicLetterTemplate(kind), tailX: tail === "right" ? 0.75 : undefined };
        patchLetters(activePage.id, [...activeLetters, element]);
        setSelectedLetterId(element.id);
    };
    const changeLetterKind = (kind: ComicLetterKind) => {
        if (!selectedLetter) return;
        const tail = kind === "caption" || kind === "sfx" ? "none" : selectedLetter.tail === "none" ? "right" : selectedLetter.tail;
        updateLetter(selectedLetter.id, {
            kind,
            template: defaultComicLetterTemplate(kind),
            tail,
            tailX: tail === "none" ? undefined : tail === "left" ? 0.25 : 0.75,
        });
    };
    const removeLetter = (letterId: string) => {
        if (!activePage) return;
        patchLetters(activePage.id, activeLetters.filter((item) => item.id !== letterId));
        setSelectedLetterId("");
    };
    const startLetterDrag = (event: ReactPointerEvent<HTMLDivElement>, element: ComicLetterElement) => {
        if (!letteringMode || !activePage) return;
        event.stopPropagation();
        setSelectedLetterId(element.id);
        const frame = event.currentTarget.closest("[data-comic-page]")?.getBoundingClientRect();
        if (!frame) return;
        letterDragRef.current = { id: element.id, startX: event.clientX, startY: event.clientY, frameW: frame.width, frameH: frame.height };
        event.currentTarget.setPointerCapture(event.pointerId);
        setLetterDrag({ id: element.id, dx: 0, dy: 0 });
    };
    const moveLetterDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = letterDragRef.current;
        if (!drag) return;
        setLetterDrag({ id: drag.id, dx: (event.clientX - drag.startX) / Math.max(1, drag.frameW), dy: (event.clientY - drag.startY) / Math.max(1, drag.frameH) });
    };
    const endLetterDrag = () => {
        const drag = letterDragRef.current;
        letterDragRef.current = null;
        if (!drag || !activePage) return;
        const preview = letterDrag;
        setLetterDrag(null);
        const element = (lettering[activePage.id] || []).find((item) => item.id === drag.id);
        if (!element || !preview) return;
        patchLetter(activePage.id, drag.id, { x: Math.min(0.92, Math.max(0, element.x + preview.dx)), y: Math.min(0.92, Math.max(0, element.y + preview.dy)) });
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "ArrowLeft") setPageIndex((current) => Math.max(0, current - step));
            if (event.key === "ArrowRight") setPageIndex((current) => Math.min(Math.max(0, pageSlots.length - 1), current + step));
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [pageSlots.length, step]);

    const addSelected = () => {
        if (!addableImages.length) return;
        updateBook({ pageNodeIds: [...book.pageNodeIds, ...addableImages.map((item) => item.id)], coverNodeId: book.coverNodeId || addableImages[0].id });
    };

    const removePage = (pageId: string) => {
        const next = book.pageNodeIds.filter((id) => id !== pageId);
        const nextLettering = { ...lettering };
        delete nextLettering[pageId];
        const nextPageProjectIds = { ...book.pageProjectIds };
        delete nextPageProjectIds[pageId];
        updateBook({ pageNodeIds: next, coverNodeId: book.coverNodeId === pageId ? next[0] : book.coverNodeId, lettering: nextLettering, pageProjectIds: nextPageProjectIds });
        setPageIndex((current) => Math.min(current, Math.max(0, next.length - 1)));
    };

    const reorderPage = (fromId: string, toId: string) => {
        if (!fromId || fromId === toId) return;
        const next = [...book.pageNodeIds];
        const fromIndex = next.indexOf(fromId);
        const toIndex = next.indexOf(toId);
        if (fromIndex < 0 || toIndex < 0) return;
        next.splice(toIndex, 0, ...next.splice(fromIndex, 1));
        updateBook({ pageNodeIds: next });
    };

    const replaceMissingPage = async (missingPageNodeId: string, replacementPageNodeId: string) => {
        const replacementImageNode = selectedImageNodes.find((item) => item.id === replacementPageNodeId);
        if (!replacementImageNode) return;
        const accepted = await confirm({
            title: "替换缺页？",
            description: "将保留当前页序和封面归属，并把该页已有的项目映射与贴字迁移到新图片。",
            confirmText: "替换缺页",
        });
        if (!accepted) return;
        const result = replaceMissingComicBookPage({ book, missingPageNodeId, replacementImageNode });
        if (!result.replaced) return void message.warning("这张图片不可用于替换缺页");
        updateBook(result.book);
        message.success("缺页已替换");
    };

    const associateSelectedProject = async () => {
        const project = comicProjects.find((item) => item.id === linkedProjectId);
        if (!project) return void message.warning("先选择一个漫画项目");
        if (book.comicProjectId && book.comicProjectId !== project.id) {
            const accepted = await confirm({
                title: "替换漫画项目关联？",
                description: "重新关联只会更新漫画册与项目页的映射，不会覆盖当前贴字、页序、封面或导出设置。",
                confirmText: "替换关联",
            });
            if (!accepted) return;
        }
        const nextBook = associateComicProject(book, project.id, project.chapters.flatMap((chapter) => chapter.pages));
        updateBook({ comicProjectId: nextBook.comicProjectId, pageProjectIds: nextBook.pageProjectIds });
        setProjectLinkOpen(false);
        message.success("漫画项目已关联");
    };

    const syncProjectLettering = async () => {
        const project = comicProjects.find((item) => item.id === linkedProjectId);
        if (!project) return void message.warning("先选择一个漫画项目");
        if (book.comicProjectId !== project.id || !book.pageProjectIds || !Object.keys(book.pageProjectIds).length) return void message.warning("请先仅关联项目，再同步贴字");
        const result = buildComicLetteringSync({ book, pageSlots, project });
        const accepted = await confirm({
            title: "同步项目贴字？",
            description: `将更新 ${result.updatedPages} 页，覆盖已有贴字 ${result.overwrittenPages} 页，未映射 ${result.unmappedPages} 页；${result.emptyContentPages} 页没有对白、旁白或拟声，将保留现有贴字。`,
            confirmText: "开始同步",
        });
        if (!accepted) return;
        updateBook({ lettering: result.lettering, pageProjectIds: result.pageProjectIds });
        setProjectLinkOpen(false);
        message.success(`已更新 ${result.updatedPages} 页贴字`);
    };

    const runExport = async (kind: "cbz" | "pdf" | "strip") => {
        if (!pageNodes.length) return;
        setExporting(kind);
        try {
            const options = { title, dpi: exportPreset.dpi, pagePreset: exportPreset.pageSize, lettering: book.lettering, pageNumbers: exportPreset.pageNumbers, titlePage: exportPreset.titlePage, titlePageText: exportPreset.titlePageText, onProgress: (done: number, total: number) => setExporting(`${kind}:${done}/${total}`) };
            if (kind === "cbz") await exportComicCbz(pageNodes, options);
            if (kind === "pdf") await exportComicPdf(pageNodes, options);
            if (kind === "strip") await exportComicStrip(pageNodes, options);
            message.success("漫画册已导出");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "漫画册导出失败");
        } finally {
            setExporting("");
        }
    };

    return (
        <>
        <Modal open title={`${title} · ${pageSlots.length} 页`} width="min(1240px, 96vw)" mask={{ closable: true }} onCancel={onClose} footer={null} destroyOnHidden styles={{ body: { padding: 0 } }}>
            <div className="flex h-[min(78vh,900px)] min-h-0 flex-col overflow-hidden rounded-b-2xl" style={{ background: theme.canvas.background, color: theme.node.text }}>
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                    <Segmented size="small" value={book.format} options={[{ label: "页漫", value: "page" }, { label: "条漫", value: "strip" }]} onChange={(value) => updateBook({ format: value as CanvasComicBook["format"] })} />
                    {book.format === "page" ? (
                        <>
                            <Segmented size="small" disabled={letteringMode} value={spread} options={[{ label: "单页", value: "single" }, { label: "双页", value: "double" }]} onChange={(value) => setSpread(value as "single" | "double")} />
                            <Segmented size="small" value={book.direction} options={[{ label: "右→左", value: "rtl" }, { label: "左→右", value: "ltr" }]} onChange={(value) => updateBook({ direction: value as CanvasComicBook["direction"] })} />
                        </>
                    ) : null}
                    <Button size="small" type={letteringMode ? "primary" : "default"} icon={<Captions className="size-3.5" />} disabled={book.format === "strip"} onClick={() => { if (!letteringMode) setSpread("single"); setLetteringMode(!letteringMode); }}>贴字</Button>
                    <Button size="small" icon={<Link2 className="size-3.5" />} onClick={() => { setLinkedProjectId(book.comicProjectId || ""); setProjectLinkOpen(true); }}>{book.comicProjectId ? "项目操作" : "关联项目"}</Button>
                    {book.comicProjectId ? <Button size="small" icon={<Captions className="size-3.5" />} onClick={() => { setLinkedProjectId(book.comicProjectId || ""); setProjectLinkOpen(true); }}>同步项目贴字</Button> : null}
                    <Tooltip title={addableImages.length ? "把画布中选中的图片加入漫画册" : "先选中画布中的图片节点"}>
                        <Button size="small" icon={<ImagePlus className="size-3.5" />} disabled={!addableImages.length} onClick={addSelected}>加入选中图片{addableImages.length ? ` (${addableImages.length})` : ""}</Button>
                    </Tooltip>
                    {missing > 0 ? <Tag className="!m-0 !text-[10px]" color="warning">{missing} 页图片缺失</Tag> : null}
                    <span className="ml-auto flex items-center gap-2">
                        <Tooltip title="导出设置"><Button size="small" shape="circle" icon={<Settings2 className="size-3.5" />} aria-label="导出设置" onClick={() => setExportSettingsOpen(true)} /></Tooltip>
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    { key: "cbz", label: "CBZ 漫画包", icon: <FileArchive className="size-3.5" />, onClick: () => void runExport("cbz") },
                                    { key: "pdf", label: `PDF · ${exportPreset.pageSize === "fit" ? "首图比例" : exportPreset.pageSize.toUpperCase()} · ${exportPreset.dpi}dpi`, icon: <FileText className="size-3.5" />, onClick: () => void runExport("pdf") },
                                    { key: "strip", label: "条漫长图 · 1080px", icon: <Download className="size-3.5" />, onClick: () => void runExport("strip") },
                                ],
                            }}
                        >
                            <Button type="primary" size="small" disabled={!pageNodes.length || missing > 0 || Boolean(exporting)} loading={Boolean(exporting)} icon={exporting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}>导出</Button>
                        </Dropdown>
                        {exporting ? <span className="text-[10px] tabular-nums" style={{ color: theme.node.placeholder }}>{exporting}</span> : null}
                    </span>
                </div>

                <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="thin-scrollbar min-h-0 overflow-y-auto border-r p-3" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                        <div className="mb-2 flex items-center justify-between text-[11px]" style={{ color: theme.node.muted }}>
                            <span>页面</span>
                            <span>{pageNodes.length} 张图片 · {missing} 个缺页</span>
                        </div>
                        <div className="space-y-2">
                            {pageSlots.map((slot, index) => slot.kind === "available" ? (
                                <div
                                    key={slot.pageNodeId}
                                    draggable
                                    onDragStart={() => setDraggingId(slot.pageNodeId)}
                                    onDragOver={(event) => { event.preventDefault(); setDragOverId(slot.pageNodeId); }}
                                    onDragLeave={() => setDragOverId((current) => current === slot.pageNodeId ? "" : current)}
                                    onDrop={(event) => { event.preventDefault(); reorderPage(draggingId, slot.pageNodeId); setDraggingId(""); setDragOverId(""); }}
                                    onDragEnd={() => { setDraggingId(""); setDragOverId(""); }}
                                    onClick={() => setPageIndex(index)}
                                    className="group relative cursor-pointer overflow-hidden rounded-lg border"
                                    style={{ borderColor: dragOverId === slot.pageNodeId && draggingId !== slot.pageNodeId ? theme.node.activeStroke : index === safeIndex ? theme.node.activeStroke : theme.toolbar.border, opacity: draggingId === slot.pageNodeId ? 0.5 : 1 }}
                                >
                                    <div className="relative aspect-[3/4] w-full" style={{ background: theme.toolbar.activeBg }}>
                                        <img src={slot.page.metadata?.content || ""} alt={slot.page.title} draggable={false} className="size-full object-cover" />
                                        <span className="absolute left-1 top-1 grid size-4 place-items-center rounded-full text-[10px] font-semibold" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{index + 1}</span>
                                        {book.coverNodeId === slot.page.id ? <span className="absolute bottom-1 left-1 rounded px-1 py-0.5 text-[9px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>封面</span> : null}
                                        <span className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                                            <button type="button" className="grid size-5 place-items-center rounded" style={{ background: theme.toolbar.panel, color: theme.node.text }} aria-label="设为封面" onClick={(event) => { event.stopPropagation(); updateBook({ coverNodeId: slot.page.id }); }}><Star className="size-3" /></button>
                                            <button type="button" className="grid size-5 place-items-center rounded" style={{ background: theme.toolbar.panel, color: theme.node.text }} aria-label="移除页面" onClick={(event) => { event.stopPropagation(); removePage(slot.page.id); }}><X className="size-3" /></button>
                                        </span>
                                        <GripVertical className="pointer-events-none absolute bottom-1 right-1 size-3 opacity-50" />
                                    </div>
                                </div>
                            ) : (
                                <div key={slot.pageNodeId} onClick={() => setPageIndex(index)} className="space-y-2 rounded-lg border border-dashed p-2" style={{ borderColor: index === safeIndex ? theme.node.activeStroke : theme.node.stroke, background: theme.toolbar.activeBg }}>
                                    <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 text-xs" style={{ color: theme.node.placeholder }}><AlertCircle className="size-5" /><span>第 {index + 1} 页缺失</span></div>
                                    {addableImages.length ? <Select size="small" className="w-full" placeholder="选择未引用图片" value={replacementPageId || undefined} options={addableImages.map((image) => ({ value: image.id, label: image.title || "未命名图片" }))} onChange={(value) => { setReplacementPageId(value); void replaceMissingPage(slot.pageNodeId, value).then(() => setReplacementPageId("")); }} /> : null}
                                    <Button size="small" block danger onClick={() => removePage(slot.pageNodeId)}>移除此引用</Button>
                                </div>
                            ))}
                            {!pageSlots.length ? <p className="m-0 text-[11px] leading-5" style={{ color: theme.node.placeholder }}>还没有页面。选中画布中的图片节点后点上方「加入选中图片」。</p> : null}
                        </div>
                        {letteringMode && book.format === "page" ? (
                            <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: theme.toolbar.border }}>
                                <div className="flex items-center justify-between text-[11px]" style={{ color: theme.node.muted }}><span>本页贴字</span><span>{activeLetters.length}</span></div>
                                <div className="flex flex-wrap gap-1.5">
                                    <Button size="small" icon={<MessageCircle className="size-3.5" />} onClick={() => addLetter("speech")}>对白</Button>
                                    <Button size="small" icon={<StickyNote className="size-3.5" />} onClick={() => addLetter("caption")}>旁白</Button>
                                    <Button size="small" icon={<Zap className="size-3.5" />} onClick={() => addLetter("sfx")}>拟声</Button>
                                    <Button size="small" icon={<Captions className="size-3.5" />} onClick={() => addLetter("thought")}>思考</Button>
                                </div>
                                <div className="space-y-1">
                                    {activeLetters.map((element) => (
                                        <button key={element.id} type="button" onClick={() => setSelectedLetterId(element.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition" style={{ background: selectedLetterId === element.id ? theme.toolbar.activeBg : "transparent", color: theme.node.text }}>
                                            <span className="shrink-0 opacity-60">{LETTER_KIND_LABEL[element.kind]}</span>
                                            <span className="min-w-0 flex-1 truncate">{element.text || "空文本"}</span>
                                        </button>
                                    ))}
                                    {!activeLetters.length ? <p className="m-0 text-[11px]" style={{ color: theme.node.placeholder }}>本页还没有贴字。</p> : null}
                                </div>
                                {selectedLetter ? (
                                    <div className="space-y-2 rounded-lg border p-2" style={{ borderColor: theme.toolbar.border }}>
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="space-y-1 text-[10px]" style={{ color: theme.node.muted }}><span>类型</span><Select size="small" className="w-full" value={selectedLetter.kind} options={LETTER_KIND_OPTIONS} onChange={changeLetterKind} /></label>
                                            <label className="space-y-1 text-[10px]" style={{ color: theme.node.muted }}><span>模板</span><Select size="small" className="w-full" disabled={selectedLetter.kind === "sfx"} value={selectedTemplate} options={COMIC_LETTER_TEMPLATE_OPTIONS} onChange={(template) => updateLetter(selectedLetter.id, { template })} /></label>
                                        </div>
                                        <Input.TextArea rows={3} value={selectedLetter.text} maxLength={300} onChange={(event) => updateLetter(selectedLetter.id, { text: event.target.value })} />
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="space-y-1 text-[10px]" style={{ color: theme.node.muted }}><span>宽度 %</span><InputNumber className="!w-full" size="small" min={10} max={90} step={5} value={Math.round(selectedLetter.width * 100)} onChange={(value) => updateLetter(selectedLetter.id, { width: Math.min(0.9, Math.max(0.1, (value ?? 30) / 100)) })} /></label>
                                            <label className="space-y-1 text-[10px]" style={{ color: theme.node.muted }}><span>字号 %</span><InputNumber className="!w-full" size="small" min={1} max={10} step={0.5} value={Math.round(selectedLetter.fontSize * 1000) / 10} onChange={(value) => updateLetter(selectedLetter.id, { fontSize: Math.min(0.1, Math.max(0.01, (value ?? 3.4) / 1000)) })} /></label>
                                        </div>
                                        <Button size="small" block onClick={() => updateLetter(selectedLetter.id, { width: fitComicLetterWidth(selectedLetter.text, selectedLetter.fontSize) })}>适配文字宽度</Button>
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="space-y-1 text-[10px]" style={{ color: theme.node.muted }}><span>对齐</span><Select size="small" className="w-full" value={selectedLetter.align} options={[{ value: "left", label: "左" }, { value: "center", label: "中" }, { value: "right", label: "右" }]} onChange={(align) => updateLetter(selectedLetter.id, { align })} /></label>
                                            <label className="space-y-1 text-[10px]" style={{ color: theme.node.muted }}><span>尾巴</span><Select size="small" className="w-full" disabled={selectedLetter.kind === "caption" || selectedLetter.kind === "sfx"} value={selectedLetter.tail} options={[{ value: "none", label: "无" }, { value: "left", label: "左" }, { value: "right", label: "右" }]} onChange={(tail) => updateLetter(selectedLetter.id, { tail, tailX: tail === "none" ? undefined : tail === "left" ? 0.25 : 0.75 })} /></label>
                                        </div>
                                        {selectedLetter.tail !== "none" && selectedTemplate !== "caption" && selectedLetter.kind !== "caption" && selectedLetter.kind !== "sfx" ? <label className="block space-y-1 text-[10px]" style={{ color: theme.node.muted }}><span>尾巴位置 %</span><InputNumber className="!w-full" size="small" min={10} max={90} step={5} value={Math.round((selectedLetter.tailX ?? (selectedLetter.tail === "left" ? 0.25 : 0.75)) * 100)} onChange={(value) => updateLetter(selectedLetter.id, { tailX: Math.min(0.9, Math.max(0.1, (value ?? 50) / 100)) })} /></label> : null}
                                        <Button size="small" danger block onClick={() => removeLetter(selectedLetter.id)}>删除贴字</Button>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <div className="relative flex min-h-0 flex-col" style={{ background: theme.canvas.background }}>
                        {book.format === "strip" ? (
                            <div className="thin-scrollbar flex-1 overflow-y-auto px-4 py-6">
                                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-1 bg-white">
                                    {pageSlots.map((slot, index) => slot.kind === "available" ? (
                                        <div key={slot.pageNodeId} className="relative w-full bg-white" style={{ containerType: "inline-size" }}>
                                            <img src={slot.page.metadata?.content || ""} alt={slot.page.title} className="w-full" draggable={false} />
                                            <LetteringLayer theme={theme} page={slot.page} elements={lettering[slot.page.id] || []} selectedId={selectedLetterId} drag={null} editable={false} onSelect={setSelectedLetterId} onDragStart={startLetterDrag} onDragMove={moveLetterDrag} onDragEnd={endLetterDrag} />
                                        </div>
                                    ) : (
                                        <div key={slot.pageNodeId} className="flex min-h-48 flex-col items-center justify-center gap-2 border border-dashed text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}><AlertCircle className="size-5" /><span>第 {index + 1} 页缺失</span></div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div
                                className="flex min-h-0 flex-1 items-center justify-center gap-2 px-4 py-6"
                                style={{ perspective: 1800, touchAction: "pan-y" }}
                                onPointerDown={(event) => { swipeStartRef.current = { x: event.clientX, y: event.clientY }; }}
                                onPointerCancel={() => { swipeStartRef.current = null; }}
                                onPointerUp={(event) => {
                                    const start = swipeStartRef.current;
                                    swipeStartRef.current = null;
                                    if (!start) return;
                                    const dx = event.clientX - start.x;
                                    const dy = event.clientY - start.y;
                                    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
                                    setPageIndex(dx < 0 ? Math.min(Math.max(0, pageSlots.length - 1), safeIndex + step) : Math.max(0, safeIndex - step));
                                }}
                            >
                                <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full border disabled:opacity-30" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} disabled={!canPrev} onClick={() => setPageIndex(Math.max(0, safeIndex - step))} aria-label="上一页"><ChevronLeft className="size-4" /></button>
                                <motion.div key={`${safeIndex}-${spread}`} initial={{ rotateY: book.direction === "rtl" ? 25 : -25, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.28, ease: "easeOut" }} className={`flex h-full min-h-0 max-w-full items-center justify-center ${book.direction === "rtl" ? "flex-row-reverse" : "flex-row"}`} style={{ transformStyle: "preserve-3d" }}>
                                    {visibleSlots.map((slot, index) => slot.kind === "available" ? (
                                        <div key={slot.pageNodeId} data-comic-page className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-white shadow-[0_18px_50px_rgba(0,0,0,.22)]" style={{ aspectRatio: pageFrameRatio(slot.page), height: "100%", maxWidth: visibleSlots.length === 2 ? "50%" : "70%", borderLeft: index === 1 ? `1px solid ${theme.node.stroke}` : undefined, containerType: "inline-size" }}>
                                            <img src={slot.page.metadata?.content || ""} alt={slot.page.title} draggable={false} className="size-full object-contain" />
                                            <LetteringLayer theme={theme} page={slot.page} elements={lettering[slot.page.id] || []} selectedId={selectedLetterId} drag={letterDrag} editable={letteringMode && visibleSlots.length === 1} onSelect={setSelectedLetterId} onDragStart={startLetterDrag} onDragMove={moveLetterDrag} onDragEnd={endLetterDrag} />
                                        </div>
                                    ) : (
                                        <div key={slot.pageNodeId} className="flex h-full min-h-48 min-w-[min(70%,320px)] flex-col items-center justify-center gap-2 border border-dashed text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}><AlertCircle className="size-6" /><span>第 {safeIndex + index + 1} 页缺失</span><span className="text-xs">请在左侧替换或移除此引用</span></div>
                                    ))}
                                </motion.div>
                                <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full border disabled:opacity-30" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} disabled={!canNext} onClick={() => setPageIndex(Math.min(Math.max(0, pageSlots.length - 1), safeIndex + step))} aria-label="下一页"><ChevronRight className="size-4" /></button>
                                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-[11px] tabular-nums" style={{ background: theme.toolbar.panel, color: theme.node.muted }}>{pageSlots.length ? `${safeIndex + 1}${spread === "double" && pageSlots[safeIndex + 1] ? `–${safeIndex + 2}` : ""}` : "0"} / {pageSlots.length}</span>
                            </div>
                        )}
                        {!pageSlots.length ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center" style={{ color: theme.node.muted }}><BookOpen className="size-10 opacity-50" /><span className="text-sm">漫画册还没有页面</span></div> : null}
                    </div>
                </div>
            </div>
        </Modal>
        <Modal title="漫画项目操作" open={projectLinkOpen} width={480} mask={{ closable: false }} onCancel={() => setProjectLinkOpen(false)} footer={null} destroyOnHidden>
            <div className="space-y-4 py-1">
                <label className="block space-y-1.5 text-sm"><span>漫画项目</span><Select className="w-full" showSearch optionFilterProp="label" value={linkedProjectId || undefined} placeholder={comicProjects.length ? "选择漫画项目" : "还没有漫画项目"} disabled={!comicProjects.length} options={comicProjects.map((project) => ({ value: project.id, label: `${project.title} · ${project.chapters.flatMap((chapter) => chapter.pages).length} 页` }))} onChange={setLinkedProjectId} /></label>
                <p className="m-0 text-[11px] leading-5 text-muted-foreground">关联项目只建立漫画册页面与项目页面的映射，不会改变当前贴字、页序、封面或导出设置。贴字同步是独立动作，会按已有映射写入有对白、旁白或拟声的页面。</p>
                <div className="flex gap-2">
                    <Button type="primary" className="flex-1" disabled={!linkedProjectId} onClick={() => void associateSelectedProject()}>仅关联项目</Button>
                    <Button className="flex-1" disabled={!linkedProjectId || book.comicProjectId !== linkedProjectId} onClick={() => void syncProjectLettering()}>同步项目贴字</Button>
                </div>
            </div>
        </Modal>
        <Modal title="导出设置" open={exportSettingsOpen} width={420} mask={{ closable: false }} onCancel={() => setExportSettingsOpen(false)} footer={<Button onClick={() => setExportSettingsOpen(false)}>完成</Button>} destroyOnHidden>
            <div className="space-y-4 py-1">
                <label className="block space-y-1.5 text-sm"><span>页面尺寸</span><Select className="w-full" value={exportPreset.pageSize} options={[{ value: "fit", label: "按首图比例" }, { value: "a4", label: "A4" }, { value: "b5", label: "B5" }]} onChange={(pageSize) => patchExportPreset({ pageSize })} /></label>
                <label className="block space-y-1.5 text-sm"><span>分辨率</span><Select className="w-full" value={exportPreset.dpi} options={[{ value: 150, label: "150 dpi" }, { value: 300, label: "300 dpi" }]} onChange={(dpi) => patchExportPreset({ dpi: dpi as 150 | 300 })} /></label>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"><span>添加页码</span><Switch checked={exportPreset.pageNumbers} onChange={(pageNumbers) => patchExportPreset({ pageNumbers })} /></div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"><span>添加扉页</span><Switch checked={exportPreset.titlePage} onChange={(titlePage) => patchExportPreset({ titlePage })} /></div>
                {exportPreset.titlePage ? <label className="block space-y-1.5 text-sm"><span>扉页标题</span><Input value={exportPreset.titlePageText ?? ""} maxLength={100} placeholder={title} onChange={(event) => patchExportPreset({ titlePageText: event.target.value })} /></label> : null}
                <p className="m-0 text-[11px] leading-5 text-muted-foreground">页面尺寸只影响 PDF；页码和扉页会烘焙进 CBZ/PDF/长图。扉页不计页码。</p>
            </div>
        </Modal>
        </>
    );
}

function pageFrameRatio(page: CanvasNodeData) {
    const width = page.metadata?.naturalWidth || page.width;
    const height = page.metadata?.naturalHeight || page.height;
    return width > 0 && height > 0 ? width / height : 3 / 4;
}

function LetteringLayer({ theme, page, elements, selectedId, drag, editable, onSelect, onDragStart, onDragMove, onDragEnd }: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    page: CanvasNodeData;
    elements: ComicLetterElement[];
    selectedId: string;
    drag: { id: string; dx: number; dy: number } | null;
    editable: boolean;
    onSelect: (id: string) => void;
    onDragStart: (event: ReactPointerEvent<HTMLDivElement>, element: ComicLetterElement) => void;
    onDragMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onDragEnd: () => void;
}) {
    return (
        <div className="absolute inset-0" style={{ pointerEvents: "none" }} aria-label={`${page.title}贴字层`}>
            {elements.map((element) => {
                const offset = drag?.id === element.id ? drag : null;
                const x = element.x + (offset?.dx || 0);
                const y = element.y + (offset?.dy || 0);
                const selected = editable && selectedId === element.id;
                const text = element.text || " ";
                const template = comicLetterTemplate(element);
                const tailX = comicLetterTailX(element);
                const ovalLike = template === "oval" || template === "cloud";
                return (
                    <div
                        key={element.id}
                        style={{
                            position: "absolute",
                            left: `${x * 100}%`,
                            top: `${y * 100}%`,
                            width: `${element.width * 100}%`,
                            fontSize: `${(element.fontSize * 100).toFixed(2)}cqw`,
                            pointerEvents: editable ? "auto" : "none",
                            cursor: editable ? "grab" : "default",
                            outline: selected ? `2px dashed ${theme.canvas.selectionStroke}` : undefined,
                            outlineOffset: 4,
                            userSelect: "none",
                            touchAction: "none",
                        }}
                        onPointerDown={(event) => onDragStart(event, element)}
                        onPointerMove={onDragMove}
                        onPointerUp={onDragEnd}
                        onPointerCancel={onDragEnd}
                        onClick={(event) => { event.stopPropagation(); onSelect(element.id); }}
                    >
                        {element.kind === "sfx" ? (
                            <div style={{ color: "#111", fontWeight: 900, lineHeight: 1.1, textAlign: element.align, whiteSpace: "pre-wrap", wordBreak: "break-word", textShadow: "0 0 2px #fff, 0 0 4px #fff, 1px 1px 0 #fff, -1px -1px 0 #fff" }}>{text}</div>
                        ) : (
                            <div className="relative" style={{ background: element.kind === "caption" || template === "caption" ? "#fff8dc" : "#fff", border: "2px solid #111", borderStyle: template === "cloud" ? "dashed" : "solid", borderRadius: ovalLike ? "9999px" : template === "rounded" ? 14 : 2, padding: ovalLike ? "0.8em 1em" : "0.55em", color: "#111", lineHeight: 1.35, textAlign: element.align, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {text}
                                {element.kind !== "caption" && template !== "caption" && element.tail !== "none" ? (
                                    template === "cloud" ? (
                                        <>
                                            <span aria-hidden style={{ position: "absolute", bottom: "-0.8em", left: `calc(${(tailX * 100).toFixed(1)}% - 0.35em)`, width: "0.7em", height: "0.7em", background: "#fff", border: "2px dashed #111", borderRadius: "50%" }} />
                                            <span aria-hidden style={{ position: "absolute", bottom: "-1.25em", left: `calc(${(tailX * 100).toFixed(1)}% + ${element.tail === "left" ? "-0.65em" : "0.25em"})`, width: "0.4em", height: "0.4em", background: "#fff", border: "2px dashed #111", borderRadius: "50%" }} />
                                        </>
                                    ) : (
                                        <span aria-hidden style={{ position: "absolute", bottom: "-0.48em", left: `calc(${(tailX * 100).toFixed(1)}% - 0.45em)`, width: "0.9em", height: "0.9em", background: "#fff", borderRight: "2px solid #111", borderBottom: "2px solid #111", transform: "rotate(45deg)" }} />
                                    )
                                ) : null}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
