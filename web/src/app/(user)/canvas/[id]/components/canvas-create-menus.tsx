"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BookOpen, Box, ChevronDown, Clapperboard, FileText, Globe2, ImageIcon, Images, Layers3, Link2, List, MapPin, Music2, Send, Settings2, Shirt, Upload, UserRound, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import type { FilmAssetKind } from "@/lib/film/types";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../../[id]/lib/canvas-layer";
import { CanvasNodeType, type PendingConnectionCreate, type Position } from "../../types";
import { useMenuNavigation } from "../../utils/use-menu-navigation";

export function ConnectionCreateMenu({ pending, onCreate, onClose }: { pending: PendingConnectionCreate; onCreate: (type: CanvasNodeType) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [offsetY, setOffsetY] = useState(0);
    const menuNavigation = useMenuNavigation({ open: true, onClose, panelRef: menuRef });

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
            className="thin-scrollbar absolute w-[300px] overflow-y-auto rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            role="menu"
            aria-label="引用节点生成"
            style={{ left: pending.position.x, top: pending.position.y, maxHeight: "calc(100dvh - 24px)", transform: offsetY ? `translateY(-${offsetY}px)` : undefined, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text, zIndex: CANVAS_Z.createMenu, "--canvas-menu-hover": theme.toolbar.itemHover } as CSSProperties}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={menuNavigation.handleKeyDown}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    引用该节点生成
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-[var(--canvas-menu-hover)] hover:opacity-100" onClick={onClose} aria-label="关闭">
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
                <ConnectionCreateOption theme={theme} icon={<Send className="size-5" />} title="发布" description="抖音图文扫码发布" onClick={() => onCreate(CanvasNodeType.Publish)} />
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

type MenuOption = {
    icon: React.ReactNode;
    title: string;
    description?: string;
    onClick: () => void;
};

function MenuSection({ theme, children }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; children: React.ReactNode }) {
    return (
        <div className="mb-2 mt-3 flex items-center justify-between px-1">
            <span className="text-sm font-medium" style={{ color: theme.node.muted }}>{children}</span>
        </div>
    );
}

export function NodeCreateMenu({
    position,
    onCreate,
    onUpload,
    onOpenAssetLibrary,
    onClose,
    filmMode,
    onCreateFilmAsset,
}: {
    position: Position;
    onCreate: (type: CanvasNodeType) => void;
    onUpload: () => void;
    onOpenAssetLibrary: () => void;
    onClose: () => void;
    filmMode?: boolean;
    onCreateFilmAsset?: (kind: FilmAssetKind) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [moreOpen, setMoreOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [offsetY, setOffsetY] = useState(0);
    const menuNavigation = useMenuNavigation({ open: true, onClose, panelRef: menuRef });
    const generalOptions: MenuOption[] = [
        { icon: <List className="size-5" />, title: "文本生成", description: "脚本、广告词、品牌文案", onClick: () => onCreate(CanvasNodeType.Text) },
        { icon: <ImageIcon className="size-5" />, title: "图片生成", onClick: () => onCreate(CanvasNodeType.Image) },
        { icon: <Video className="size-5" />, title: "视频生成", onClick: () => onCreate(CanvasNodeType.Video) },
        { icon: <Music2 className="size-5" />, title: "音频参考", onClick: () => onCreate(CanvasNodeType.Audio) },
        { icon: <Globe2 className="size-5" />, title: "全景图", description: "文生全景、图生全景", onClick: () => onCreate(CanvasNodeType.Panorama) },
        { icon: <Layers3 className="size-5" />, title: "3D 导演台", description: "3D场景、角色、机位", onClick: () => onCreate(CanvasNodeType.Director) },
        { icon: <Settings2 className="size-5" />, title: "配置节点", description: "模型、尺寸、数量和输入顺序", onClick: () => onCreate(CanvasNodeType.Config) },
        { icon: <Link2 className="size-5" />, title: "素材源", description: "抖音图文解析", onClick: () => onCreate(CanvasNodeType.Source) },
        { icon: <Send className="size-5" />, title: "发布", description: "抖音图文扫码发布", onClick: () => onCreate(CanvasNodeType.Publish) },
        { icon: <BookOpen className="size-5" />, title: "漫画册", description: "收集图片、翻书预览与导出", onClick: () => onCreate(CanvasNodeType.Comic) },
    ];
    const filmOptions: MenuOption[] = filmMode ? [
        { icon: <FileText className="size-5" />, title: "剧本", description: "剧本正文与拆镜入口", onClick: () => onCreate(CanvasNodeType.Script) },
        { icon: <Clapperboard className="size-5" />, title: "场次", description: "按集-场组织镜头", onClick: () => onCreate(CanvasNodeType.Scene) },
        { icon: <Video className="size-5" />, title: "镜头", description: "镜号、表演与画面", onClick: () => onCreate(CanvasNodeType.Shot) },
        { icon: <UserRound className="size-5" />, title: "角色资产", onClick: () => onCreateFilmAsset?.("character") },
        { icon: <MapPin className="size-5" />, title: "场景资产", onClick: () => onCreateFilmAsset?.("location") },
        { icon: <Box className="size-5" />, title: "道具资产", onClick: () => onCreateFilmAsset?.("prop") },
        { icon: <Shirt className="size-5" />, title: "服装资产", onClick: () => onCreateFilmAsset?.("costume") },
    ] : [];
    const resourceOptions: MenuOption[] = [
        { icon: <Upload className="size-5" />, title: "上传", description: "图片、视频或音频", onClick: onUpload },
        { icon: <Images className="size-5" />, title: "从素材库选择", description: "文本、图片或视频", onClick: onOpenAssetLibrary },
    ];

    useLayoutEffect(() => {
        setOffsetY(0);
    }, [moreOpen, position.x, position.y]);

    useLayoutEffect(() => {
        if (offsetY) return;
        const rect = menuRef.current?.getBoundingClientRect();
        if (!rect) return;
        const overflow = rect.bottom - (window.innerHeight - 88);
        if (overflow > 0) setOffsetY(overflow);
    }, [moreOpen, offsetY, position.x, position.y]);

    return (
        <div ref={menuRef} className="thin-scrollbar absolute w-[300px] overflow-y-auto rounded-[18px] border p-3 shadow-2xl backdrop-blur" data-canvas-no-zoom role="menu" aria-label="添加节点" style={{ left: position.x, top: position.y, maxHeight: "calc(100dvh - 24px)", transform: `scale(calc(var(--canvas-inverse-scale) * 0.9)) translateY(-${offsetY / 0.9}px)`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text, zIndex: CANVAS_Z.createMenu }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={menuNavigation.handleKeyDown}>
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>添加节点</span>
                <button type="button" className="grid size-7 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭">×</button>
            </div>
            <div className="grid gap-1">
                {filmMode ? (
                    <>
                        <MenuSection theme={theme}>影视</MenuSection>
                        {filmOptions.map((option) => <ConnectionCreateOption key={option.title} theme={theme} {...option} />)}
                        <MenuSection theme={theme}>添加资源</MenuSection>
                        {resourceOptions.map((option) => <ConnectionCreateOption key={option.title} theme={theme} {...option} />)}
                        <button
                            type="button"
                            role="menuitem"
                            aria-expanded={moreOpen}
                            className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors"
                            style={{ color: theme.node.muted }}
                            onClick={() => setMoreOpen((value) => !value)}
                            onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)}
                            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                        >
                            <span className="inline-flex items-center gap-2"><Layers3 className="size-4" />更多画布节点</span>
                            <ChevronDown className={`size-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                        </button>
                        {moreOpen ? <div className="mt-1 grid gap-1">{generalOptions.map((option) => <ConnectionCreateOption key={option.title} theme={theme} {...option} />)}</div> : null}
                    </>
                ) : (
                    <>
                        {generalOptions.map((option) => <ConnectionCreateOption key={option.title} theme={theme} {...option} />)}
                        <MenuSection theme={theme}>添加资源</MenuSection>
                        {resourceOptions.map((option) => <ConnectionCreateOption key={option.title} theme={theme} {...option} />)}
                    </>
                )}
            </div>
        </div>
    );
}
