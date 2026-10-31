import { Compass, Focus, HelpCircle } from "lucide-react";
import { Button, Dropdown, Tooltip } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onFitAll: () => void;
    onFitSelected: () => void;
    hasSelection: boolean;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    onOpenShortcuts: () => void;
};

export function CanvasZoomControls({ scale, onScaleChange, onFitAll, onFitSelected, hasSelection, isMiniMapOpen, onToggleMiniMap, onOpenShortcuts }: CanvasZoomControlsProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    return (
        <div data-canvas-no-zoom className="absolute bottom-24 left-4 z-50 sm:bottom-5 sm:left-5" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex h-14 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={dockStyle}>
                <Tooltip title={isMiniMapOpen ? "关闭小地图" : "打开小地图"}>
                    <Button
                        type="text"
                        className="!h-8 !w-8 !min-w-8 !p-0"
                        style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }}
                        icon={<Compass className="size-4" />}
                        onClick={onToggleMiniMap}
                        aria-label={isMiniMapOpen ? "关闭小地图" : "打开小地图"}
                    />
                </Tooltip>
                <Tooltip title="查看全部（Shift + 1）">
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onFitAll} aria-label="查看全部" />
                </Tooltip>
                <Tooltip title="放大/缩小画布">
                    <input
                        type="range"
                        min="5"
                        max="500"
                        step="1"
                        value={Math.round(scale * 100)}
                        className="w-24"
                        style={{ accentColor: theme.node.activeStroke }}
                        onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
                        aria-label="放大/缩小画布"
                    />
                </Tooltip>
                <Dropdown trigger={["click"]} menu={{ items: [
                    { key: "all", label: "查看全部（Shift + 1）", onClick: onFitAll },
                    { key: "selected", label: "聚焦选中（Shift + 2）", disabled: !hasSelection, onClick: onFitSelected },
                    { key: "actual", label: "100%（Shift + 0）", onClick: () => onScaleChange(1) },
                ] }}>
                    <Button type="text" className="!px-1 !text-xs tabular-nums" style={{ color: theme.node.muted }} aria-label={`当前缩放 ${Math.round(scale * 100)}%，打开视图菜单`}>
                        {Math.round(scale * 100)}%
                    </Button>
                </Dropdown>
                <Tooltip title="快捷键">
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<HelpCircle className="size-4" />} onClick={onOpenShortcuts} aria-label="快捷键" />
                </Tooltip>
            </div>
        </div>
    );
}
