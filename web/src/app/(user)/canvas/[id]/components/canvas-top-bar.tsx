"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "antd";
import { Bot, Eraser, Focus, Home, Images, Menu, PanelLeftClose, PanelLeftOpen, Plus, Redo2, RotateCcw, Trash2, Undo2, Upload } from "lucide-react";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { canvasThemes } from "@/lib/canvas-theme";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { useMenuNavigation } from "../../utils/use-menu-navigation";
import { CANVAS_Z } from "../../[id]/lib/canvas-layer";
import { useThemeStore } from "@/stores/use-theme-store";
import { useCanvasUiStore } from "../../stores/use-canvas-ui-store";
import { useCanvasStore } from "../../stores/use-canvas-store";
import { enterCanvasZen, exitCanvasZen } from "../../utils/canvas-zen";

export function CanvasTopBar({
    title,
    sidePanelOpen,
    onToggleSidePanel,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onClear,
    onImportImage,
    onUndo,
    onRedo,
    assistantCollapsed,
    onExpandAssistant,
}: {
    title: string;
    sidePanelOpen: boolean;
    onToggleSidePanel: () => void;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onClear: () => void;
    onImportImage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    assistantCollapsed: boolean;
    onExpandAssistant: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const wasTitleEditingRef = useRef(false);
    const accountRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const setShortcutsOpen = useCanvasUiStore((state) => state.setShortcutsOpen);
    const saveStatus = useCanvasStore((state) => state.saveStatus);
    const retrySave = useCanvasStore((state) => state.retrySave);
    const [menuOpen, setMenuOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const [zenIdle, setZenIdle] = useState(false);
    const shortcutsOpen = useCanvasUiStore((state) => state.shortcutsOpen);
    const zenMode = useCanvasUiStore((state) => state.zenMode);
    const wheelMode = useCanvasUiStore((state) => state.wheelMode);
    const [modifierKey, setModifierKey] = useState("Ctrl");

    useEffect(() => {
        setModifierKey(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
    }, []);

    useEffect(() => {
        if (wasTitleEditingRef.current && !isTitleEditing) titleRef.current?.querySelector("button")?.focus({ preventScroll: true });
        wasTitleEditingRef.current = isTitleEditing;
    }, [isTitleEditing]);

    useEffect(() => {
        if (saveStatus !== "saved") {
            setShowSaved(false);
            return;
        }
        setShowSaved(true);
        const timer = window.setTimeout(() => setShowSaved(false), 2000);
        return () => window.clearTimeout(timer);
    }, [saveStatus]);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    useEffect(() => {
        if (!accountOpen) return;
        const close = (event: PointerEvent) => {
            if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [accountOpen]);

    useEffect(() => {
        if (!zenMode) {
            setZenIdle(false);
            return;
        }
        // Zen 内闲置后隐藏退出按钮，鼠标/触摸一动立即浮现。
        let timer = window.setTimeout(() => setZenIdle(true), 2500);
        const wake = () => {
            setZenIdle(false);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setZenIdle(true), 2500);
        };
        window.addEventListener("pointermove", wake);
        window.addEventListener("pointerdown", wake);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("pointermove", wake);
            window.removeEventListener("pointerdown", wake);
        };
    }, [zenMode]);

    const menuNavigation = useMenuNavigation({ open: menuOpen, onClose: () => setMenuOpen(false), panelRef: menuRef, triggerRef: menuButtonRef, escapeScope: "document" });
    const runMenuAction = (action: () => void) => {
        setMenuOpen(false);
        action();
    };

    return (
        <>
            <div className="pointer-events-none absolute left-0 right-0 top-0 flex h-16 items-center justify-between px-4 max-sm:h-auto max-sm:flex-wrap max-sm:gap-y-1 max-sm:py-2" style={{ "--canvas-topbar-hover": theme.toolbar.itemHover, zIndex: CANVAS_Z.toolbar, visibility: zenMode ? "hidden" : "visible", opacity: zenMode ? 0 : 1, transition: "opacity 250ms ease" } as React.CSSProperties}>
                <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 max-sm:w-full">
                    <button type="button" onClick={onToggleSidePanel} className="grid size-7 place-items-center rounded-full transition hover:bg-[var(--canvas-topbar-hover)] [@media(pointer:coarse)]:size-10" style={{ color: theme.node.text }} aria-label={sidePanelOpen ? "收起左侧面板" : "展开左侧面板"}>
                        {sidePanelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                    </button>
                    <div className="relative">
                        <button
                            ref={menuButtonRef}
                            type="button"
                            data-canvas-topbar-menu
                            className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--canvas-topbar-hover)] [@media(pointer:coarse)]:size-10"
                            style={{ color: theme.node.text, background: menuOpen ? theme.toolbar.activeBg : undefined }}
                            aria-label="打开画布菜单"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((value) => !value)}
                        >
                            <Menu className="size-5" />
                        </button>
                        {menuOpen ? (
                            <div
                                ref={menuRef}
                                data-canvas-topbar-menu
                                role="menu"
                                aria-label="画布菜单"
                                className="absolute left-0 top-[calc(100%+8px)] w-60 rounded-2xl border p-1.5 shadow-2xl"
                                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, backdropFilter: "blur(14px)", zIndex: CANVAS_Z.menu, "--canvas-menu-hover": theme.toolbar.itemHover } as React.CSSProperties}
                                onKeyDown={menuNavigation.handleKeyDown}
                            >
                                <CanvasMenuItem icon={<Home className="size-4" />} label="主页" onClick={() => runMenuAction(onHome)} />
                                <CanvasMenuItem icon={<Images className="size-4" />} label="我的画布" onClick={() => runMenuAction(onProjects)} />
                                <CanvasMenuDivider theme={theme} />
                                <CanvasMenuItem icon={<Plus className="size-4" />} label="新建画布" onClick={() => runMenuAction(onCreateProject)} />
                                <CanvasMenuItem icon={<Eraser className="size-4" />} label="清空画布内容" danger onClick={() => runMenuAction(onClear)} />
                                <CanvasMenuDivider theme={theme} />
                                <CanvasMenuItem icon={<Trash2 className="size-4" />} label="删除当前画布" danger onClick={() => runMenuAction(onDeleteProject)} />
                                <CanvasMenuDivider theme={theme} />
                                <CanvasMenuItem icon={<Upload className="size-4" />} label="导入素材" onClick={() => runMenuAction(onImportImage)} />
                                <CanvasMenuDivider theme={theme} />
                                <CanvasMenuItem icon={<Undo2 className="size-4" />} label="撤销" shortcut={`${modifierKey} Z`} disabled={!canUndo} onClick={() => runMenuAction(onUndo)} />
                                <CanvasMenuItem icon={<Redo2 className="size-4" />} label="重做" shortcut={`${modifierKey} Shift Z / ${modifierKey} Y`} disabled={!canRedo} onClick={() => runMenuAction(onRedo)} />
                            </div>
                        ) : null}
                    </div>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                aria-label="画布名称"
                                onFocus={(event) => event.currentTarget.select()}
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    event.stopPropagation();
                                    if (event.nativeEvent.isComposing) return;
                                    if (event.key === "Enter") { event.preventDefault(); onFinishTitleEditing(); }
                                    if (event.key === "Escape") { event.preventDefault(); onCancelTitleEditing(); }
                                }}
                                className="min-w-0 max-w-[280px] bg-transparent p-0 text-left text-lg font-semibold tracking-normal outline-none max-sm:text-sm"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="min-w-0 max-w-[280px] truncate border-b border-dashed border-transparent text-left text-lg font-semibold tracking-normal transition hover:border-current max-sm:text-sm"
                                onClick={onStartTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "F2") { event.preventDefault(); onStartTitleEditing(); }
                                }}
                                aria-label={`重命名画布：${title}`}
                                title="点击修改画布名称；聚焦后也可按 Enter 或 F2"
                            >
                                {title}
                            </button>
                        )}
                    </div>
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 max-sm:ml-auto">
                    <div className="flex shrink-0 items-center justify-end sm:w-[88px]">
                        {saveStatus === "saving" ? (
                            <span className="hidden whitespace-nowrap px-1.5 text-xs sm:inline" style={{ color: theme.node.muted }}>保存中…</span>
                        ) : saveStatus === "saved" ? (
                            <span aria-hidden={!showSaved} className={`hidden whitespace-nowrap px-1.5 text-xs transition-opacity duration-500 sm:inline ${showSaved ? "opacity-100" : "opacity-0"}`} style={{ color: theme.node.muted }}>已保存</span>
                        ) : saveStatus === "error" ? (
                            <button type="button" onClick={retrySave} title="点击重试保存" aria-label="保存失败，点击重试" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-1 text-xs transition-colors hover:bg-[var(--canvas-topbar-hover)]" style={{ color: canvasStatusColors.error }}>
                                <RotateCcw className="size-3.5" />
                                保存失败
                            </button>
                        ) : null}
                    </div>
                    <UserStatusActions
                        variant="canvas"
                        accountOpen={accountOpen}
                        onAccountOpenChange={setAccountOpen}
                        accountRef={accountRef}
                        onOpenShortcuts={() => {
                            setShortcutsOpen(true);
                            setAccountOpen(false);
                        }}
                    />
                    <button
                        type="button"
                        onClick={enterCanvasZen}
                        className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--canvas-topbar-hover)] [@media(pointer:coarse)]:size-10"
                        style={{ color: theme.node.text }}
                        aria-label="进入沉浸模式"
                        title="沉浸模式 (Z)：全屏专注画布"
                    >
                        <Focus className="size-4" />
                    </button>
                    {assistantCollapsed ? (
                        <>
                            <span className="h-6 w-px" style={{ background: theme.toolbar.border }} />
                            <Button
                                type="text"
                                className="!h-9 !px-2 !font-medium"
                                style={{ color: theme.node.text }}
                                icon={<Bot className="size-4" />}
                                onClick={onExpandAssistant}
                            >
                                助手
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>
            {zenMode ? (
                <button
                    type="button"
                    onClick={exitCanvasZen}
                    className={`absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition duration-500 hover:bg-[var(--canvas-topbar-hover)] hover:opacity-100 ${zenIdle ? "opacity-0" : "opacity-40"}`}
                    style={{ color: theme.node.text, zIndex: CANVAS_Z.toolbar, "--canvas-topbar-hover": theme.toolbar.itemHover } as React.CSSProperties}
                    title="退出沉浸模式 (Esc)"
                >
                    <Focus className="size-3.5" />
                    退出沉浸
                </button>
            ) : null}
            <Modal title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["Space", "拖动"]} value="按住临时移动，松开恢复原工具" />
                    <Shortcut keys={[wheelMode === "pan" ? "双指滚动" : "滚轮"]} value={wheelMode === "pan" ? "平移画布" : "缩放画布"} />
                    <Shortcut keys={[modifierKey, "滚动"]} value="缩放画布；触控板也可直接捏合" />
                    <Shortcut keys={["Shift", "1 / 2 / 0"]} value="查看全部 / 聚焦选中 / 100%" />
                    <Shortcut keys={["拖动"]} value="使用当前工具操作画布" />
                    <Shortcut keys={[`Shift / ${modifierKey}`, "点击"]} value="追加选择节点" />
                    <Shortcut keys={["连接点"]} value="拖拽节点左右圆点连线；键盘选中节点后 Tab 到圆点按 Enter，Esc 取消" />
                    <Shortcut keys={[modifierKey, "G"]} value="创建组" />
                    <Shortcut keys={[modifierKey, "C / V"]} value="复制 / 粘贴节点，或粘贴剪切板文本/图片" />
                    <Shortcut keys={[modifierKey, "Z"]} value="撤销" />
                    <Shortcut keys={[modifierKey, "Shift", "Z"]} value="重做" />
                    <Shortcut keys={[modifierKey, "D"]} value="复制选中节点" />
                    <Shortcut keys={["V"]} value="选择工具" />
                    <Shortcut keys={["H"]} value="移动画布工具" />
                    <Shortcut keys={["Z"]} value="沉浸模式：全屏专注画布，Esc 或再按 Z 退出" />
                    <Shortcut keys={["Delete / Backspace"]} value="删除选中" />
                    <Shortcut keys={["Esc"]} value="取消选择并关闭浮层" />
                    <Shortcut keys={["拖入图片/视频/音频"]} value="上传到画布" />
                </div>
            </Modal>
        </>
    );
}

function CanvasMenuDivider({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return <div className="my-1 h-px" style={{ background: theme.toolbar.border }} />;
}

function CanvasMenuItem({ icon, label, shortcut, danger = false, disabled = false, onClick }: { icon?: React.ReactNode; label: string; shortcut?: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="menuitem"
            data-canvas-menu-item
            disabled={disabled}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors enabled:hover:bg-[var(--canvas-menu-hover)] focus-visible:bg-[var(--canvas-menu-hover)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: danger ? canvasStatusColors.error : undefined }}
            onClick={onClick}
        >
            <span className="grid size-4 shrink-0 place-items-center opacity-70">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {shortcut ? <kbd className="shrink-0 text-[11px] opacity-50">{shortcut}</kbd> : null}
        </button>
    );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none"
                            style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover, color: theme.node.text }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}
