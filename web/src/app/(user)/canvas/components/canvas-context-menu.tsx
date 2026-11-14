"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { BetweenHorizontalStart, Copy, GalleryHorizontal, GalleryHorizontalEnd, Pencil, Sparkles, Trash2 } from "lucide-react";

import { canvasStatusColors } from "@/app/(user)/canvas/lib/canvas-palette";
import { canvasThemes } from "@/lib/canvas-theme";
import { useFocusRestore } from "@/hooks/use-focus-restore";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../[id]/lib/canvas-layer";
import type { ContextMenuState } from "../types";
import type { VideoFramePosition } from "../utils/canvas-video-frame";
import { useMenuNavigation } from "../utils/use-menu-navigation";

export function CanvasNodeContextMenu({ menu, canCaptureVideoFrame, canGenerate, canEdit, generateLabel, onClose, onCaptureVideoFrame, onEdit, onGenerate, onDuplicate, onDelete }: { menu: ContextMenuState; canCaptureVideoFrame: boolean; canGenerate: boolean; canEdit: boolean; generateLabel: string; onClose: () => void; onCaptureVideoFrame: (position: VideoFramePosition) => void; onEdit: () => void; onGenerate: () => void; onDuplicate: () => void; onDelete: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);

    useFocusRestore();
    const menuNavigation = useMenuNavigation({ open: true, onClose, panelRef: menuRef, escapeScope: "panel", stopEscapePropagation: false, ignoreSelector: ".ant-popover" });

    return (
        <div
            ref={menuRef}
            role="menu"
            aria-label="节点操作"
            tabIndex={-1}
            className="fixed min-w-44 overflow-hidden rounded-2xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, zIndex: CANVAS_Z.contextMenu, "--canvas-menu-hover": theme.toolbar.itemHover } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={menuNavigation.handleKeyDown}
        >
            {canGenerate ? <MenuButton icon={<Sparkles className="size-4" />} label={generateLabel} onClick={onGenerate} /> : null}
            {canEdit ? <MenuButton icon={<Pencil className="size-4" />} label="编辑提示词" onClick={onEdit} /> : null}
            {canGenerate || canEdit ? <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} /> : null}
            {canCaptureVideoFrame ? (
                <>
                    <MenuButton icon={<BetweenHorizontalStart className="size-4" />} label="截取首帧" onClick={() => onCaptureVideoFrame("first")} />
                    <MenuButton icon={<GalleryHorizontalEnd className="size-4" />} label="截取尾帧" onClick={() => onCaptureVideoFrame("last")} />
                    <MenuButton icon={<GalleryHorizontal className="size-4" />} label="截取当前帧" onClick={() => onCaptureVideoFrame("current")} />
                    <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
                </>
            ) : null}
            {menu.type === "node" ? <MenuButton icon={<Copy className="size-4" />} label="复制" onClick={onDuplicate} /> : null}
            <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" role="menuitem" data-menu-item tabIndex={-1} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--canvas-menu-hover)] focus-visible:bg-[var(--canvas-menu-hover)]" style={{ color: danger ? canvasStatusColors.error : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}
