"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { FilmShotPanel } from "./film-shot-panel";
import { FilmShotStage } from "./film-shot-stage";
import { FilmStrip } from "./film-strip";

export function FilmStudioBody({ model, theme }: { model: FilmStudioModel; theme: CanvasTheme }) {
    const [panelOpen, setPanelOpen] = useState(true);
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
        <div className="absolute inset-x-0 bottom-0 top-16 flex min-h-0 max-sm:top-24" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {panelOpen ? (
                <aside className="relative z-30 max-md:absolute max-md:inset-y-0 max-md:left-0">
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
                    />
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
                />
                <FilmStrip
                    theme={theme}
                    scenes={model.scenes}
                    activeShotId={activeShot?.shot.id ?? null}
                    onSelectShot={model.onSelectShot}
                    onCreateShot={model.onCreateShot}
                />
            </div>
        </div>
    );
}
