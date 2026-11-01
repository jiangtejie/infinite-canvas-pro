import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Segmented, Switch, Tooltip } from "antd";
import { CircleDot, Copy, Ellipsis, FolderOpen, Globe2, Grid2x2, Hand, Image as ImageIcon, Info, Layers3, Library, Moon, MousePointer2, Music2, Palette, Redo2, Settings2, Square, Sun, Trash2, Type, Undo2, Upload, Video } from "lucide-react";

import { CANVAS_SHORTCUT_LABELS } from "../utils/canvas-shortcuts";

import { canvasThemes, type CanvasBackgroundMode, type CanvasColorTheme, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";

type DockMenuKey = "add" | "assets" | "more" | "appearance";
type DockMenuItem = { key: string; label: string; icon?: ReactNode; onClick: () => void };

const DOCK_MENU_WIDTH = 208;
const APPEARANCE_WIDTH = 264;

export function CanvasToolbar({
    selectedCount,
    canvasTool,
    canUndo,
    canRedo,
    backgroundMode,
    showImageInfo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddPanorama,
    onAddDirector,
    onAddConfig,
    onUndo,
    onRedo,
    onUpload,
    onDuplicate,
    onDelete,
    onCanvasToolChange,
    onBackgroundModeChange,
    onShowImageInfoChange,
    onOpenAssetLibrary,
    onOpenMyAssets,
    sidePanelWidth,
}: {
    selectedCount: number;
    canvasTool: "select" | "pan";
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddPanorama: () => void;
    onAddDirector: () => void;
    onAddConfig: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onCanvasToolChange: (tool: "select" | "pan") => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onOpenAssetLibrary: () => void;
    onOpenMyAssets: () => void;
    sidePanelWidth: number;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const wheelMode = useCanvasUiStore((state) => state.wheelMode);
    const setWheelMode = useCanvasUiStore((state) => state.setWheelMode);
    const [openMenu, setOpenMenu] = useState<DockMenuKey | null>(null);
    const [menuLeft, setMenuLeft] = useState(0);
    const dockRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: `inset 0 1px 0 ${colorTheme === "dark" ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.55)"}, ${colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)"}` };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const addItems: DockMenuItem[] = [
        { key: "text", label: "文本", icon: <Type className="size-4" />, onClick: onAddText },
        { key: "image", label: "图片", icon: <ImageIcon className="size-4" />, onClick: onAddImage },
        { key: "video", label: "视频", icon: <Video className="size-4" />, onClick: onAddVideo },
        { key: "audio", label: "音频", icon: <Music2 className="size-4" />, onClick: onAddAudio },
        { key: "upload", label: "上传素材", icon: <Upload className="size-4" />, onClick: onUpload },
    ];
    const assetItems: DockMenuItem[] = [
        { key: "library", label: "素材库", icon: <Library className="size-4" />, onClick: onOpenAssetLibrary },
        { key: "assets", label: "我的素材", icon: <FolderOpen className="size-4" />, onClick: onOpenMyAssets },
    ];
    const moreItems: DockMenuItem[] = [
        { key: "panorama", label: "全景图", icon: <Globe2 className="size-4" />, onClick: onAddPanorama },
        { key: "director", label: "导演台", icon: <Layers3 className="size-4" />, onClick: onAddDirector },
        { key: "config", label: "生成配置", icon: <Settings2 className="size-4" />, onClick: onAddConfig },
    ];
    const menuWidth = openMenu === "appearance" ? APPEARANCE_WIDTH : DOCK_MENU_WIDTH;
    const shortcutTitle = (label: string, shortcut: string) => <span className="flex min-w-32 items-center justify-between gap-5"><span>{label}</span><kbd className="text-[11px] opacity-60">{shortcut}</kbd></span>;

    const toggleMenu = (menu: DockMenuKey, event: React.MouseEvent<HTMLElement>) => {
        if (openMenu === menu) {
            setOpenMenu(null);
            return;
        }
        const dockRect = dockRef.current?.getBoundingClientRect();
        const triggerRect = event.currentTarget.getBoundingClientRect();
        const width = menu === "appearance" ? APPEARANCE_WIDTH : DOCK_MENU_WIDTH;
        if (dockRect) {
            const center = triggerRect.left - dockRect.left + triggerRect.width / 2;
            setMenuLeft(Math.max(8, Math.min(center - width / 2, dockRect.width - width - 8)));
        }
        triggerRef.current = event.currentTarget;
        setOpenMenu(menu);
    };
    const runItem = (item: DockMenuItem) => {
        setOpenMenu(null);
        item.onClick();
    };

    useEffect(() => {
        if (!openMenu) return;
        panelRef.current?.querySelector<HTMLElement>("[data-dock-item]")?.focus({ preventScroll: true });

        const closeOnPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest("[data-canvas-dock-panel],[data-canvas-dock-trigger]")) return;
            setOpenMenu(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setOpenMenu(null);
            triggerRef.current?.focus({ preventScroll: true });
        };

        document.addEventListener("pointerdown", closeOnPointerDown, true);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnPointerDown, true);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [openMenu]);

    const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-dock-item]"));
        if (!items.length) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const offset = event.key === "ArrowDown" ? 1 : -1;
            items[(index + offset + items.length) % items.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        }
    };

    return (
        <div data-canvas-no-zoom data-canvas-toolbar className="pointer-events-none absolute inset-x-2 z-50 flex justify-center md:left-[var(--canvas-toolbar-left)]" style={{ "--canvas-toolbar-left": `${sidePanelWidth + 16}px`, bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" } as CSSProperties}>
            <div ref={dockRef} className="pointer-events-auto relative flex h-14 max-w-full items-center gap-1 rounded-xl border px-1.5 shadow-lg backdrop-blur sm:px-2" style={dockStyle}>
                <Tooltip title={shortcutTitle("选择", CANVAS_SHORTCUT_LABELS.select)} placement="top"><Button type="text" aria-label="选择" aria-pressed={canvasTool === "select"} className="!size-10 !min-w-10 !p-0" style={canvasTool === "select" ? activeStyle : { color: theme.toolbar.item }} icon={<MousePointer2 className="size-4.5" />} onClick={() => onCanvasToolChange("select")} /></Tooltip>
                <Tooltip title={shortcutTitle("移动画布", CANVAS_SHORTCUT_LABELS.pan)} placement="top"><Button type="text" aria-label="移动画布" aria-pressed={canvasTool === "pan"} className="!size-10 !min-w-10 !p-0" style={canvasTool === "pan" ? activeStyle : { color: theme.toolbar.item }} icon={<Hand className="size-4.5" />} onClick={() => onCanvasToolChange("pan")} /></Tooltip>
                <Divider theme={theme} />
                <Tooltip title={shortcutTitle("撤销", CANVAS_SHORTCUT_LABELS.undo)} placement="top"><Button type="text" aria-label="撤销" disabled={!canUndo} className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<Undo2 className="size-4.5" />} onClick={onUndo} /></Tooltip>
                <Tooltip title={shortcutTitle("重做", CANVAS_SHORTCUT_LABELS.redo)} placement="top"><Button type="text" aria-label="重做" disabled={!canRedo} className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<Redo2 className="size-4.5" />} onClick={onRedo} /></Tooltip>
                <Divider theme={theme} />
                <Tooltip title="添加图片" placement="top"><Button type="text" aria-label="添加图片" className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<ImageIcon className="size-4.5" />} onClick={onAddImage} /></Tooltip>
                <Button data-canvas-dock-trigger type="text" aria-label="其他添加工具" aria-haspopup="menu" aria-expanded={openMenu === "add"} className="!h-10 !min-w-10 !px-2" style={openMenu === "add" ? activeStyle : { color: theme.toolbar.item }} icon={<Ellipsis className="size-4" />} onClick={(event) => toggleMenu("add", event)}>添加</Button>
                <Button data-canvas-dock-trigger type="text" aria-label="素材" aria-haspopup="menu" aria-expanded={openMenu === "assets"} className="!h-10 !min-w-10 !px-2" style={openMenu === "assets" ? activeStyle : { color: theme.toolbar.item }} onClick={(event) => toggleMenu("assets", event)}>素材</Button>
                <Button data-canvas-dock-trigger type="text" aria-label="更多工具" aria-haspopup="menu" aria-expanded={openMenu === "more"} className="!h-10 !min-w-10 !px-2" style={openMenu === "more" ? activeStyle : { color: theme.toolbar.item }} icon={<Ellipsis className="size-4" />} onClick={(event) => toggleMenu("more", event)}>更多</Button>
                <Button data-canvas-dock-trigger type="text" aria-label="画布外观" aria-haspopup="dialog" aria-expanded={openMenu === "appearance"} className="!size-10 !min-w-10 !p-0" style={openMenu === "appearance" ? activeStyle : { color: theme.toolbar.item }} icon={<Palette className="size-4.5" />} onClick={(event) => toggleMenu("appearance", event)} />
                {selectedCount > 0 ? <>
                    <Divider theme={theme} />
                    <span className="hidden px-1 text-xs tabular-nums opacity-70 sm:inline">{selectedCount} 项</span>
                    <Tooltip title={shortcutTitle("复制副本", CANVAS_SHORTCUT_LABELS.duplicate)} placement="top"><Button type="text" aria-label="复制副本" className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<Copy className="size-4.5" />} onClick={onDuplicate} /></Tooltip>
                    <Tooltip title={shortcutTitle("删除选中", CANVAS_SHORTCUT_LABELS.delete)} placement="top"><Button type="text" danger aria-label="删除选中" className="!size-10 !min-w-10 !p-0" icon={<Trash2 className="size-4.5" />} onClick={onDelete} /></Tooltip>
                </> : null}

                {openMenu ? (
                    <div
                        ref={panelRef}
                        data-canvas-dock-panel
                        role="menu"
                        aria-label={openMenu === "appearance" ? "画布外观" : "工具菜单"}
                        className="absolute bottom-[calc(100%+12px)] z-10 rounded-2xl border p-1.5 text-sm shadow-2xl"
                        style={{ left: menuLeft, width: menuWidth, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, backdropFilter: "blur(14px)", ["--dock-hover" as string]: theme.toolbar.itemHover } as CSSProperties}
                        onKeyDown={handlePanelKeyDown}
                    >
                        {openMenu === "appearance" ? (
                            <div className="px-1.5 pb-1.5 pt-1">
                                <div className="pb-2 text-sm font-medium opacity-65">画布外观</div>
                                <div className="pb-1.5 text-[11px] font-medium opacity-50">主题模式</div>
                                <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                                    <CanvasThemeButton colorTheme={colorTheme} targetTheme="light" onThemeChange={setTheme}><Sun className="size-4" />浅色</CanvasThemeButton>
                                    <CanvasThemeButton colorTheme={colorTheme} targetTheme="dark" onThemeChange={setTheme}><Moon className="size-4" />深色</CanvasThemeButton>
                                </div>
                                <div className="mt-3 pb-1.5 text-[11px] font-medium opacity-50">网格样式</div>
                                <Segmented className="w-full !p-1 [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!min-h-8 [&_.ant-segmented-item]:!flex-1 [&_.ant-segmented-item-label]:!min-h-8 [&_.ant-segmented-item-label]:!leading-8" value={backgroundMode} onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)} options={[
                                    { value: "dots", label: <span className="inline-flex items-center gap-1.5"><CircleDot className="size-4" />点</span> },
                                    { value: "lines", label: <span className="inline-flex items-center gap-1.5"><Grid2x2 className="size-4" />线</span> },
                                    { value: "blank", label: <span className="inline-flex items-center gap-1.5"><Square className="size-4" />空白</span> },
                                ]} />
                                <div className="mt-3 pb-1.5 text-[11px] font-medium opacity-50">操作方式</div>
                                <Segmented<"zoom" | "pan"> block aria-label="画布操作方式" value={wheelMode} onChange={setWheelMode} options={[{ label: "鼠标", value: "zoom" }, { label: "触控板", value: "pan" }]} />
                                <p className="mt-2 text-[11px] leading-relaxed opacity-65">鼠标：滚轮缩放；触控板：双指平移。按住 Ctrl / ⌘ 滚动可缩放。</p>
                                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1 py-1"><span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65"><Info className="size-3.5" />图片信息</span><Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} /></div>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                <div className="px-2.5 pb-1 pt-1 text-[11px] font-medium opacity-50">{openMenu === "add" ? "添加节点" : openMenu === "assets" ? "素材" : "更多工具"}</div>
                                {(openMenu === "add" ? addItems : openMenu === "assets" ? assetItems : moreItems).map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        role="menuitem"
                                        data-dock-item
                                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--dock-hover)] focus-visible:bg-[var(--dock-hover)] focus-visible:outline-none"
                                        onClick={() => runItem(item)}
                                    >
                                        <span className="grid size-4 shrink-0 place-items-center opacity-70">{item.icon}</span>
                                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function Divider({ theme }: { theme: CanvasTheme }) {
    return <div className="mx-0.5 h-6 w-px shrink-0" style={{ background: theme.toolbar.border }} />;
}

function CanvasThemeButton({ colorTheme, targetTheme, onThemeChange, children }: { colorTheme: CanvasColorTheme; targetTheme: CanvasColorTheme; onThemeChange: (theme: CanvasColorTheme) => void; children: ReactNode }) {
    const theme = canvasThemes[colorTheme];
    const active = colorTheme === targetTheme;
    const activeStyle = colorTheme === "light" ? { background: "#111111", color: "#ffffff" } : { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    return <AnimatedThemeToggler theme={colorTheme} targetTheme={targetTheme} onThemeChange={onThemeChange} className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition" style={active ? activeStyle : { color: theme.toolbar.item }} aria-label={`切换到${targetTheme === "dark" ? "深色" : "浅色"}主题`} title={`切换到${targetTheme === "dark" ? "深色" : "浅色"}主题`}>{children}</AnimatedThemeToggler>;
}
