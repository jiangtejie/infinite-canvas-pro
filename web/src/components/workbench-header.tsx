import { PanelBottom, PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export type WorkbenchLayout = "side" | "bottom";

export function WorkbenchHeader({ title, currentLayout, onLayoutChange, sideLabel = "侧边", bottomLabel = "底部" }: {
    title: string;
    currentLayout: WorkbenchLayout;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    sideLabel?: string;
    bottomLabel?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-[1px] bg-acid" />
                <span aria-hidden className="punk-signal" />
                <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="布局切换">
                <button
                    type="button"
                    aria-pressed={currentLayout === "side"}
                    className={cn("inline-flex h-6 items-center gap-1 rounded-[4px] px-2 text-[11px] transition-colors", currentLayout === "side" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => onLayoutChange("side")}
                >
                    <PanelLeft className="size-3" />
                    {sideLabel}
                </button>
                <button
                    type="button"
                    aria-pressed={currentLayout === "bottom"}
                    className={cn("inline-flex h-6 items-center gap-1 rounded-[4px] px-2 text-[11px] transition-colors", currentLayout === "bottom" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => onLayoutChange("bottom")}
                >
                    <PanelBottom className="size-3" />
                    {bottomLabel}
                </button>
            </div>
        </div>
    );
}
