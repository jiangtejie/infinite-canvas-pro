import { useEffect, useRef, useState } from "react";
import { Compass, Focus, HelpCircle } from "lucide-react";
import { Button, Tooltip } from "antd";

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
    const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
    const zoomMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!zoomMenuOpen) return;
        const closeOnPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && zoomMenuRef.current?.contains(target)) return;
            setZoomMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setZoomMenuOpen(false);
        };
        document.addEventListener("pointerdown", closeOnPointerDown, true);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnPointerDown, true);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [zoomMenuOpen]);
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
                <div ref={zoomMenuRef} className="relative">
                    <Button type="text" className="!px-1 !text-xs tabular-nums" style={{ color: theme.node.muted, background: zoomMenuOpen ? theme.toolbar.activeBg : undefined }} aria-label={`当前缩放 ${Math.round(scale * 100)}%，打开视图菜单`} aria-haspopup="menu" aria-expanded={zoomMenuOpen} onClick={() => setZoomMenuOpen((value) => !value)}>
                        {Math.round(scale * 100)}%
                    </Button>
                    {zoomMenuOpen ? (
                        <div role="menu" className="absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-xl border p-1" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, boxShadow: "0 12px 32px rgba(0,0,0,0.28)" }}>
                            <button type="button" role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/5" style={{ color: theme.node.text }} onClick={() => { setZoomMenuOpen(false); onFitAll(); }}>查看全部（Shift + 1）</button>
                            <button type="button" role="menuitem" disabled={!hasSelection} className="w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40" style={{ color: theme.node.text }} onClick={() => { setZoomMenuOpen(false); onFitSelected(); }}>聚焦选中（Shift + 2）</button>
                            <button type="button" role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/5" style={{ color: theme.node.text }} onClick={() => { setZoomMenuOpen(false); onScaleChange(1); }}>100%（Shift + 0）</button>
                        </div>
                    ) : null}
                </div>
                <Tooltip title="快捷键">
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<HelpCircle className="size-4" />} onClick={onOpenShortcuts} aria-label="快捷键" />
                </Tooltip>
            </div>
        </div>
    );
}
