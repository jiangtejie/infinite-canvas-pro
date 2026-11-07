"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { getConnectionTargetAnchor, normalizeConnection } from "../lib/canvas-connections";
import { isHiddenBatchChild } from "../lib/canvas-graph";
import { calculateCanvasAlignment, createCanvasAlignmentContext, type CanvasAlignmentContext, type CanvasAlignmentGuides } from "../../utils/canvas-alignment";
import { findContainingGroupId, findGroupDropTarget, snapNodesIntoGroup } from "../../utils/canvas-group";
import type { CanvasNodeData, ConnectionHandle, ContextMenuState, PendingConnectionCreate, Position, SelectionBox, ViewportTransform } from "../../types";

const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type UseCanvasPointerOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
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

            [...nodesRef.current]
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
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
            alignmentContextRef.current = createCanvasAlignmentContext(
                currentNodes.filter((node) => !isHiddenBatchChild(node, currentNodes)),
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

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.clickedGroupId = null;
        dragRef.current.initialSelectedNodes = [];
        alignmentContextRef.current = null;
        setDropTargetGroupId(null);
        setAlignmentGuides({});
        if (wasClick && clickedNodeId) onNodeClicked(clickedNodeId);
    }, [historyPausedRef, nodeDraggingRef, onNodeClicked, setNodes, viewportRef]);

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
                const previewNodes = nodesRef.current.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                setDropTargetGroupId(findGroupDropTarget(movedIds, previewNodes)?.id || null);

                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    setAlignmentGuides((current) =>
                        current.vertical === nextGuides.vertical && current.horizontal === nextGuides.horizontal
                            ? current
                            : nextGuides,
                    );
                    setNodes((prev) =>
                        prev.map((node) => {
                            const initial = initialPositions.find((item) => item.id === node.id);
                            return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                        }),
                    );
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

                nodesRef.current
                    .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
                    .forEach((node) => {
                        const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                        if (intersects) nextSelected.add(node.id);
                    });

                const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
                selectionBoxRef.current = nextSelectionBox;
                setSelectionBox(nextSelectionBox);
                selectMany(nextSelected);
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [getConnectionDropTarget, nodesRef, screenToCanvas, selectMany, setNodes, viewportRef],
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
