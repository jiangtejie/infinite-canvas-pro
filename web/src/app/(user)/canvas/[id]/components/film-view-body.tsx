"use client";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { FilmDirectorBoardModel, FilmViewMode } from "../lib/film-studio-types";
import { FilmContextCenter } from "./film-context-center";
import { FilmShotTableView } from "./film-shot-table-view";
import { FilmStoryboardView } from "./film-storyboard-view";

export function FilmViewBody({ view, model, theme }: { view: Exclude<FilmViewMode, "board">; model: FilmDirectorBoardModel; theme: CanvasTheme }) {
    return (
        <div className="absolute inset-x-0 bottom-0 top-[108px] flex min-h-0 max-sm:top-[116px]" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {view === "table" ? <FilmShotTableView theme={theme} model={model} /> : null}
            {view === "storyboard" ? <FilmStoryboardView theme={theme} model={model} /> : null}
            {view === "assets" ? <FilmContextCenter theme={theme} model={model} /> : null}
        </div>
    );
}
