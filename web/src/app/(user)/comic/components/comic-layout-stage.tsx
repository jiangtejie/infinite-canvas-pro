"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { App, Button, Modal } from "antd";
import { Eye, FileText, Grid2x2, Layers, LayoutPanelTop, LoaderCircle, Plus, Rows3, Sparkles, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useModelConfig } from "@/hooks/use-model-config";
import { requestImages } from "@/services/api/image/request";
import type { SeedableImageConfig } from "@/services/api/image";
import { errorMessage } from "@/lib/utils";
import type { ComicImageRef, ComicPanel, ComicPanelLayout, ComicPage, ComicProject, ComicProjectUpdater } from "../types";
import { comicPageCompositionWarnings, createComicGeneratedPanelImage, createComicGenerationContext, createComicPanelGenerationSnapshot, currentComicPanelInputSignature, isComicPanelGenerationSnapshotCurrent, loadComicPanelReferences, resolveComicPanelImageState, type ComicPanelAnchor } from "../utils/comic-image-generation";
import { comicPageCompositionInputSignature, composeComicPage } from "../utils/comic-page-composition";
import { comicPanelRect, comicPagesInBookOrder, createComicPanel, equalGridLayouts, equalVerticalLayouts, recordComicPanelGenerationResult, resetComicReviewStatus, updateComicPage } from "../utils/comic-project";
import { ComicImage } from "./comic-image";

type DragState = {
    panelId: string;
    chapterId: string;
    pageId: string;
    type: "move" | "resize";
    startX: number;
    startY: number;
    frameW: number;
    frameH: number;
    rect: ComicPanelLayout;
};

export function ComicLayoutStage({ project, selectedPageId, onChange }: { project: ComicProject; selectedPageId?: string; onChange: (update: ComicProjectUpdater) => ComicProject }) {
    const { message, modal } = App.useApp();
    const confirm = useConfirm();
    const resolveModelConfig = useModelConfig();
    const [generating, setGenerating] = useState(false);
    const [composing, setComposing] = useState(false);
    const [pagePreview, setPagePreview] = useState<ComicImageRef | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const pages = useMemo(() => comicPagesInBookOrder(project), [project]);
    const [selectedKey, setSelectedKey] = useState(() => pages.find((item) => item.page.id === selectedPageId) ? `${pages.find((item) => item.page.id === selectedPageId)!.chapter.id}:${selectedPageId}` : pages[0] ? `${pages[0].chapter.id}:${pages[0].page.id}` : "");
    const externalSelectedKey = useMemo(() => {
        const selectedPage = pages.find((item) => item.page.id === selectedPageId);
        return selectedPage ? `${selectedPage.chapter.id}:${selectedPage.page.id}` : "";
    }, [pages, selectedPageId]);
    useEffect(() => {
        if (externalSelectedKey) setSelectedKey(externalSelectedKey);
    }, [externalSelectedKey]);
    const [selectedPanelId, setSelectedPanelId] = useState("");
    const [preview, setPreview] = useState<{ panelId: string; rect: ComicPanelLayout } | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const previewRef = useRef<{ panelId: string; rect: ComicPanelLayout } | null>(null);
    const selected = pages.find((item) => `${item.chapter.id}:${item.page.id}` === selectedKey) || pages[0];
    const page = selected?.page;
    const chapter = selected?.chapter;
    const selectedPanel = page?.panels.find((item) => item.id === selectedPanelId);

    const commitPanels = (panels: ComicPanel[], patch: Partial<ComicPage> = {}) => {
        if (!chapter || !page) return;
        onChange(updateComicPage(project, chapter.id, page.id, { ...patch, panels, pageImage: undefined, compositionContext: undefined, reviewStatus: resetComicReviewStatus(page.reviewStatus) }));
    };

    const addPanel = () => {
        if (!page) return;
        const next = createComicPanel();
        commitPanels([...page.panels, next]);
        setSelectedPanelId(next.id);
    };

    const removePanel = async () => {
        if (!page || !selectedPanel) return;
        const accepted = await confirm({ title: "删除选中页格？", description: "页格内容会一起删除；布局修改会把页面退回草稿。", confirmText: "删除页格", tone: "danger" });
        if (!accepted) return;
        onChange((current) => {
            const currentPage = current.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
            return currentPage ? updateComicPage(current, chapter.id, page.id, { panels: currentPage.panels.filter((item) => item.id !== selectedPanel.id), pageImage: undefined, compositionContext: undefined, reviewStatus: resetComicReviewStatus(currentPage.reviewStatus) }) : current;
        });
        setSelectedPanelId("");
    };

    const applyLayouts = (layouts: ComicPanelLayout[]) => {
        if (!page) return;
        commitPanels(page.panels.map((item, index) => ({ ...item, layout: layouts[index] })));
    };

    const generatePanelImages = async (panelIds?: string[]) => {
        if (!page || !chapter || generating) return;
        const targets = panelIds?.length ? page.panels.filter((panel) => panelIds.includes(panel.id)) : page.panels;
        if (!targets.length) return void message.warning("这一页还没有可生成的页格");
        const config = resolveModelConfig("image");
        if (!config) return;
        const accepted = await confirm({
            title: panelIds?.length ? `继续生成「${page.title}」剩余页格？` : `生成「${page.title}」的页格图？`,
            description: `将依次生成 ${targets.length} 个页格，结合角色/场景参考图保持一致性；会消耗算力点，生成中不能停止，建议先导出备份。`,
            confirmText: panelIds?.length ? "继续生成" : "开始生成",
        });
        if (!accepted) return;
        setGenerating(true);
        const startedAt = Date.now();
        let targetIds = targets.map((panel) => panel.id);
        let remaining = new Set(targetIds);
        let nextProject = onChange((current) => {
            const currentPage = current.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
            const panelIds = new Set(currentPage?.panels.map((panel) => panel.id) || []);
            targetIds = targetIds.filter((id) => panelIds.has(id));
            remaining = new Set(targetIds);
            return currentPage ? updateComicPage(current, chapter.id, page.id, { pendingPanelTask: { panelIds: [...remaining], startedAt } }) : current;
        });
        if (!targetIds.length) {
            setGenerating(false);
            message.warning("页面或页格已删除，未继续生成");
            return;
        }
        let anchor: ComicPanelAnchor | null = null;
        let stale = false;
        const warnings = new Set<string>();
        const imageConfig = { ...config, count: "1" } as SeedableImageConfig;
        for (const [index, panelId] of targetIds.entries()) {
            setProgress({ done: index, total: targetIds.length });
            const currentPage = nextProject.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
            const currentPanel = currentPage?.panels.find((item) => item.id === panelId);
            if (!currentPage || !currentPanel) {
                stale = true;
                break;
            }
            const snapshot = createComicPanelGenerationSnapshot(nextProject, currentPage, currentPanel, { anchor: anchor || undefined, model: imageConfig.model, size: imageConfig.size });
            const compiled = snapshot.context;
            compiled.warnings.forEach((warning) => warnings.add(warning));
            try {
                const loaded = await loadComicPanelReferences(compiled.referenceDescriptors);
                loaded.missingReferenceIds.forEach((id) => warnings.add(`参考图读取失败：${id}`));
                const images = await requestImages(imageConfig, compiled.prompt, loaded.references);
                const generated = images[0];
                if (!generated) throw new Error("AI 没有返回图片");
                const image: ComicImageRef = { url: generated.dataUrl, storageKey: generated.storageKey, width: generated.width, height: generated.height };
                const context = createComicGenerationContext(compiled, loaded, { model: imageConfig.model, size: imageConfig.size });
                nextProject = onChange((current) => {
                    const latestPage = current.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
                    const latestPanel = latestPage?.panels.find((item) => item.id === panelId);
                    if (!latestPage || !latestPanel || !isComicPanelGenerationSnapshotCurrent(current, latestPage, latestPanel, snapshot, { model: imageConfig.model, size: imageConfig.size })) {
                        stale = true;
                        return current;
                    }
                    remaining.delete(panelId);
                    return recordComicPanelGenerationResult(current, chapter.id, page.id, panelId, { image: createComicGeneratedPanelImage(image, context), imageError: undefined }, [...remaining], startedAt);
                });
                if (stale) break;
                if (!anchor) anchor = { panelId, inputSignature: compiled.inputSignature, image };
            } catch (error) {
                nextProject = onChange((current) => {
                    const latestPage = current.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
                    const latestPanel = latestPage?.panels.find((item) => item.id === panelId);
                    if (!latestPage || !latestPanel || !isComicPanelGenerationSnapshotCurrent(current, latestPage, latestPanel, snapshot, { model: imageConfig.model, size: imageConfig.size })) {
                        stale = true;
                        return current;
                    }
                    return recordComicPanelGenerationResult(current, chapter.id, page.id, panelId, { imageError: errorMessage(error, "页格生成失败") }, [...remaining], startedAt);
                });
                if (stale) break;
            }
        }
        setGenerating(false);
        setProgress(null);
        if (warnings.size) modal.info({ title: "本次生成的参考图提示", content: <ul className="m-0 list-disc pl-5 text-xs leading-6">{Array.from(warnings).map((warning) => <li key={warning}>{warning}</li>)}</ul> });
        if (stale) message.warning("生成期间页格或所用设定已修改，已停止后续生成，请重新生成");
        else if (remaining.size) message.warning(`还有 ${remaining.size} 个页格未生成，可刷新或稍后继续`);
        else message.success("页格图生成完成，可逐格检查");
    };

    const panelImageState = (panel: ComicPanel) => {
        if (!page) return null;
        const config = resolveModelConfig("image");
        return resolveComicPanelImageState(panel, currentComicPanelInputSignature(project, page, panel, { model: config?.model, size: config?.size }));
    };

    const composePage = async () => {
        if (!page || !chapter || composing) return;
        const available = page.panels.filter((panel) => panel.image).length;
        if (!available) return void message.warning("先给至少一个页格生成图片，才能合成整页");
        const missing = page.panels.length - available;
        if (missing) {
            const accepted = await confirm({ title: "还有页格没有图", description: `${missing} 个页格会留白，仍要合成这一页吗？`, confirmText: "继续合成" });
            if (!accepted) return;
        }
        setComposing(true);
        try {
            const config = resolveModelConfig("image");
            const warnings = comicPageCompositionWarnings(project, page, { model: config?.model, size: config?.size });
            const riskyPanelIds = [...warnings.stalePanelIds, ...warnings.unrecordedPanelIds];
            if (riskyPanelIds.length) {
                const acceptedStale = await confirm({
                    title: "有页格与当前设定不一致",
                    description: `${riskyPanelIds.length} 个页格使用的图已过期或缺少生成上下文。确认后仍会把它们合成进整页，成品会保留提示。`,
                    confirmText: "仍然合成",
                });
                if (!acceptedStale) return;
            }
            const compositionOptions = { confirmedPanelIds: riskyPanelIds, model: config?.model, size: config?.size };
            const inputSignature = comicPageCompositionInputSignature(project, page, compositionOptions);
            const result = await composeComicPage(project, page, compositionOptions);
            let stale = false;
            onChange((current) => {
                const currentPage = current.chapters.find((item) => item.id === chapter.id)?.pages.find((item) => item.id === page.id);
                if (!currentPage || comicPageCompositionInputSignature(current, currentPage, compositionOptions) !== inputSignature) {
                    stale = true;
                    return current;
                }
                return updateComicPage(current, chapter.id, page.id, { pageImage: result.image, compositionContext: result.compositionContext, reviewStatus: resetComicReviewStatus(currentPage.reviewStatus) });
            });
            if (stale) {
                message.warning("合成期间页面或设定已修改，请重新合成");
                return;
            }
            setPagePreview(result.image);
            if (warnings.incompletePanelIds.length) message.warning(`整页已合成，${warnings.incompletePanelIds.length} 个页格生成时参考图不完整`);
            else if (result.missing) message.warning(`整页已合成，${result.missing} 个页格没有可用图片`);
            else message.success("整页已合成");
        } catch (error) {
            message.error(errorMessage(error, "合成整页失败"));
        } finally {
            setComposing(false);
        }
    };

    const startDrag = (event: ReactPointerEvent<HTMLElement>, panel: ComicPanel, index: number, type: "move" | "resize") => {
        if (!page || !chapter) return;
        event.stopPropagation();
        setSelectedPanelId(panel.id);
        const frame = event.currentTarget.closest("[data-comic-layout-page]")?.getBoundingClientRect();
        if (!frame) return;
        const rect = comicPanelRect(page, panel, index);
        dragRef.current = { panelId: panel.id, chapterId: chapter.id, pageId: page.id, type, startX: event.clientX, startY: event.clientY, frameW: frame.width, frameH: frame.height, rect };
        event.currentTarget.setPointerCapture(event.pointerId);
        previewRef.current = { panelId: panel.id, rect };
        setPreview(previewRef.current);
    };

    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = (event.clientX - drag.startX) / Math.max(1, drag.frameW);
        const dy = (event.clientY - drag.startY) / Math.max(1, drag.frameH);
        const rect = drag.type === "move"
            ? { ...drag.rect, x: Math.min(1 - drag.rect.w, Math.max(0, drag.rect.x + dx)), y: Math.min(1 - drag.rect.h, Math.max(0, drag.rect.y + dy)) }
            : { ...drag.rect, w: Math.min(1 - drag.rect.x, Math.max(0.08, drag.rect.w + dx)), h: Math.min(1 - drag.rect.y, Math.max(0.08, drag.rect.h + dy)) };
        previewRef.current = { panelId: drag.panelId, rect };
        setPreview(previewRef.current);
    };

    const endDrag = () => {
        const drag = dragRef.current;
        dragRef.current = null;
        const current = previewRef.current;
        previewRef.current = null;
        setPreview(null);
        if (!drag || !current) return;
        const moved = Math.abs(current.rect.x - drag.rect.x) > 0.002 || Math.abs(current.rect.y - drag.rect.y) > 0.002 || Math.abs(current.rect.w - drag.rect.w) > 0.002 || Math.abs(current.rect.h - drag.rect.h) > 0.002;
        if (!moved) return;
        const target = pages.find((item) => item.page.id === drag.pageId)?.page;
        if (!target) return;
        const panels = target.panels.map((item) => item.id === drag.panelId ? { ...item, layout: current.rect } : item);
        onChange(updateComicPage(project, drag.chapterId, drag.pageId, { panels, pageImage: undefined, compositionContext: undefined, reviewStatus: resetComicReviewStatus(target.reviewStatus) }));
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3">
                <div className="flex items-center justify-between px-1"><span className="text-[11px] font-medium text-muted-foreground">页面</span><span className="text-[10px] text-muted-foreground/60">{pages.length}</span></div>
                <div className="space-y-1.5">
                    {pages.map(({ chapter: itemChapter, page: itemPage }) => (
                        <button key={itemPage.id} type="button" className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${page?.id === itemPage.id ? "border-acid/50 bg-acid/10" : "border-transparent hover:bg-foreground/5"}`} onClick={() => { setSelectedKey(`${itemChapter.id}:${itemPage.id}`); setSelectedPanelId(""); }}>
                            {itemPage.pageImage ? <span className="h-10 w-8 shrink-0 overflow-hidden rounded-sm border border-border/70 bg-white"><ComicImage image={itemPage.pageImage} className="size-full object-cover" /></span> : <FileText className="size-3.5 shrink-0 opacity-55" />}
                            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{itemPage.title}</span><span className="block truncate text-[10px] text-muted-foreground/60">{itemChapter.title} · {itemPage.panels.length} 格{itemPage.pageImage ? " · 已合成" : ""}</span></span>
                        </button>
                    ))}
                    {!pages.length ? <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">还没有页面，先去剧本添加章节和页面。</p> : null}
                </div>
            </aside>

            <section className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-4">
                {page && chapter ? (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div><p className="eyebrow">Name / 页布局</p><h2 className="mt-1 text-base font-semibold">{page.title}</h2></div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Button size="small" icon={<Rows3 className="size-3.5" />} onClick={() => applyLayouts(equalVerticalLayouts(page.panels.length || 1))}>纵向均分</Button>
                                <Button size="small" icon={<Grid2x2 className="size-3.5" />} onClick={() => applyLayouts(equalGridLayouts(page.panels.length || 1))}>网格</Button>
                                <Button size="small" icon={<Plus className="size-3.5" />} onClick={addPanel}>添加页格</Button>
                                <Button size="small" danger disabled={!selectedPanel} icon={<Trash2 className="size-3.5" />} onClick={() => void removePanel()}>删除页格</Button>
                                {page.pageImage ? <Button size="small" icon={<Eye className="size-3.5" />} onClick={() => setPagePreview(page.pageImage || null)}>预览整页</Button> : null}
                                <Button size="small" loading={composing} disabled={!page.panels.some((panel) => panel.image)} icon={<Layers className="size-3.5" />} onClick={() => void composePage()}>合成整页</Button>
                                <Button size="small" type="primary" loading={generating} disabled={!page.panels.length} icon={generating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} onClick={() => void generatePanelImages()}>{progress ? `生成 ${progress.done}/${progress.total}` : "生成页格图"}</Button>
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60">拖动页格移动，右下角缩放；任何布局修改都会把页面退回草稿。</p>
                        {page.pendingPanelTask?.panelIds.length ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700">
                                <span>上次生成中断，剩余 {page.pendingPanelTask.panelIds.length} 格</span>
                                <Button size="small" type="primary" loading={generating} disabled={generating} onClick={() => void generatePanelImages(page.pendingPanelTask?.panelIds)}>继续生成</Button>
                                <Button size="small" type="text" disabled={generating} onClick={() => onChange(updateComicPage(project, chapter.id, page.id, { pendingPanelTask: undefined }))}>忽略</Button>
                            </div>
                        ) : null}
                        <div className="flex justify-center py-2">
                            <div data-comic-layout-page className="relative w-full max-w-[520px] overflow-hidden border-2 border-foreground/80 bg-white shadow-[0_18px_50px_rgba(0,0,0,.18)]" style={{ aspectRatio: project.format === "strip" ? 9 / 16 : 3 / 4 }}>
                                {page.panels.map((panel, index) => {
                                    const base = comicPanelRect(page, panel, index);
                                    const rect = preview?.panelId === panel.id ? preview.rect : base;
                                    const active = selectedPanelId === panel.id;
                                    const imageState = panel.image ? panelImageState(panel) : null;
                                    return (
                                        <div key={panel.id} className="absolute cursor-move overflow-hidden border bg-muted/60 p-2 text-[10px] text-foreground" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, borderColor: active ? "var(--acid)" : "var(--foreground)", outline: active ? "2px solid color-mix(in oklch, var(--acid) 45%, transparent)" : undefined }} onPointerDown={(event) => startDrag(event, panel, index, "move")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                                            {panel.image ? <ComicImage image={panel.image} className="pointer-events-none absolute inset-0 size-full object-cover" /> : null}
                                            <div className="relative z-10 flex items-center justify-between gap-1"><span className="rounded px-1 font-mono font-semibold" style={{ background: "rgba(255,255,255,.82)" }}>#{index + 1}</span>{imageState ? <span className={`rounded px-1 ${imageState === "current" ? "bg-emerald-50 text-emerald-700" : imageState === "incomplete" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>{panelImageStateLabel(imageState)}</span> : null}<LayoutPanelTop className="size-3 opacity-40" /></div>
                                            {!panel.image ? <p className="relative z-10 mt-1 line-clamp-3 leading-4 text-muted-foreground">{panel.description || "未写画面描述"}</p> : null}
                                            {panel.imageError ? <p className="relative z-10 mt-1 line-clamp-2 rounded bg-white/80 px-1 leading-4 text-red-500">{panel.imageError}</p> : null}
                                            <span className="absolute bottom-0 right-0 z-20 size-3 cursor-nwse-resize border-l border-t bg-foreground/20" aria-label="缩放页格" onPointerDown={(event) => startDrag(event, panel, index, "resize")} />
                                        </div>
                                    );
                                })}
                                {!page.panels.length ? <div className="flex size-full items-center justify-center text-xs text-muted-foreground">还没有页格，点上方「添加页格」。</div> : null}
                            </div>
                        </div>
                    </>
                ) : <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground"><FileText className="size-8 opacity-40" /><span>还没有页面。</span></div>}
            </section>

            <Modal open={Boolean(pagePreview)} title="成品页预览" footer={null} width="min(760px, 94vw)" centered destroyOnHidden onCancel={() => setPagePreview(null)}>
                {pagePreview ? <div className="rounded-lg border border-border/70 bg-white p-2"><ComicImage image={pagePreview} className="mx-auto max-h-[72vh] max-w-full object-contain" /></div> : null}
                {page?.compositionContext && (page.compositionContext.stalePanelIds.length || page.compositionContext.unrecordedPanelIds.length || page.compositionContext.incompletePanelIds.length) ? <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-amber-700">成品包含旧上下文图：设定已变 {page.compositionContext.stalePanelIds.length} 格、未记录 {page.compositionContext.unrecordedPanelIds.length} 格、参考缺失 {page.compositionContext.incompletePanelIds.length} 格。</p> : null}
                <p className="mt-2 text-center text-[11px] text-muted-foreground/60">这是页格拼合结果；修改页格、布局或页格图后需要重新合成。</p>
            </Modal>
        </div>
    );
}

function panelImageStateLabel(state: "unrecorded" | "stale" | "incomplete" | "current") {
    if (state === "unrecorded") return "未记录";
    if (state === "stale") return "设定已变";
    if (state === "incomplete") return "参考缺失";
    return "当前";
}
