"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { useFilmViewState, useFilmViewStore } from "@/app/(user)/canvas/stores/use-film-view-store";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { patchFilmShotNode } from "../lib/film-node-patch";
import { FilmShotPanel } from "./film-shot-panel";
import { FilmShotStage } from "./film-shot-stage";
import { FilmStrip } from "./film-strip";

export function FilmStudioBody({ model, theme }: { model: FilmStudioModel; theme: CanvasTheme }) {
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
        const next = Math.max(280, Math.min(480, resize.startWidth + event.clientX - resize.startX));
        updateView(model.projectId, (current) => current.panelWidth === next ? current : { ...current, panelWidth: next });
    };
    const endResize = () => {
        resizeRef.current = null;
        setResizing(false);
    };
    const resetPanelWidth = () => updateView(model.projectId, (current) => ({ ...current, panelWidth: 320 }));
    useEffect(() => {
        if (window.matchMedia("(max-width: 767px)").matches) setPanelOpen(false);
    }, []);

    const activeShot = model.activeShot;
    const activeIndex = activeShot ? model.shots.findIndex((entry) => entry.shot.id === activeShot.shot.id) : -1;
    const prev = activeIndex > 0 ? model.shots[activeIndex - 1] : null;
    const next = activeIndex >= 0 && activeIndex < model.shots.length - 1 ? model.shots[activeIndex + 1] : null;
    const activeScene = model.scenes.find((scene) => scene.id === model.activeSceneId) ?? null;
    const sceneLabel = activeShot?.sceneLabel ?? activeScene?.label ?? "未分场";
    const canCreateShot = Boolean(model.activeSceneId && model.activeSceneId !== "unassigned");

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
            if (event.key === "ArrowLeft" && prev) {
                event.preventDefault();
                model.onSelectShot(prev.shot.id);
            }
            if (event.key === "ArrowRight" && next) {
                event.preventDefault();
                model.onSelectShot(next.shot.id);
            }
            if (event.key.toLowerCase() === "g" && model.canGenerateImage) {
                event.preventDefault();
                model.onGenerateImage();
            }
            if (event.key.toLowerCase() === "v" && model.canGenerateVideo) {
                event.preventDefault();
                model.onGenerateVideo();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [model, next, prev]);

    return (
        <div className="absolute inset-x-0 bottom-0 top-[108px] flex min-h-0 max-sm:top-[116px]" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {panelOpen ? (
                <aside className="relative z-30 flex h-full shrink-0 max-md:absolute max-md:inset-y-0 max-md:left-0" style={{ width: `min(${panelWidth}px, 88vw)` }}>
                    <FilmShotPanel
                        theme={theme}
                        shot={activeShot?.shot ?? null}
                        sceneLabel={sceneLabel}
                        bindings={model.activeBindings}
                        styleName={model.styleName}
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
                        availableAssets={model.availableAssets}
                        onAddBinding={model.onAddBinding}
                        onRemoveBinding={model.onRemoveBinding}
                        onUpdateBinding={model.onUpdateBinding}
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
                    shot={activeShot?.shot ?? null}
                    sceneLabel={sceneLabel}
                    aspect={model.aspect}
                    canCreateShot={canCreateShot}
                    onCreateShot={() => model.onCreateShot()}
                    onLocate={model.onLocateInGraph}
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
                    onSelectImageVersion={(version) => {
                        if (!activeShot) return;
                        model.onUpdateShot(activeShot.shot.id, (node) => ({ ...patchFilmShotNode(node, { imageUrl: version.url, storageKey: version.storageKey || "", errorMessage: "" }), metadata: { ...node.metadata, status: "success", errorDetails: undefined, filmShotTaskKind: undefined } }));
                    }}
                    onSelectVideoVersion={(version) => {
                        if (!activeShot) return;
                        model.onUpdateShot(activeShot.shot.id, (node) => ({ ...patchFilmShotNode(node, { videoUrl: version.url, videoStorageKey: version.storageKey || "", errorMessage: "" }), metadata: { ...node.metadata, status: "success", errorDetails: undefined, filmShotTaskKind: undefined } }));
                    }}
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
                            activeShotId={activeShot?.shot.id ?? null}
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
    );
}
