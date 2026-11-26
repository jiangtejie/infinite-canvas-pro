"use client";

import { useMemo } from "react";

import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { canvasStatusColors } from "../../lib/canvas-palette";
import { buildFilmBoardRelations, FILM_LAYOUT } from "../lib/film-layout";

type BoardRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type BoardColumn = BoardRect & {
    id: string;
    label: string;
    shotCount: number;
    unassigned: boolean;
    time?: string;
    mood?: string;
};

function sceneMoodColor(mood: string) {
    if (/紧张|危险|压迫|冲突|惊/.test(mood)) return canvasStatusColors.error;
    if (/温|暖|甜|希望|柔和/.test(mood)) return canvasStatusColors.loading;
    if (/平静|安静|日常|舒缓/.test(mood)) return canvasStatusColors.success;
    return "rgba(148,163,184,.7)";
}

const CONTEXT_TYPES = new Set<CanvasNodeType>([
    CanvasNodeType.FilmScript,
    CanvasNodeType.FilmStyle,
    CanvasNodeType.FilmCharacter,
    CanvasNodeType.FilmLocation,
    CanvasNodeType.FilmProp,
]);

const COLUMN_PADDING = 24;
const COLUMN_HEADER = 72;

function sceneLabel(node: CanvasNodeData) {
    const meta = node.metadata?.filmScene;
    return [meta?.episodeTitle, meta?.name].filter(Boolean).join(" · ") || node.title || "未命名场次";
}

/** 场景列背景与上下文带：只读投影真实节点位置，不产生第二份节点数据。 */
function buildBoardLayout(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const scenes = nodes.filter((node) => node.type === CanvasNodeType.FilmScene);
    const shots = nodes.filter((node) => node.type === CanvasNodeType.FilmShot);
    const { ownerByShot: owner, beatsByShot } = buildFilmBoardRelations(nodes, connections);
    const shotsByScene = new Map<string, CanvasNodeData[]>();
    const looseShots: CanvasNodeData[] = [];
    shots.forEach((shot) => {
        const sceneId = owner.get(shot.id);
        if (sceneId) shotsByScene.set(sceneId, [...(shotsByScene.get(sceneId) || []), shot]);
        else looseShots.push(shot);
    });
    const bottomOf = (items: CanvasNodeData[]) => Math.max(0, ...items.map((item) => item.position.y + item.height), ...items.flatMap((item) => (beatsByShot.get(item.id) || []).map((beat) => beat.position.y + beat.height)));
    const columns: BoardColumn[] = scenes.map((scene) => {
        const sceneShots = shotsByScene.get(scene.id) || [];
        const top = scene.position.y - COLUMN_HEADER;
        const bottom = Math.max(scene.position.y + scene.height, bottomOf(sceneShots));
        return {
            id: scene.id,
            label: sceneLabel(scene),
            shotCount: sceneShots.length,
            unassigned: false,
            time: scene.metadata?.filmScene?.time,
            mood: scene.metadata?.filmScene?.mood,
            left: scene.position.x - COLUMN_PADDING,
            top,
            width: FILM_LAYOUT.columnWidth,
            height: bottom - top + COLUMN_PADDING,
        };
    }).sort((a, b) => a.left - b.left || a.top - b.top);
    if (looseShots.length) {
        const top = Math.min(...looseShots.map((shot) => shot.position.y)) - COLUMN_HEADER;
        columns.push({
            id: "unassigned",
            label: "未分场",
            shotCount: looseShots.length,
            unassigned: true,
            left: Math.min(...looseShots.map((shot) => shot.position.x)) - COLUMN_PADDING,
            top,
            width: FILM_LAYOUT.columnWidth,
            height: bottomOf(looseShots) - top + COLUMN_PADDING,
        });
    }

    const contexts = nodes.filter((node) => CONTEXT_TYPES.has(node.type));
    const band: (BoardRect & { count: number }) | null = contexts.length ? {
        count: contexts.length,
        left: Math.min(...contexts.map((node) => node.position.x)) - COLUMN_PADDING,
        top: Math.min(...contexts.map((node) => node.position.y)) - COLUMN_HEADER + 8,
        width: Math.max(...contexts.map((node) => node.position.x + node.width)) - Math.min(...contexts.map((node) => node.position.x)) + COLUMN_PADDING * 2,
        height: Math.max(...contexts.map((node) => node.position.y + node.height)) - Math.min(...contexts.map((node) => node.position.y)) + COLUMN_HEADER + COLUMN_PADDING,
    } : null;
    return { columns, band };
}

/** 场景列背景与上下文带：直接使用世界坐标，垫在连线与节点之下，不产生第二份节点数据。 */
export function FilmDirectorLayout({ nodes, connections }: { nodes: CanvasNodeData[]; connections: CanvasConnection[] }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { columns, band } = useMemo(() => buildBoardLayout(nodes, connections), [connections, nodes]);
    const rectStyle = (rect: BoardRect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    const labelStyle = (rect: BoardRect, offsetY = 10) => ({
        left: rect.left + 14,
        top: rect.top + offsetY,
        color: theme.node.muted,
    });
    return (
        <div aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 0 }}>
            {band ? (
                <div className="absolute rounded-[22px]" style={{ ...rectStyle(band), background: theme.toolbar.itemHover, opacity: 0.08 }} />
            ) : null}
            {columns.map((column) => (
                <div key={column.id} className="absolute rounded-[22px]" style={{ ...rectStyle(column), background: theme.toolbar.itemHover, opacity: column.unassigned ? 0.06 : 0.12 }} />
            ))}
            {band ? (
                <div className="absolute rounded-[22px] border border-dashed" style={{ ...rectStyle(band), borderColor: theme.node.stroke, opacity: 0.5 }} />
            ) : null}
            {columns.map((column) => (
                <div key={`${column.id}-outline`} className="absolute rounded-[22px] border border-dashed" style={{ ...rectStyle(column), borderColor: theme.node.stroke, opacity: column.unassigned ? 0.35 : 0.5 }} />
            ))}
            {band ? (
                <div className="absolute flex items-center gap-2 whitespace-nowrap text-[11px] font-medium tracking-[0.14em]" style={labelStyle(band)}>
                    <span className="inline-block size-1.5 rounded-full" style={{ background: theme.node.faint }} />
                    上下文
                    <span className="font-mono tabular-nums opacity-60">{band.count}</span>
                </div>
            ) : null}
            {columns.map((column) => (
                <div key={`${column.id}-label`} className="absolute flex items-center gap-2 whitespace-nowrap text-[11px] font-medium tracking-[0.08em]" style={labelStyle(column)}>
                    <span className="inline-block size-1.5 rounded-full" style={{ background: column.unassigned ? theme.node.faint : theme.node.activeStroke }} />
                    {column.label}
                    {column.time ? <span className="text-[9px] font-normal opacity-60">{column.time}</span> : null}
                    {column.mood ? <span className="inline-block h-1 w-8 rounded-full" style={{ background: sceneMoodColor(column.mood) }} title={column.mood} /> : null}
                    <span className="font-mono tabular-nums opacity-60">{column.shotCount} 镜</span>
                </div>
            ))}
        </div>
    );
}
