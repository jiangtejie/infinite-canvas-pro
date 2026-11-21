"use client";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmStudioModel, FilmStudioView } from "../lib/film-studio-types";
import { FilmShotTableView } from "./film-shot-table-view";
import { FilmStoryboardView } from "./film-storyboard-view";
import { FilmTimelineView } from "./film-timeline-view";

export function FilmViewBody({ view, model, theme }: { view: Exclude<FilmStudioView, "studio" | "graph">; model: FilmStudioModel; theme: CanvasTheme }) {
    return (
        <div className="absolute inset-x-0 bottom-0 top-[108px] flex min-h-0 max-sm:top-[116px]" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {view === "table" ? <FilmShotTableView theme={theme} model={model} /> : null}
            {view === "board" ? <FilmStoryboardView theme={theme} model={model} /> : null}
            {view === "timeline" ? <FilmTimelineView theme={theme} model={model} /> : null}
        </div>
    );
}
