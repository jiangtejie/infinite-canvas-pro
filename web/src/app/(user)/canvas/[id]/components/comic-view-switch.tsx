"use client";

import { BookOpen, PanelsTopLeft } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../lib/canvas-layer";

const VIEWS = [
    ["book", "漫画册", BookOpen],
    ["workbench", "漫画工作台", PanelsTopLeft],
] as const;

export function ComicViewSwitch({ view, onChange }: { view: "book" | "workbench"; onChange: (view: "book" | "workbench") => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="absolute inset-x-0 top-16 flex h-11 items-center gap-2 border-b px-3" style={{ zIndex: CANVAS_Z.hoverToolbar, background: theme.canvas.background, borderColor: theme.node.stroke }}>
            {VIEWS.map(([value, label, Icon]) => (
                <button key={value} type="button" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition" style={{ background: view === value ? theme.toolbar.activeBg : undefined, color: view === value ? theme.node.text : theme.node.muted }} onClick={() => onChange(value)}>
                    <Icon className="size-3.5" />{label}
                </button>
            ))}
        </div>
    );
}
