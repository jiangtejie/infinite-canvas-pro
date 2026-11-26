"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { App } from "antd";
import { Box, ChevronDown, Clapperboard, FileText, Images, MapPin, Palette, Upload, UserRound, Video, Workflow, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_Z } from "../lib/canvas-layer";
import type { FilmNodeType } from "../lib/film-graph-types";
import { getFilmQuickConnectActions, isFilmNodeType, type FilmCommandResult, type FilmQuickConnectAction } from "../lib/film-node-registry";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "../../types";
import { useMenuNavigation } from "../../utils/use-menu-navigation";
import { ConnectionCreateOption, GENERAL_CANVAS_NODE_OPTIONS, MenuSection } from "./canvas-create-menus";

const FILM_ACTION_ICONS: Record<FilmNodeType, React.ReactNode> = {
    filmScript: <FileText className="size-5" />,
    filmScene: <Clapperboard className="size-5" />,
    filmShot: <Video className="size-5" />,
    filmCharacter: <UserRound className="size-5" />,
    filmLocation: <MapPin className="size-5" />,
    filmProp: <Box className="size-5" />,
    filmStyle: <Palette className="size-5" />,
    filmBeat: <Workflow className="size-5" />,
};

/**
 * 影视专用快速创建菜单：只展示当前源节点合法的影视动作；
 * 拖拽连线时隐藏通用节点（无法与影视节点连接），空白双击新建时收在“通用资源”；上传与素材库保留在“添加资源”。
 */
export function FilmQuickConnectMenu({
    position,
    sourceNode,
    allowGenericResources = false,
    nodes,
    connections,
    onApply,
    onCreate,
    onUpload,
    onOpenAssetLibrary,
    onClose,
}: {
    position: Position;
    sourceNode: CanvasNodeData | null;
    /** 连线拖拽菜单只能创建可连接的影视节点；通用节点仅用于空白双击的新建菜单。 */
    allowGenericResources?: boolean;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    onApply: (result: FilmCommandResult) => void;
    onCreate: (type: CanvasNodeType) => void;
    onUpload: () => void;
    onOpenAssetLibrary: () => void;
    onClose: () => void;
}) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [generalOpen, setGeneralOpen] = useState(false);
    const generalGroupId = useId();
    const menuRef = useRef<HTMLDivElement>(null);
    const [offsetY, setOffsetY] = useState(0);
    const menuNavigation = useMenuNavigation({ open: true, onClose, panelRef: menuRef });
    const actions = getFilmQuickConnectActions(sourceNode, nodes, connections);

    useLayoutEffect(() => {
        setOffsetY(0);
    }, [generalOpen, position.x, position.y]);

    useLayoutEffect(() => {
        if (offsetY) return;
        const rect = menuRef.current?.getBoundingClientRect();
        if (!rect) return;
        const overflow = rect.bottom - (window.innerHeight - 88);
        if (overflow > 0) setOffsetY(overflow);
    }, [generalOpen, offsetY, position.x, position.y]);

    const runAction = (item: FilmQuickConnectAction) => {
        const result = item.create(nodes, connections);
        if ("error" in result) {
            message.warning(result.error);
            return;
        }
        onApply(result);
        onClose();
    };

    const runResource = (open: () => void) => {
        open();
        onClose();
    };

    const runGeneric = (type: CanvasNodeType) => {
        onCreate(type);
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="thin-scrollbar absolute w-[300px] overflow-y-auto rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-canvas-no-zoom
            data-film-quick-connect-menu
            role="menu"
            aria-label={sourceNode ? "影视快捷创建" : "添加影视节点"}
            style={{ left: position.x, top: position.y, maxHeight: "calc(100dvh - 24px)", transform: `scale(calc(var(--canvas-inverse-scale) * 0.9)) translateY(-${offsetY / 0.9}px)`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text, zIndex: CANVAS_Z.createMenu } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={menuNavigation.handleKeyDown}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>{sourceNode ? "影视快捷创建" : "添加影视节点"}</span>
                <button type="button" className="grid size-7 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭"><X className="size-4" /></button>
            </div>
            <div className="grid gap-1">
                {actions.length ? (
                    <div role="group" aria-label="影视动作" className="grid gap-1">
                        {actions.map((item) => (
                            <ConnectionCreateOption key={item.id} theme={theme} icon={FILM_ACTION_ICONS[item.targetType]} title={item.label} description={item.description} onClick={() => runAction(item)} />
                        ))}
                    </div>
                ) : null}
                {!actions.length && sourceNode && isFilmNodeType(sourceNode.type) ? <p className="px-1 py-2 text-sm" style={{ color: theme.node.muted }}>当前节点没有可快速创建的影视动作</p> : null}

                <MenuSection theme={theme}>添加资源</MenuSection>
                <ConnectionCreateOption theme={theme} icon={<Upload className="size-5" />} title="上传" description="图片、视频或音频" onClick={() => runResource(onUpload)} />
                <ConnectionCreateOption theme={theme} icon={<Images className="size-5" />} title="从素材库选择" description="文本、图片或视频" onClick={() => runResource(onOpenAssetLibrary)} />

                {allowGenericResources ? (
                    <>
                        <button
                            type="button"
                            role="menuitem"
                            aria-expanded={generalOpen}
                            aria-controls={generalOpen ? generalGroupId : undefined}
                            className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors"
                            style={{ color: theme.node.muted }}
                            onClick={() => setGeneralOpen((value) => !value)}
                            onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)}
                            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                        >
                            <span className="inline-flex items-center gap-2">通用资源</span>
                            <ChevronDown className={`size-3.5 transition-transform ${generalOpen ? "rotate-180" : ""}`} />
                        </button>
                        {generalOpen ? (
                            <div id={generalGroupId} role="group" aria-label="通用资源" className="mt-1 grid gap-1">
                                {GENERAL_CANVAS_NODE_OPTIONS.map((option) => (
                                    <ConnectionCreateOption key={option.title} theme={theme} icon={option.icon} title={option.title} description={option.description} onClick={() => runGeneric(option.type)} />
                                ))}
                            </div>
                        ) : null}
                    </>
                ) : null}
            </div>
        </div>
    );
}
