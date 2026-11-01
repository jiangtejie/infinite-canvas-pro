import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Button, Dropdown, Popover, Segmented, Switch, Tooltip } from "antd";
import { CircleDot, Copy, Ellipsis, FolderOpen, Globe2, Grid2x2, Hand, Image as ImageIcon, Info, Layers3, Library, Moon, MousePointer2, Music2, Palette, Redo2, Settings2, Square, Sun, Trash2, Type, Undo2, Upload, Video } from "lucide-react";

import { CANVAS_SHORTCUT_LABELS } from "../utils/canvas-shortcuts";

import { canvasThemes, type CanvasBackgroundMode, type CanvasColorTheme, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";

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
    const [openMenu, setOpenMenu] = useState<"add" | "more" | "assets" | null>(null);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const closeMenus = () => setOpenMenu(null);
    const addItems = [
        { key: "text", label: "文本", icon: <Type className="size-4" />, onClick: onAddText },
        { key: "image", label: "图片", icon: <ImageIcon className="size-4" />, onClick: onAddImage },
        { key: "video", label: "视频", icon: <Video className="size-4" />, onClick: onAddVideo },
        { key: "audio", label: "音频", icon: <Music2 className="size-4" />, onClick: onAddAudio },
        { key: "upload", label: "上传素材", icon: <Upload className="size-4" />, onClick: onUpload },
    ];
    const moreItems = [
        { key: "special-title", type: "group" as const, label: "特殊节点", children: [
            { key: "panorama", label: "全景图", icon: <Globe2 className="size-4" />, onClick: onAddPanorama },
            { key: "director", label: "导演台", icon: <Layers3 className="size-4" />, onClick: onAddDirector },
        ] },
        { key: "config", label: "生成配置", icon: <Settings2 className="size-4" />, onClick: onAddConfig },
    ];
    const handleMenuClick = ({ key }: { key: string }) => {
        const actions: Record<string, () => void> = {
            text: onAddText,
            image: onAddImage,
            video: onAddVideo,
            audio: onAddAudio,
            upload: onUpload,
            panorama: onAddPanorama,
            director: onAddDirector,
            config: onAddConfig,
            library: onOpenAssetLibrary,
            assets: onOpenMyAssets,
        };
        setOpenMenu(null);
        actions[key]?.();
    };
    const shortcutTitle = (label: string, shortcut: string) => <span className="flex min-w-32 items-center justify-between gap-5"><span>{label}</span><kbd className="text-[11px] opacity-60">{shortcut}</kbd></span>;

    return (
        <div data-canvas-no-zoom data-canvas-toolbar className="pointer-events-none absolute inset-x-2 z-50 flex justify-center md:left-[var(--canvas-toolbar-left)]" style={{ "--canvas-toolbar-left": `${sidePanelWidth + 16}px`, bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" } as CSSProperties}>
            <div className="pointer-events-auto flex h-14 max-w-full items-center gap-1 rounded-xl border px-1.5 shadow-lg backdrop-blur sm:px-2" style={dockStyle}>
                <Tooltip title={shortcutTitle("选择", CANVAS_SHORTCUT_LABELS.select)} placement="top"><Button type="text" aria-label="选择" aria-pressed={canvasTool === "select"} className="!size-10 !min-w-10 !p-0" style={canvasTool === "select" ? activeStyle : { color: theme.toolbar.item }} icon={<MousePointer2 className="size-4.5" />} onClick={() => onCanvasToolChange("select")} /></Tooltip>
                <Tooltip title={shortcutTitle("移动画布", CANVAS_SHORTCUT_LABELS.pan)} placement="top"><Button type="text" aria-label="移动画布" aria-pressed={canvasTool === "pan"} className="!size-10 !min-w-10 !p-0" style={canvasTool === "pan" ? activeStyle : { color: theme.toolbar.item }} icon={<Hand className="size-4.5" />} onClick={() => onCanvasToolChange("pan")} /></Tooltip>
                <Divider theme={theme} />
                <Tooltip title={shortcutTitle("撤销", CANVAS_SHORTCUT_LABELS.undo)} placement="top"><Button type="text" aria-label="撤销" disabled={!canUndo} className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<Undo2 className="size-4.5" />} onClick={onUndo} /></Tooltip>
                <Tooltip title={shortcutTitle("重做", CANVAS_SHORTCUT_LABELS.redo)} placement="top"><Button type="text" aria-label="重做" disabled={!canRedo} className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<Redo2 className="size-4.5" />} onClick={onRedo} /></Tooltip>
                <Divider theme={theme} />
                <Tooltip title="添加图片" placement="top"><Button type="text" aria-label="添加图片" className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<ImageIcon className="size-4.5" />} onClick={onAddImage} /></Tooltip>
                <Dropdown trigger={["click"]} placement="top" open={openMenu === "add"} onOpenChange={(open) => setOpenMenu(open ? "add" : null)} menu={{ style: { background: theme.toolbar.panel, color: theme.toolbar.item }, items: addItems, onClick: handleMenuClick }}>
                    <Button type="text" aria-label="其他添加工具" aria-haspopup="menu" aria-expanded={openMenu === "add"} className="!h-10 !min-w-10 !px-2" style={openMenu === "add" ? activeStyle : { color: theme.toolbar.item }} icon={<Ellipsis className="size-4" />}>添加</Button>
                </Dropdown>
                <Dropdown trigger={["click"]} placement="top" open={openMenu === "assets"} onOpenChange={(open) => setOpenMenu(open ? "assets" : null)} menu={{ style: { background: theme.toolbar.panel, color: theme.toolbar.item }, items: [
                    { key: "library", label: "素材库", icon: <Library className="size-4" /> },
                    { key: "assets", label: "我的素材", icon: <FolderOpen className="size-4" /> },
                ], onClick: handleMenuClick }}>
                    <Button type="text" aria-label="素材" aria-haspopup="menu" aria-expanded={openMenu === "assets"} className="!h-10 !min-w-10 !px-2" style={openMenu === "assets" ? activeStyle : { color: theme.toolbar.item }}>素材</Button>
                </Dropdown>
                <Dropdown trigger={["click"]} placement="top" open={openMenu === "more"} onOpenChange={(open) => setOpenMenu(open ? "more" : null)} menu={{ style: { background: theme.toolbar.panel, color: theme.toolbar.item }, items: moreItems, onClick: handleMenuClick }}>
                    <Button type="text" aria-label="更多工具" aria-haspopup="menu" aria-expanded={openMenu === "more"} className="!h-10 !min-w-10 !px-2" style={openMenu === "more" ? activeStyle : { color: theme.toolbar.item }} icon={<Ellipsis className="size-4" />}>更多</Button>
                </Dropdown>
                <Popover trigger="click" placement="top" open={appearanceOpen} onOpenChange={(open) => { setAppearanceOpen(open); if (open) closeMenus(); }} content={
                    <div className="w-[248px]" style={{ color: theme.toolbar.item }}>
                        <div className="px-1 pb-2 text-sm font-medium opacity-65">画布外观</div>
                        <div className="px-1 pb-1.5 text-[11px] font-medium opacity-50">主题模式</div>
                        <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                            <CanvasThemeButton colorTheme={colorTheme} targetTheme="light" onThemeChange={setTheme}><Sun className="size-4" />浅色</CanvasThemeButton>
                            <CanvasThemeButton colorTheme={colorTheme} targetTheme="dark" onThemeChange={setTheme}><Moon className="size-4" />深色</CanvasThemeButton>
                        </div>
                        <div className="mt-3 px-1 pb-1.5 text-[11px] font-medium opacity-50">网格样式</div>
                        <Segmented className="w-full !p-1 [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!min-h-8 [&_.ant-segmented-item]:!flex-1 [&_.ant-segmented-item-label]:!min-h-8 [&_.ant-segmented-item-label]:!leading-8" value={backgroundMode} onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)} options={[
                            { value: "dots", label: <span className="inline-flex items-center gap-1.5"><CircleDot className="size-4" />点</span> },
                            { value: "lines", label: <span className="inline-flex items-center gap-1.5"><Grid2x2 className="size-4" />线</span> },
                            { value: "blank", label: <span className="inline-flex items-center gap-1.5"><Square className="size-4" />空白</span> },
                        ]} />
                        <div className="mt-3 px-1 pb-1.5 text-[11px] font-medium opacity-50">操作方式</div>
                        <Segmented<"zoom" | "pan"> block aria-label="画布操作方式" value={wheelMode} onChange={setWheelMode} options={[{ label: "鼠标", value: "zoom" }, { label: "触控板", value: "pan" }]} />
                        <p className="mt-2 px-1 text-[11px] leading-relaxed opacity-65">鼠标：滚轮缩放；触控板：双指平移。按住 Ctrl / ⌘ 滚动可缩放。</p>
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1"><span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65"><Info className="size-3.5" />图片信息</span><Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} /></div>
                    </div>
                }>
                    <Button type="text" aria-label="画布外观" aria-expanded={appearanceOpen} className="!size-10 !min-w-10 !p-0" style={appearanceOpen ? activeStyle : { color: theme.toolbar.item }} icon={<Palette className="size-4.5" />} />
                </Popover>
                {selectedCount > 0 ? <>
                    <Divider theme={theme} />
                    <span className="hidden px-1 text-xs tabular-nums opacity-70 sm:inline">{selectedCount} 项</span>
                    <Tooltip title={shortcutTitle("复制副本", CANVAS_SHORTCUT_LABELS.duplicate)} placement="top"><Button type="text" aria-label="复制副本" className="!size-10 !min-w-10 !p-0" style={{ color: theme.toolbar.item }} icon={<Copy className="size-4.5" />} onClick={onDuplicate} /></Tooltip>
                    <Tooltip title={shortcutTitle("删除选中", CANVAS_SHORTCUT_LABELS.delete)} placement="top"><Button type="text" danger aria-label="删除选中" className="!size-10 !min-w-10 !p-0" icon={<Trash2 className="size-4.5" />} onClick={onDelete} /></Tooltip>
                </> : null}
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
