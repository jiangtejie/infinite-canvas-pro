"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, SlidersHorizontal } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useFilmViewState, useFilmViewStore } from "@/app/(user)/canvas/stores/use-film-view-store";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmDirectorBoardModel } from "../lib/film-studio-types";
import { selectFilmShotFocus } from "../lib/film-selectors";
import { FilmShotPanel } from "./film-shot-panel";
import { FilmShotStage } from "./film-shot-stage";
import { FilmStrip } from "./film-strip";

/** 关闭后的 antd Modal/Drawer 仍留在 DOM；只有存在可见模态层时才让出聚焦快捷键。 */
function hasVisibleModalLayer() {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some((layer) => {
        if (typeof layer.checkVisibility === "function") return layer.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        const style = getComputedStyle(layer);
        return style.display !== "none" && style.visibility !== "hidden" && layer.getClientRects().length > 0;
    });
}

/** 镜头聚焦：board 上的沉浸覆盖层，复用唯一 FilmShotEditor 与舞台，不复制镜头数据或任务入口。 */
export function FilmShotFocus({ model, theme }: { model: FilmDirectorBoardModel; theme: CanvasTheme }) {
    const [panelOpen, setPanelOpen] = useState(true);
    const [resizing, setResizing] = useState(false);
    const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
    const viewState = useFilmViewState(model.projectId);
    const updateView = useFilmViewStore((state) => state.update);
    const panelWidth = viewState.panelWidth;
    const stripOpen = viewState.stripOpen;
    const openSections = viewState.openShotSections;
    const toggleSection = (key: string) => updateView(model.projectId, (current) => {
        const next = new Set(current.openShotSections);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { ...current, openShotSections: next };
    });
    const setStripOpen = (open: boolean) => updateView(model.projectId, (current) => ({ ...current, stripOpen: open }));
    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        resizeRef.current = { startX: event.clientX, startWidth: panelWidth };
        setResizing(true);
    };
    const moveResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const resize = resizeRef.current;
        if (!resize) return;
        const next = Math.max(320, Math.min(560, resize.startWidth + event.clientX - resize.startX));
        updateView(model.projectId, (current) => current.panelWidth === next ? current : { ...current, panelWidth: next });
    };
    const endResize = () => {
        resizeRef.current = null;
        setResizing(false);
    };
    const resetPanelWidth = () => updateView(model.projectId, (current) => ({ ...current, panelWidth: 420 }));
    useEffect(() => {
        if (window.matchMedia("(max-width: 767px)").matches) setPanelOpen(false);
    }, []);

    const activeShot = model.activeShot;
    const focus = selectFilmShotFocus(model.shots, activeShot?.shot.id ?? null);
    const prev = focus.prev;
    const next = focus.next;
    const canCreateShot = Boolean(model.activeSceneId && model.activeSceneId !== "unassigned");

    useEffect(() => {
        if (!activeShot) model.onCloseShotFocus();
    }, [activeShot, model]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            // 版本室/全屏预览等可见模态层优先处理自己的 Esc 与快捷键；关闭后残留的弹层 DOM 不算。
            if (hasVisibleModalLayer()) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                model.onCloseShotFocus();
                return;
            }
            if (event.key === "ArrowLeft" && prev) {
                event.preventDefault();
                model.onSelectShot(prev.shot.id);
            }
            if (event.key === "ArrowRight" && next) {
                event.preventDefault();
                model.onSelectShot(next.shot.id);
            }
            if (!activeShot) return;
            if (event.key.toLowerCase() === "g" && model.canGenerateImage) {
                event.preventDefault();
                model.onGenerateImage(activeShot.shot.id);
            }
            if (event.key.toLowerCase() === "v" && model.canGenerateVideo) {
                event.preventDefault();
                model.onGenerateVideo(activeShot.shot.id);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [activeShot, model, next, prev]);

    if (!activeShot) return null;
    const shot = activeShot.shot;

    return (
        <div className="absolute inset-x-0 bottom-0 top-16 flex min-h-0 flex-col max-sm:top-[116px]" style={{ zIndex: CANVAS_Z.hoverToolbar, background: theme.canvas.background, color: theme.node.text }}>
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs" style={{ color: theme.node.muted }} onClick={model.onCloseShotFocus} title="关闭镜头聚焦 (Esc)">
                    <ArrowLeft className="size-3.5" />返回导演板
                </button>
                <span className="shrink-0 font-mono text-xs tabular-nums" style={{ color: theme.node.text }}>{shot.metadata?.filmShot?.shotNo || "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shot.metadata?.filmShot?.description || shot.title || "未命名镜头"}</span>
                <span className="hidden shrink-0 truncate text-xs sm:inline" style={{ color: theme.node.muted }}>{activeShot.sceneLabel}</span>
                <span className="ml-2 shrink-0 font-mono text-[11px] tabular-nums" style={{ color: theme.node.muted }}>{focus.index + 1} / {model.shots.length}</span>
                <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className="grid size-7 place-items-center rounded-full transition disabled:opacity-30" style={{ color: theme.node.text }} onClick={() => prev && model.onSelectShot(prev.shot.id)} disabled={!prev} aria-label="上一镜" title="上一镜 (←)"><ChevronLeft className="size-4" /></button>
                    <button type="button" className="grid size-7 place-items-center rounded-full transition disabled:opacity-30" style={{ color: theme.node.text }} onClick={() => next && model.onSelectShot(next.shot.id)} disabled={!next} aria-label="下一镜" title="下一镜 (→)"><ChevronRight className="size-4" /></button>
                </div>
            </div>
            <div className="relative flex min-h-0 flex-1">
                {panelOpen ? (
                    <aside className="relative z-30 flex h-full shrink-0 max-md:absolute max-md:inset-y-0 max-md:left-0" style={{ width: `min(${panelWidth}px, 88vw)` }}>
                        <FilmShotPanel
                            theme={theme}
                            shot={shot}
                            sceneLabel={activeShot.sceneLabel}
                            contexts={model.activeContexts}
                            styleName={model.styleName}
                            contextLenses={model.contextLenses}
                            canCreateShot={canCreateShot}
                            onCreateShot={() => model.onCreateShot()}
                            onUpdate={model.onUpdateShot}
                            onClose={() => setPanelOpen(false)}
                            imageGenerating={model.imageGenerating}
                            imageError={model.imageError}
                            taskProgress={model.taskProgress}
                            canGenerateImage={model.canGenerateImage}
                            onGenerateImage={model.onGenerateImage}
                            onStopImage={model.onStopImage}
                            videoGenerating={model.videoGenerating}
                            videoError={model.videoError}
                            canGenerateVideo={model.canGenerateVideo}
                            onGenerateVideo={model.onGenerateVideo}
                            onStopVideo={model.onStopVideo}
                            availableContexts={model.availableContexts}
                            onAddContext={model.onAddContext}
                            onRemoveContext={model.onRemoveContext}
                            onUpdateContext={model.onUpdateContext}
                            onEditAsset={model.onEditAsset}
                            onOpenScript={model.onOpenScript}
                            onCreateAsset={model.onCreateShotAsset}
                            openSections={openSections}
                            onToggleSection={toggleSection}
                        />
                        <button
                            type="button"
                            aria-label="调整镜头设置宽度"
                            title="拖拽调整宽度，双击恢复默认"
                            className="absolute inset-y-0 right-0 z-20 hidden w-1.5 cursor-col-resize touch-none md:block"
                            onPointerDown={startResize}
                            onPointerMove={moveResize}
                            onPointerUp={endResize}
                            onPointerCancel={endResize}
                            onDoubleClick={resetPanelWidth}
                        >
                            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: resizing ? theme.canvas.selectionStroke : theme.node.stroke }} />
                        </button>
                    </aside>
                ) : (
                    <button type="button" className="absolute left-3 top-3 z-40 grid size-9 place-items-center rounded-full border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel, color: theme.node.text }} onClick={() => setPanelOpen(true)} aria-label="打开镜头设置">
                        <SlidersHorizontal className="size-4" />
                    </button>
                )}
                {panelOpen ? <button type="button" className="absolute inset-0 z-20 bg-black/30 md:hidden" onClick={() => setPanelOpen(false)} aria-label="关闭镜头设置" /> : null}
                <div className="flex min-w-0 flex-1 flex-col">
                    <FilmShotStage
                        theme={theme}
                        shot={shot}
                        aspect={model.aspect}
                        onLocate={model.onLocateShot}
                        onPrev={() => prev && model.onSelectShot(prev.shot.id)}
                        onNext={() => next && model.onSelectShot(next.shot.id)}
                        hasPrev={Boolean(prev)}
                        hasNext={Boolean(next)}
                        imageGenerating={model.imageGenerating}
                        imageError={model.imageError}
                        canGenerateImage={model.canGenerateImage}
                        onGenerateImage={model.onGenerateImage}
                        onStopImage={model.onStopImage}
                        videoGenerating={model.videoGenerating}
                        videoError={model.videoError}
                        canGenerateVideo={model.canGenerateVideo}
                        onGenerateVideo={model.onGenerateVideo}
                        onStopVideo={model.onStopVideo}
                        generationInPanel={panelOpen}
                        contextLenses={model.contextLenses}
                        onCompareVersions={model.onOpenVersionCompare}
                    />
                    {stripOpen ? (
                        <div className="shrink-0">
                            <div className="flex h-8 items-center justify-between border-t px-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                <span className="text-[11px]" style={{ color: theme.node.muted }}>镜头条 · {model.shots.length} 镜</span>
                                <button type="button" className="grid size-6 place-items-center rounded" style={{ color: theme.node.muted }} onClick={() => setStripOpen(false)} aria-label="收起镜头条" title="收起镜头条">
                                    <ChevronDown className="size-3.5" />
                                </button>
                            </div>
                            <FilmStrip
                                theme={theme}
                                scenes={model.scenes}
                                activeShotId={shot.id}
                                onSelectShot={model.onSelectShot}
                                onCreateShot={model.onCreateShot}
                            />
                        </div>
                    ) : (
                        <button type="button" className="flex h-9 shrink-0 items-center justify-center gap-1.5 border-t text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted }} onClick={() => setStripOpen(true)} aria-label="展开镜头条">
                            <ChevronUp className="size-3.5" />
                            展开镜头条 · {model.shots.length} 镜
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
