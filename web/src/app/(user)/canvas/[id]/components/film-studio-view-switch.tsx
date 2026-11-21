"use client";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmStudioView } from "../lib/film-studio-types";

export function FilmStudioViewSwitch({ view, onChange }: { view: FilmStudioView; onChange: (view: FilmStudioView) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border p-1 shadow-lg max-sm:top-24"
            style={{ zIndex: CANVAS_Z.hoverToolbar, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, backdropFilter: "blur(12px)" }}
        >
            {(["studio", "graph"] as const).map((value) => (
                <button
                    key={value}
                    type="button"
                    className="rounded-full px-3 py-1 text-xs font-medium transition"
                    style={{ background: view === value ? theme.toolbar.activeBg : undefined, color: theme.node.text }}
                    onClick={() => onChange(value)}
                >
                    {value === "studio" ? "Studio" : "画布"}
                </button>
            ))}
        </div>
    );
}
