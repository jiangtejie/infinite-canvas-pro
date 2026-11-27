import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "../types";
import { connectionAnchors } from "../[id]/lib/canvas-connections";
import { registerCanvasConnectionElement } from "../utils/canvas-live-drag";

export const ConnectionPath = memo(function ConnectionPath({
    connection,
    from,
    to,
    active,
    dimmed = false,
    flowing = false,
    onSelect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    dimmed?: boolean;
    flowing?: boolean;
    onSelect: (connectionId: string) => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>, connectionId: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    // 策划 → 文案/配图是编排结构边，和素材图 → 配图的数据输入边区分线型。
    const structural = from.metadata?.remixRole === "plan";
    // AI 建立的上下文关系待确认，虚线并加 AI 标识，接受后转为人工实线。
    const pendingAi = connection.kind === "context" && connection.data.source === "ai";
    const { startX, startY, endX, endY, pathD } = connectionAnchors(from, to);
    const groupRef = useRef<SVGGElement>(null);
    // 拖拽节点时直接改这些 path 的 d，避免整块连线层跟着重渲染。
    useEffect(() => {
        registerCanvasConnectionElement(connection.id, groupRef.current);
        return () => registerCanvasConnectionElement(connection.id, null);
    }, [connection.id]);

    return (
        <g ref={groupRef} opacity={dimmed ? 0.22 : 1} style={{ transition: "opacity 200ms ease" }}>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onPointerEnter={() => setHovered(true)}
                onPointerLeave={() => setHovered(false)}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect(connection.id);
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event, connection.id);
                }}
            />
            <path
                d={pathD}
                stroke={active ? theme.node.activeStroke : theme.node.muted}
                strokeWidth={structural ? (active ? 2.5 : hovered ? 2 : 1.6) : active ? 3 : hovered ? 2.6 : 2}
                strokeOpacity={structural ? (active ? 0.8 : hovered ? 0.78 : 0.55) : active ? 1 : hovered ? 1 : 0.82}
                strokeDasharray={pendingAi ? "5 4" : structural ? "6 5" : undefined}
                strokeLinecap={structural ? "round" : undefined}
                fill="none"
                style={{ filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : hovered ? `drop-shadow(0 0 5px ${theme.node.activeStroke}40)` : undefined, pointerEvents: "none" }}
            />
            {pendingAi ? <text data-anchor="mid" x={(startX + endX) / 2} y={(startY + endY) / 2 - 8} textAnchor="middle" fontSize="10" fill={theme.node.muted} style={{ pointerEvents: "none" }}>AI</text> : null}
            {active || flowing ? (
                <>
                    <circle data-anchor="start" cx={startX} cy={startY} r={3} fill={theme.node.activeStroke} opacity={0.9} style={{ filter: `drop-shadow(0 0 4px ${theme.node.activeStroke})`, pointerEvents: "none" }} />
                    <circle data-anchor="end" cx={endX} cy={endY} r={3} fill={theme.node.activeStroke} opacity={0.9} style={{ filter: `drop-shadow(0 0 4px ${theme.node.activeStroke})`, pointerEvents: "none" }} />
                </>
            ) : null}
            {flowing && !structural ? (
                <>
                    <path
                        d={pathD}
                        stroke={theme.node.activeStroke}
                        strokeWidth={active ? 7 : 6}
                        strokeOpacity={0.16}
                        fill="none"
                        style={{ filter: "blur(2px)", pointerEvents: "none" }}
                    />
                    <path
                        className="canvas-connection-flow"
                        d={pathD}
                        stroke={theme.node.activeStroke}
                        strokeWidth={active ? 2.8 : 2.4}
                        strokeOpacity={0.95}
                        strokeDasharray="4 20"
                        strokeLinecap="round"
                        fill="none"
                        style={{ filter: `drop-shadow(0 0 4px ${theme.node.activeStroke})`, pointerEvents: "none" }}
                    />
                </>
            ) : null}
        </g>
    );
});

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + distance * 0.5} ${snappedStartY}, ${snappedEndX - distance * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;

    return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
}
