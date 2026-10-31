import { Button } from "antd";
import { PanelBottom, PanelLeft } from "lucide-react";

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
            <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-foreground">{title}</h1>
            </div>
            <div className="flex shrink-0 rounded-lg border border-border bg-muted p-1">
                <Button size="small" type={currentLayout === "side" ? "primary" : "text"} icon={<PanelLeft className="size-3.5" />} onClick={() => onLayoutChange("side")}>{sideLabel}</Button>
                <Button size="small" type={currentLayout === "bottom" ? "primary" : "text"} icon={<PanelBottom className="size-3.5" />} onClick={() => onLayoutChange("bottom")}>{bottomLabel}</Button>
            </div>
        </div>
    );
}
