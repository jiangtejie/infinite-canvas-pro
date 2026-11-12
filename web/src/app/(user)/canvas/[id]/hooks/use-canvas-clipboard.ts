"use client";

import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ContextMenuState, type Position } from "../../types";
import { cloneCanvasConnections, cloneCanvasNodes } from "../lib/canvas-clone";
import { createCanvasNode } from "../lib/canvas-node-factory";
import { NODE_STATUS_SUCCESS } from "../lib/canvas-node-constants";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type CanvasClipboardOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    selectOnly: (id: string) => void;
    selectMany: (ids: Iterable<string>) => void;
    setSelectedConnectionId: (id: string | null) => void;
    setContextMenu: (menu: ContextMenuState | null) => void;
    getCanvasCenter: () => Position;
    duplicateNode: (nodeId: string) => void;
    createImageFileNode: (file: File, position: Position) => unknown;
    onPromptPanelChange: (nodeId: string | null) => void;
    notify: (text: string) => void;
};

/**
 * 画布节点复制/粘贴：内部剪贴板、偏移与连线重建，以及系统剪贴板文本/图片的粘贴。
 */
export function useCanvasClipboard({
    nodesRef,
    connectionsRef,
    selectedNodeIdsRef,
    setNodes,
    setConnections,
    selectOnly,
    selectMany,
    setSelectedConnectionId,
    setContextMenu,
    getCanvasCenter,
    duplicateNode,
    createImageFileNode,
    onPromptPanelChange,
    notify,
}: CanvasClipboardOptions) {
    const clipboardRef = useRef<CanvasClipboard | null>(null);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedIds = new Set(selectedIds);
        nodesRef.current.forEach((node) => {
            if (node.type !== CanvasNodeType.Group || !selectedIds.has(node.id)) return;
            nodesRef.current.forEach((child) => {
                if (child.metadata?.groupId === node.id) copiedIds.add(child.id);
            });
        });

        const copiedNodes = nodesRef.current
            .filter((node) => copiedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => copiedIds.has(connection.fromNodeId) && copiedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, [connectionsRef, nodesRef, selectedNodeIdsRef]);

    const pasteCopiedNodes = useCallback((offsetFromSelection = false) => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = offsetFromSelection ? 36 : center.x - (bounds.left + bounds.right) / 2;
        const dy = offsetFromSelection ? 36 : center.y - (bounds.top + bounds.bottom) / 2;
        const { nodes: pastedNodes, idMap } = cloneCanvasNodes(clipboard.nodes, { offset: { x: dx, y: dy }, remapGroupIds: true });
        const nextConnections = cloneCanvasConnections(clipboard.connections, idMap);

        setNodes((prev) => [...prev, ...pastedNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        selectMany(pastedNodes.map((node) => node.id));
        setSelectedConnectionId(null);
        setContextMenu(null);
        onPromptPanelChange(pastedNodes[0]?.type === CanvasNodeType.Group ? null : pastedNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter, onPromptPanelChange, selectMany, setConnections, setContextMenu, setNodes, setSelectedConnectionId]);

    const duplicateSelectedNodes = useCallback(() => {
        const selectedIds = Array.from(selectedNodeIdsRef.current);
        if (!selectedIds.length) return;
        if (selectedIds.length === 1) {
            duplicateNode(selectedIds[0]);
            return;
        }
        copySelectedNodes();
        pasteCopiedNodes(true);
    }, [copySelectedNodes, duplicateNode, pasteCopiedNodes, selectedNodeIdsRef]);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            selectOnly(node.id);
            setSelectedConnectionId(null);
            setContextMenu(null);
            onPromptPanelChange(node.id);
            return true;
        },
        [getCanvasCenter, onPromptPanelChange, selectOnly, setContextMenu, setNodes, setSelectedConnectionId],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            notify("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) notify("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, notify]);

    return { copySelectedNodes, pasteCopiedNodes, duplicateSelectedNodes, pasteSystemClipboard };
}
