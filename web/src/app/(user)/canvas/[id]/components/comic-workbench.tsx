"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Segmented } from "antd";

import { ComicCastStage } from "@/app/(user)/comic/components/comic-cast-stage";
import { ComicConceptStage } from "@/app/(user)/comic/components/comic-concept-stage";
import { ComicLayoutStage } from "@/app/(user)/comic/components/comic-layout-stage";
import { ComicReviewStage } from "@/app/(user)/comic/components/comic-review-stage";
import { ComicScriptStage } from "@/app/(user)/comic/components/comic-script-stage";
import { COMIC_STAGE_LABELS, invalidateComicPageCompositions } from "@/app/(user)/comic/utils/comic-project";
import type { ComicProject, ComicProjectUpdater } from "@/app/(user)/comic/types";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasProject } from "../../stores/use-canvas-store";
import { applyComicProject, applyComicProjectUpdate, selectComicProject } from "../lib/comic-canvas-projection";

type ComicProjectPatch = Partial<ComicProject> | ((current: ComicProject) => Partial<ComicProject>);

export function ComicWorkbench({ project, selectedPageId, onChangeProject }: { project: CanvasProject; selectedPageId?: string; onChangeProject: (project: CanvasProject) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const view = useMemo(() => selectComicProject(project), [project]);
    const projectRef = useRef(project);
    useLayoutEffect(() => {
        projectRef.current = project;
    }, [project]);
    if (!view) {
        return <div className="grid h-full place-items-center text-sm" style={{ color: theme.node.muted }}>漫画册节点缺失，无法打开漫画工作台。</div>;
    }
    const commit = (next: ComicProjectUpdater): ComicProject => {
        const current = projectRef.current;
        const updated = typeof next === "function"
            ? applyComicProjectUpdate(current, next)
            : applyComicProject(current, next);
        projectRef.current = updated;
        onChangeProject(updated);
        return selectComicProject(updated) || view;
    };
    const patchConcept = (patch: ComicProjectPatch) => {
        commit((current) => {
            const resolved = typeof patch === "function" ? patch(current) : patch;
            const formatChanged = Boolean(resolved.format && resolved.format !== current.format);
            const invalidatesComposition = formatChanged || resolved.styleGuide !== undefined;
            return invalidatesComposition
                ? invalidateComicPageCompositions({ ...current, ...resolved })
                : { ...current, ...resolved };
        });
    };
    const totalPages = view.chapters.reduce((total, chapter) => total + chapter.pages.length, 0);
    const totalPanels = view.chapters.reduce((total, chapter) => total + chapter.pages.reduce((sum, page) => sum + page.panels.length, 0), 0);

    return (
        <div className="absolute inset-x-0 bottom-0 top-[108px] overflow-y-auto max-sm:top-[116px]" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <div className="page-shell flex flex-col gap-6 py-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.node.muted }}>Comic Workbench</p>
                        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{view.title || "未命名漫画"}</h1>
                        <p className="mt-1 text-xs" style={{ color: theme.node.muted }}>{view.chapters.length} 章 · {totalPages} 页 · {totalPanels} 格 · {view.characters.length} 角色 · {view.locations.length} 场景</p>
                    </div>
                    <Segmented value={view.stage} options={(Object.entries(COMIC_STAGE_LABELS) as Array<[ComicProject["stage"], string]>).map(([value, label]) => ({ label, value }))} onChange={(stage) => commit({ ...view, stage: stage as ComicProject["stage"] })} />
                </div>
                {view.stage === "script" ? (
                    <ComicScriptStage project={view} onChange={commit} />
                ) : view.stage === "layout" ? (
                    <ComicLayoutStage project={view} selectedPageId={selectedPageId} onChange={commit} />
                ) : view.stage === "review" ? (
                    <ComicReviewStage project={view} onChange={commit} />
                ) : view.stage === "cast" ? (
                    <ComicCastStage project={view} onChange={commit} />
                ) : (
                    <ComicConceptStage project={view} onPatch={patchConcept} />                )}
            </div>
        </div>
    );
}
