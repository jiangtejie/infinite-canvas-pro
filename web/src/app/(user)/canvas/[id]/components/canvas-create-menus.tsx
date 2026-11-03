"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Globe2, ImageIcon, Images, Layers3, List, Music2, Settings2, Upload, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type PendingConnectionCreate, type Position } from "../../types";

export function ConnectionCreateMenu({ pending, onCreate, onClose }: { pending: PendingConnectionCreate; onCreate: (type: CanvasNodeType) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [offsetY, setOffsetY] = useState(0);

    useEffect(() => {
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, []);

    useLayoutEffect(() => {
        setOffsetY(0);
    }, [pending.position.x, pending.position.y]);

    useLayoutEffect(() => {
        if (offsetY) return;
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const overflow = rect.bottom - (window.innerHeight - 88);
        if (overflow <= 0) return;
        const inverse = parseFloat(getComputedStyle(el).getPropertyValue("--canvas-inverse-scale")) || 1;
        setOffsetY(overflow * inverse);
    }, [offsetY, pending.position.x, pending.position.y]);

    return (
        <div
            ref={menuRef}
            className="thin-scrollbar absolute z-[120] w-[300px] overflow-y-auto rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            role="menu"
            aria-label="引用节点生成"
            style={{ left: pending.position.x, top: pending.position.y, maxHeight: "calc(100vh - 24px)", transform: offsetY ? `translateY(-${offsetY}px)` : undefined, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    onClose();
                }
            }}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    引用该节点生成
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭">
                    ×
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音频参考" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Globe2 className="size-5" />} title="全景图" description="文生全景、图生全景" onClick={() => onCreate(CanvasNodeType.Panorama)} />
                <ConnectionCreateOption theme={theme} icon={<Layers3 className="size-5" />} title="3D 导演台" description="3D场景、角色、机位" onClick={() => onCreate(CanvasNodeType.Director)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-5" />} title="配置节点" description="模型、尺寸、数量和输入顺序" onClick={() => onCreate(CanvasNodeType.Config)} />
            </div>
        </div>
    );
}

function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button type="button" role="menuitem" className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition" style={{ color: theme.node.text }} onClick={onClick} onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)} onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold leading-5">{title}</span>
                {description ? <span className="mt-1 block truncate text-sm" style={{ color: theme.node.muted }}>{description}</span> : null}
            </span>
        </button>
    );
}

export function NodeCreateMenu({
    position,
    onCreate,
    onUpload,
    onOpenAssetLibrary,
    onClose,
}: {
    position: Position;
    onCreate: (type: CanvasNodeType) => void;
    onUpload: () => void;
    onOpenAssetLibrary: () => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [offsetY, setOffsetY] = useState(0);

    useEffect(() => {
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, []);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [onClose]);

    useLayoutEffect(() => {
        setOffsetY(0);
    }, [position.x, position.y]);

    useLayoutEffect(() => {
        if (offsetY) return;
        const rect = menuRef.current?.getBoundingClientRect();
        if (!rect) return;
        const overflow = rect.bottom - (window.innerHeight - 88);
        if (overflow > 0) setOffsetY(overflow);
    }, [offsetY, position.x, position.y]);

    return (
        <div ref={menuRef} className="thin-scrollbar absolute z-[120] w-[300px] overflow-y-auto rounded-[18px] border p-3 shadow-2xl backdrop-blur" data-canvas-no-zoom role="menu" aria-label="添加节点" style={{ left: position.x, top: position.y, maxHeight: "calc(100vh - 24px)", transform: `scale(calc(var(--canvas-inverse-scale) * 0.9)) translateY(-${offsetY / 0.9}px)`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>添加节点</span>
                <button type="button" className="grid size-7 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭">×</button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音频参考" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Globe2 className="size-5" />} title="全景图" description="文生全景、图生全景" onClick={() => onCreate(CanvasNodeType.Panorama)} />
                <ConnectionCreateOption theme={theme} icon={<Layers3 className="size-5" />} title="3D 导演台" description="3D场景、角色、机位" onClick={() => onCreate(CanvasNodeType.Director)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-5" />} title="配置节点" description="模型、尺寸、数量和输入顺序" onClick={() => onCreate(CanvasNodeType.Config)} />
                <div className="mb-2 mt-3 flex items-center justify-between px-1">
                    <span className="text-sm font-medium" style={{ color: theme.node.muted }}>添加资源</span>
                </div>
                <ConnectionCreateOption theme={theme} icon={<Upload className="size-5" />} title="上传" description="图片、视频或音频" onClick={onUpload} />
                <ConnectionCreateOption theme={theme} icon={<Images className="size-5" />} title="从素材库选择" description="文本、图片或视频" onClick={onOpenAssetLibrary} />
            </div>
        </div>
    );
}
