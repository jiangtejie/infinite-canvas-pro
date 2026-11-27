"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { connectionAnchors, getConnectionTargetAnchor, normalizeConnection } from "../lib/canvas-connections";
import { indexCanvasNodes, isHiddenBatchChild } from "../lib/canvas-graph";
import { calculateCanvasAlignment, createCanvasAlignmentContext, type CanvasAlignmentContext, type CanvasAlignmentGuides } from "../../utils/canvas-alignment";
import { findContainingGroupId, findGroupDropTarget, snapNodesIntoGroup } from "../../utils/canvas-group";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, ContextMenuState, PendingConnectionCreate, Position, SelectionBox, ViewportTransform } from "../../types";
import { applyLiveDrag, clearLiveDrag } from "../../utils/canvas-live-drag";

const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type UseCanvasPointerOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    viewportRef: MutableRefObject<ViewportTransform>;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    selectMany: (ids: Iterable<string>) => void;
    clearSelection: () => void;
    setSelectedConnectionId: (id: string | null) => void;
    setContextMenu: (menu: ContextMenuState | null) => void;
    setHoveredNodeId: (id: string | null) => void;
    setToolbarNodeId: (id: string | null) => void;
    setAgentReferenceNodeClick: Dispatch<SetStateAction<{ nodeId: string | null; version: number }>>;
    historyPausedRef: MutableRefObject<boolean>;
    connectNodes: (current: ConnectionHandle, targetNodeId: string) => void;
    onNodeClicked: (nodeId: string) => void;
    notifyInfo: (text: string) => void;
    closeOverlay: () => void;
    closeNodeCreateMenu: () => void;
};

/**
 * 画布指针交互：框选、节点拖拽（含多选/分组/批量子节点）、对齐吸附、连线拖拽与触屏支持。
 * 画布平移/缩放由 InfiniteCanvas 负责，这里只处理指针落在节点/空白画布上的交互。
 */
export function useCanvasPointer({
    nodesRef,
    connectionsRef,
    selectedNodeIdsRef,
    setNodes,
    viewportRef,
    screenToCanvas,
    selectMany,
    clearSelection,
    setSelectedConnectionId,
    setContextMenu,
    setHoveredNodeId,
    setToolbarNodeId,
    setAgentReferenceNodeClick,
    historyPausedRef,
    connectNodes,
    onNodeClicked,
    notifyInfo,
    closeOverlay,
    closeNodeCreateMenu,
}: UseCanvasPointerOptions) {
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
    const [alignmentGuides, setAlignmentGuides] = useState<CanvasAlignmentGuides>({});

    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const selectionBoxRef = useRef(selectionBox);
    const rafRef = useRef<number | null>(null);
    const nodeDraggingRef = useRef(false);
    const activePointerIdRef = useRef<number | null>(null);
    const alignmentContextRef = useRef<CanvasAlignmentContext | null>(null);
    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        initialSelectedNodes: { id: string; x: number; y: number }[];
        clickedGroupId: string | null;
    }>({
        isDraggingNode: false,
        hasMoved: false,
        clickedGroupId: null,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [],
    });

    /** 拖拽帧只算「节点新位置 + 受影响连线的 d」，交给 live-drag 直接写 DOM，不触发 React 渲染。 */
    const buildDragFrame = useCallback((positions: Map<string, Position>) => {
        const paths = new Map<string, ReturnType<typeof connectionAnchors>>();
        const needed = new Set<string>();
        const touching: CanvasConnection[] = [];
        for (const connection of connectionsRef.current) {
            if (!positions.has(connection.fromNodeId) && !positions.has(connection.toNodeId)) continue;
            touching.push(connection);
            needed.add(connection.fromNodeId);
            needed.add(connection.toNodeId);
        }
        if (!touching.length) return { positions, paths };
        const touchedNodes = new Map<string, CanvasNodeData>();
        for (const node of nodesRef.current) {
            if (needed.has(node.id)) touchedNodes.set(node.id, node);
        }
        for (const connection of touching) {
            const from = touchedNodes.get(connection.fromNodeId);
            const to = touchedNodes.get(connection.toNodeId);
            if (!from || !to) continue;
            paths.set(connection.id, connectionAnchors(
                { position: positions.get(from.id) ?? from.position, width: from.width, height: from.height },
                { position: positions.get(to.id) ?? to.position, width: to.width, height: to.height },
            ));
        }
        return { positions, paths };
    }, [connectionsRef, nodesRef]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const cancelSelectionBox = useCallback(() => {
        setSelectionBox(null);
        selectionBoxRef.current = null;
    }, []);

    const cancelPointerInteraction = useCallback(() => {
        activePointerIdRef.current = null;
        cancelSelectionBox();
        cancelPendingConnectionCreate();
    }, [cancelPendingConnectionCreate, cancelSelectionBox]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            const nodeById = indexCanvasNodes(nodesRef.current);
            [...nodesRef.current]
                .filter((node) => !isHiddenBatchChild(node, nodeById))
                .reverse()
                .forEach((node) => {
                    const anchor = getConnectionTargetAnchor(node, current);
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType)) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [nodesRef, screenToCanvas, viewportRef],
    );

    const handleCanvasPointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            setContextMenu(null);
            closeNodeCreateMenu();
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            closeOverlay();
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;
            setAgentReferenceNodeClick((current) => ({ ...current, nodeId: null }));

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                clearSelection();
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, clearSelection, closeNodeCreateMenu, closeOverlay, screenToCanvas, selectedNodeIdsRef, setAgentReferenceNodeClick, setContextMenu, setHoveredNodeId, setSelectedConnectionId, setToolbarNodeId],
    );

    const handleNodePointerDown = useCallback(
        (event: React.PointerEvent, nodeId: string) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            if (event.pointerType !== "mouse" && !event.isPrimary) return;
            event.stopPropagation();
            if (event.button === 0) setAgentReferenceNodeClick((current) => ({ nodeId, version: current.version + 1 }));
            setContextMenu(null);
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setSelectedConnectionId(null);
            if (nodesRef.current.find((node) => node.id === nodeId)?.type === "group") closeOverlay();

            const currentSelected = selectedNodeIdsRef.current;
            const currentNodes = nodesRef.current;
            const nextSelected = new Set(currentSelected);

            if (event.shiftKey || event.metaKey || event.ctrlKey) {
                if (nextSelected.has(nodeId)) {
                    nextSelected.delete(nodeId);
                } else {
                    nextSelected.add(nodeId);
                }
            } else if (!nextSelected.has(nodeId)) {
                nextSelected.clear();
                nextSelected.add(nodeId);
            }

            selectMany(nextSelected);
            setToolbarNodeId(nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null);
            const dragIds = new Set(nextSelected);
            currentNodes.forEach((node) => {
                if (!nextSelected.has(node.id)) return;
                node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
                if (node.type === "group") {
                    currentNodes.forEach((child) => {
                        if (child.metadata?.groupId === node.id) dragIds.add(child.id);
                    });
                }
            });
            dragRef.current = {
                isDraggingNode: true,
                hasMoved: false,
                clickedGroupId: currentNodes.find((node) => node.id === nodeId)?.type === "group" ? nodeId : null,
                startX: event.clientX,
                startY: event.clientY,
                initialSelectedNodes: currentNodes.filter((node) => dragIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
            };
            activePointerIdRef.current = event.pointerId;
            const nodeById = indexCanvasNodes(currentNodes);
            alignmentContextRef.current = createCanvasAlignmentContext(
                currentNodes.filter((node) => !isHiddenBatchChild(node, nodeById)),
                dragIds,
            );
            historyPausedRef.current = true;
            nodeDraggingRef.current = true;
            setIsNodeDragging(true);
            setAlignmentGuides({});
        },
        [closeOverlay, historyPausedRef, nodesRef, selectedNodeIdsRef, selectMany, setAgentReferenceNodeClick, setContextMenu, setHoveredNodeId, setSelectedConnectionId, setToolbarNodeId],
    );

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        activePointerIdRef.current = null;
        if (!dragRef.current.isDraggingNode) {
            setDropTargetGroupId(null);
            return;
        }

        const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
        const clickedNodeId = dragRef.current.clickedGroupId || dragRef.current.initialSelectedNodes[0]?.id;
        const currentViewport = viewportRef.current;
        const rawOffset = {
            x: clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k,
            y: clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k,
        };
        const { x: dx, y: dy } = calculateCanvasAlignment(
            alignmentContextRef.current,
            rawOffset,
            7 / currentViewport.k,
        ).offset;
        const initialPositions = dragRef.current.initialSelectedNodes;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            const movedIds = new Set(initialPositions.map((item) => item.id));
            clearLiveDrag();
            setNodes((prev) => {
                const moved = prev.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                const targetGroup = findGroupDropTarget(movedIds, moved);
                if (targetGroup) return snapNodesIntoGroup(movedIds, moved, targetGroup);
                return moved.map((node) => {
                    if (!movedIds.has(node.id) || node.type === "group") return node;
                    const groupId = findContainingGroupId(node, moved);
                    return node.metadata?.groupId === groupId ? node : { ...node, metadata: { ...node.metadata, groupId } };
                });
            });
        }

        if (dragRef.current.hasMoved && (clientX == null || clientY == null)) {
            // 拖拽被中断（失焦/指针取消）：把 DOM 还原到提交前的位置。
            const originals = new Map(initialPositions.map((item) => [item.id, { x: item.x, y: item.y }]));
            const frame = buildDragFrame(originals);
            applyLiveDrag(frame.positions, frame.paths);
            clearLiveDrag();
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.clickedGroupId = null;
        dragRef.current.initialSelectedNodes = [];
        alignmentContextRef.current = null;
        setDropTargetGroupId(null);
        setAlignmentGuides({});
        if (wasClick && clickedNodeId) onNodeClicked(clickedNodeId);
    }, [buildDragFrame, historyPausedRef, nodeDraggingRef, onNodeClicked, setNodes, viewportRef]);

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            if (activePointerIdRef.current != null && event.pointerId !== activePointerIdRef.current) return;
            const currentViewport = viewportRef.current;

            if (dragRef.current.isDraggingNode) {
                const rawOffset = {
                    x: (event.clientX - dragRef.current.startX) / currentViewport.k,
                    y: (event.clientY - dragRef.current.startY) / currentViewport.k,
                };
                const initialPositions = dragRef.current.initialSelectedNodes;
                if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
                    dragRef.current.hasMoved = true;
                }

                const aligned = calculateCanvasAlignment(
                    alignmentContextRef.current,
                    rawOffset,
                    7 / currentViewport.k,
                );
                const { x: dx, y: dy } = aligned.offset;
                const nextGuides = dragRef.current.hasMoved ? aligned.guides : {};
                const movedIds = new Set(initialPositions.map((item) => item.id));
                const positions = new Map<string, Position>();
                initialPositions.forEach((item) => positions.set(item.id, { x: item.x + dx, y: item.y + dy }));
                const previewNodes = nodesRef.current.map((node) => {
                    const point = positions.get(node.id);
                    return point ? { ...node, position: point } : node;
                });
                setDropTargetGroupId(findGroupDropTarget(movedIds, previewNodes)?.id || null);

                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    setAlignmentGuides((current) =>
                        current.vertical === nextGuides.vertical && current.horizontal === nextGuides.horizontal
                            ? current
                            : nextGuides,
                    );
                    const frame = buildDragFrame(positions);
                    applyLiveDrag(frame.positions, frame.paths);
                    rafRef.current = null;
                });
                return;
            }

            const currentSelection = selectionBoxRef.current;
            if (currentSelection) {
                if (event.buttons === 0) {
                    selectionBoxRef.current = null;
                    setSelectionBox(null);
                    return;
                }

                const world = screenToCanvas(event.clientX, event.clientY);
                const rectX = Math.min(currentSelection.startWorldX, world.x);
                const rectY = Math.min(currentSelection.startWorldY, world.y);
                const rectW = Math.abs(world.x - currentSelection.startWorldX);
                const rectH = Math.abs(world.y - currentSelection.startWorldY);
                const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

                const nodeById = indexCanvasNodes(nodesRef.current);
                nodesRef.current
                    .filter((node) => !isHiddenBatchChild(node, nodeById))
                    .forEach((node) => {
                        const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                        if (intersects) nextSelected.add(node.id);
                    });

                // 指针未移动或选择集未变化时不重设 state，避免框选期间每个 pointermove 都提交一次。
                if (world.x !== currentSelection.currentWorldX || world.y !== currentSelection.currentWorldY) {
                    const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
                    selectionBoxRef.current = nextSelectionBox;
                    setSelectionBox(nextSelectionBox);
                }
                const currentSelected = selectedNodeIdsRef.current;
                if (nextSelected.size !== currentSelected.size || [...nextSelected].some((id) => !currentSelected.has(id))) {
                    selectMany(nextSelected);
                }
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [buildDragFrame, getConnectionDropTarget, nodesRef, screenToCanvas, selectMany, selectedNodeIdsRef, viewportRef],
    );

    const handleGlobalPointerUp = useCallback((event: PointerEvent) => {
        if (activePointerIdRef.current != null && event.pointerId !== activePointerIdRef.current) return;
        finishNodeDrag(event.clientX, event.clientY);

        selectionBoxRef.current = null;
        setSelectionBox(null);

        if (pendingConnectionCreateRef.current) {
            activePointerIdRef.current = null;
            return;
        }

        const currentConnection = connectingParamsRef.current;
        if (currentConnection) {
            const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
            if (dropTarget.nodeId) {
                connectNodes(currentConnection, dropTarget.nodeId);
                setConnecting(null);
            } else if (dropTarget.isNearNode) {
                setConnecting(null);
            } else {
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
                setPendingConnectionCreate({ connection: currentConnection, position: screenToCanvas(event.clientX, event.clientY) });
            }
            activePointerIdRef.current = null;
        }
    }, [connectNodes, finishNodeDrag, getConnectionDropTarget, screenToCanvas, setConnecting]);

    const handleConnectStart = useCallback(
        (event: React.PointerEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            activePointerIdRef.current = event.pointerId;
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting, setSelectedConnectionId],
    );

    const handleKeyboardConnect = useCallback(
        (nodeId: string, handleType: "source" | "target") => {
            const current = connectingParamsRef.current;
            if (current) {
                if (current.nodeId !== nodeId) connectNodes(current, nodeId);
                setConnecting(null);
                return;
            }
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (node) setMouseWorld({ x: handleType === "source" ? node.position.x + node.width : node.position.x, y: node.position.y + node.height / 2 });
            setConnecting({ nodeId, handleType });
            setSelectedConnectionId(null);
            notifyInfo("连线模式：Tab 到目标节点的连接点按 Enter，或直接点击目标节点完成连线，Esc 取消");
        },
        [connectNodes, nodesRef, notifyInfo, setConnecting, setSelectedConnectionId],
    );

    useEffect(() => {
        const cancelPointerGesture = () => {
            finishNodeDrag();
            cancelPointerInteraction();
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (event.pointerType === "mouse") return;
            if (activePointerIdRef.current == null || event.pointerId === activePointerIdRef.current) return;
            if (dragRef.current.isDraggingNode) finishNodeDrag();
            if (connectingParamsRef.current) setConnecting(null);
        };
        window.addEventListener("pointermove", handleGlobalPointerMove);
        window.addEventListener("pointerup", handleGlobalPointerUp);
        window.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("pointercancel", cancelPointerGesture);
        window.addEventListener("blur", cancelPointerGesture);
        return () => {
            window.removeEventListener("pointermove", handleGlobalPointerMove);
            window.removeEventListener("pointerup", handleGlobalPointerUp);
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("pointercancel", cancelPointerGesture);
            window.removeEventListener("blur", cancelPointerGesture);
        };
    }, [cancelPointerInteraction, finishNodeDrag, handleGlobalPointerMove, handleGlobalPointerUp, setConnecting]);

    return {
        connectingParams,
        connectionTargetNodeId,
        pendingConnectionCreate,
        mouseWorld,
        selectionBox,
        isNodeDragging,
        dropTargetGroupId,
        alignmentGuides,
        nodeDraggingRef,
        setConnecting,
        cancelPendingConnectionCreate,
        cancelPointerInteraction,
        cancelSelectionBox,
        handleCanvasPointerDown,
        handleNodePointerDown,
        handleConnectStart,
        handleKeyboardConnect,
    };
}
