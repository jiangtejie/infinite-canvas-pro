"use client";

import type { CSSProperties, ReactNode } from "react";
import { LayoutGrid, Scan } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmDirectorBoardModel } from "../lib/film-studio-types";
import { CanvasStageLayer, type CanvasStageModel } from "./canvas-stage-layer";
import { CanvasStageOverlays, type CanvasStageOverlaysModel } from "./canvas-stage-overlays";
import { FilmDirectorLayout } from "./film-director-layout";

/**
 * 影视导演板外壳：复用无限画布舞台与浮层，只叠加影视专用布局视觉与紧凑工具栏。
 * 视图切换由常驻四视图切换条统一提供，这里不重复视图入口。
 */
export function FilmDirectorBoard({ stage, overlays, film }: {
    stage: CanvasStageModel;
    overlays: CanvasStageOverlaysModel;
    film: FilmDirectorBoardModel;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="absolute inset-x-0 bottom-0 top-[108px] max-sm:top-[116px]">
            <CanvasStageLayer model={{ ...stage, backgroundLayer: <FilmDirectorLayout nodes={stage.nodes} connections={stage.connections} /> }} />
            <CanvasStageOverlays model={overlays} />
            <div
                data-canvas-no-zoom
                className="pointer-events-auto absolute left-3 top-3 flex items-center gap-0.5 rounded-lg px-1 py-1 max-sm:left-2 max-sm:top-2"
                style={{ zIndex: CANVAS_Z.toolbar, "--film-board-hover": theme.toolbar.itemHover, color: theme.node.muted } as CSSProperties}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <BoardAction icon={<LayoutGrid className="size-3.5" />} label="整理布局" title="整理布局：场次分列、镜头按全片顺序、上下文归带" onClick={film.onArrangeBoard} />
                <BoardAction icon={<Scan className="size-3.5" />} label="适应全部" title="适应全部（Shift + 1）" onClick={overlays.fitAllNodes} />
            </div>
        </div>
    );
}

function BoardAction({ icon, label, title, onClick }: { icon: ReactNode; label: string; title: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--film-board-hover)]"
            title={title}
            onClick={onClick}
        >
            {icon}
            {label}
        </button>
    );
}
