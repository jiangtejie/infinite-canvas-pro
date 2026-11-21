"use client";

import { useMemo } from "react";

import { buildNodeGenerationInputs } from "../../components/canvas-node-generation";
import type { CanvasVideoFrameOption } from "../../components/canvas-node-prompt-panel";
import type { CanvasVideoResourceOption } from "../../components/canvas-video-settings-popover";
import { CanvasNodeType, type CanvasConnection, type CanvasDirectorPanorama, type CanvasNodeData, type CanvasOverlay, type ContextMenuState, type ViewportTransform } from "../../types";
import { expandComicBookPageRelations } from "../../utils/comic-book-relations";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { buildNodeMentionReferences, isCanvasReferenceNode } from "../../utils/canvas-resource-references";
import { isHiddenBatchChild } from "../lib/canvas-graph";
import { collectPublishInputs } from "../lib/canvas-publish";

type CanvasDerivedOptions = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    collapsingBatchIds: Set<string>;
    viewport: ViewportTransform;
    size: { width: number; height: number };
    hoveredNodeId: string | null;
    toolbarNodeId: string | null;
    referencePickerNodeId: string | null;
    activeOverlay: CanvasOverlay | null;
    contextMenu: ContextMenuState | null;
};

/**
 * 画布页面的纯派生索引：可见节点、节点索引、浮层目标、连线关系与各类选项映射。
 */
export function useCanvasDerived({
    nodes,
    connections,
    selectedNodeIds,
    collapsingBatchIds,
    viewport,
    size,
    hoveredNodeId,
    toolbarNodeId,
    referencePickerNodeId,
    activeOverlay,
    contextMenu,
}: CanvasDerivedOptions) {
    const visibleNodes = useMemo(() => {
        const padding = 280;
        const width = size.width;
        const height = size.height;
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + width / viewport.k + padding * 2;
        const viewBottom = viewTop + height / viewport.k + padding * 2;

        return nodes.filter((node) => !isHiddenBatchChild(node, nodes, collapsingBatchIds) && node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
    }, [collapsingBatchIds, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
    const overlayNode = activeOverlay ? nodeById.get(activeOverlay.nodeId) || null : null;
    const infoNode = activeOverlay?.kind === "info" ? overlayNode : null;
    const cropNode = activeOverlay?.kind === "crop" ? overlayNode : null;
    const audioTrimNode = activeOverlay?.kind === "audioTrim" ? overlayNode : null;
    const maskEditNode = activeOverlay?.kind === "maskEdit" ? overlayNode : null;
    const splitNode = activeOverlay?.kind === "split" ? overlayNode : null;
    const upscaleNode = activeOverlay?.kind === "upscale" ? overlayNode : null;
    const angleNode = activeOverlay?.kind === "angle" ? overlayNode : null;
    const contextMenuNode = contextMenu?.type === "node" ? nodeById.get(contextMenu.nodeId) || null : null;
    const previewNode = activeOverlay?.kind === "preview" ? overlayNode : null;
    const comicNode = activeOverlay?.kind === "comic" ? overlayNode : null;
    const openDirectorNode = activeOverlay?.kind === "director" ? overlayNode : null;
    const selectedImageNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id) && isCanvasImageNodeType(node.type) && Boolean(node.metadata?.content)), [nodes, selectedNodeIds]);
    const selectedImageCount = selectedImageNodes.length;
    const canCreateComic = selectedImageCount >= 2;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const contextMenuBusy = contextMenuNode?.metadata?.status === "loading" || contextMenuNode?.metadata?.status === "stopping";
    const canGenerateFromContextMenu = Boolean(contextMenuNode && !contextMenuBusy && contextMenuNode.type !== CanvasNodeType.Group && contextMenuNode.type !== CanvasNodeType.Director && contextMenuNode.type !== CanvasNodeType.Publish);
    const canEditFromContextMenu = Boolean(contextMenuNode && contextMenuNode.type !== CanvasNodeType.Group && contextMenuNode.type !== CanvasNodeType.Director && contextMenuNode.type !== CanvasNodeType.Publish);
    const contextMenuGenerateLabel: "重新生成" | "用文本生图" | "生成" = contextMenuNode?.metadata?.status === "error" || contextMenuNode?.metadata?.status === "stopped" ? "重新生成" : contextMenuNode?.type === CanvasNodeType.Text ? "用文本生图" : "生成";

    const batchChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (node.metadata?.isBatchRoot) map.set(node.id, node.metadata.batchChildIds?.length || 0);
        });
        return map;
    }, [nodes]);

    const groupChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId) map.set(groupId, (map.get(groupId) || 0) + 1);
        });
        return map;
    }, [nodes]);

    const batchMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const rootId = node.metadata?.batchRootId;
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);

    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (activeNodeId) {
            nodeIds.add(activeNodeId);
            connections.forEach((connection) => {
                if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
                connectionIds.add(connection.id);
                nodeIds.add(connection.fromNodeId);
                nodeIds.add(connection.toNodeId);
            });
        }

        return expandComicBookPageRelations({ activeNodeId, nodes, baseNodeIds: nodeIds, baseConnectionIds: connectionIds });
    }, [activeNodeId, connections, nodes]);

    // 聚焦淡出只锚定「单选节点」，不随 hover 切换，避免鼠标扫过画布时整屏闪烁。
    const selectionFocus = useMemo(() => {
        if (selectedNodeIds.size !== 1) return null;
        const focusId = Array.from(selectedNodeIds)[0];
        const nodeIds = new Set<string>([focusId]);
        const connectionIds = new Set<string>();
        connections.forEach((connection) => {
            if (connection.fromNodeId !== focusId && connection.toNodeId !== focusId) return;
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });
        // 批量组整体保持常亮：选中根或任一子图时，根与全部子图都不淡出。
        const focusNode = nodes.find((node) => node.id === focusId);
        const batchRootId = focusNode?.metadata?.batchRootId || (focusNode?.metadata?.isBatchRoot ? focusId : null);
        if (batchRootId) {
            nodeIds.add(batchRootId);
            nodes.forEach((node) => {
                if (node.metadata?.batchRootId === batchRootId) nodeIds.add(node.id);
            });
        }
        return expandComicBookPageRelations({ activeNodeId: focusId, nodes, baseNodeIds: nodeIds, baseConnectionIds: connectionIds });
    }, [connections, nodes, selectedNodeIds]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeGenerationInputs>>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);

    const publishInputsById = useMemo(() => {
        const map = new Map<string, ReturnType<typeof collectPublishInputs>>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Publish) return;
            map.set(node.id, collectPublishInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);

    const directorPanoramasByNodeId = useMemo(() => {
        const map = new Map<string, CanvasDirectorPanorama[]>();
        nodes.forEach((node) => {
            if (node.type === CanvasNodeType.Director) map.set(node.id, []);
        });
        connections.forEach((connection) => {
            const target = nodeById.get(connection.toNodeId);
            const source = nodeById.get(connection.fromNodeId);
            if (target?.type !== CanvasNodeType.Director || !isCanvasImageNodeType(source?.type) || !source?.metadata?.content) return;
            map.get(target.id)?.push({
                edgeId: connection.id,
                sourceNodeId: source.id,
                imageUrl: source.metadata.content,
                fileName: source.title || "画布图片.png",
                projectionMode: source.metadata.panoramaProjection === "equirectangular" ? "equirectangular" : "backdrop",
            });
        });
        return map;
    }, [connections, nodeById, nodes]);

    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
        return map;
    }, [connections, nodes]);

    const connectedNodesByNodeId = useMemo(() => {
        const map = new Map<string, CanvasNodeData[]>();
        connections.forEach((connection) => {
            const source = nodeById.get(connection.fromNodeId);
            if (!source || !isCanvasReferenceNode(source)) return;
            const connected = map.get(connection.toNodeId);
            if (connected) connected.push(source);
            else map.set(connection.toNodeId, [source]);
        });
        return map;
    }, [connections, nodeById]);

    const referenceConnectedNodeIds = useMemo(() => new Set([referencePickerNodeId, ...(referencePickerNodeId ? connectedNodesByNodeId.get(referencePickerNodeId)?.map((node) => node.id) || [] : [])].filter((id): id is string => Boolean(id))), [connectedNodesByNodeId, referencePickerNodeId]);

    const videoFrameOptionsByNodeId = useMemo(() => {
        const map = new Map<string, CanvasVideoFrameOption[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Config) return;
            const options = connections.flatMap((connection) => {
                if (connection.toNodeId !== node.id) return [];
                const imageNode = nodeById.get(connection.fromNodeId);
                return isCanvasImageNodeType(imageNode?.type) && imageNode?.metadata?.content ? [{ nodeId: imageNode.id, label: imageNode.title || "图片节点", previewUrl: imageNode.metadata.content }] : [];
            });
            map.set(node.id, options);
        });
        return map;
    }, [connections, nodeById, nodes]);

    const videoResourceOptionsByNodeId = useMemo(() => {
        const map = new Map<string, CanvasVideoResourceOption[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Config && node.type !== CanvasNodeType.Audio) return;
            const options: CanvasVideoResourceOption[] = connections.flatMap<CanvasVideoResourceOption>((connection) => {
                if (connection.toNodeId !== node.id) return [];
                const source = nodeById.get(connection.fromNodeId);
                if (!source) return [];
                const label = source.title || source.id;
                if (source.type === CanvasNodeType.Text) {
                    const text = source.metadata?.content || source.metadata?.prompt || "";
                    return text.trim() ? [{ nodeId: source.id, kind: "text" as const, label, text }] : [];
                }
                if (isCanvasImageNodeType(source.type) && source.metadata?.content) return [{ nodeId: source.id, kind: "image" as const, label, previewUrl: source.metadata.content }];
                if (source.type === CanvasNodeType.Video && source.metadata?.content) return [{ nodeId: source.id, kind: "video" as const, label, previewUrl: source.metadata.content }];
                if (source.type === CanvasNodeType.Audio && source.metadata?.content) return [{ nodeId: source.id, kind: "audio" as const, label }];
                return [];
            });
            map.set(node.id, options);
        });
        return map;
    }, [connections, nodeById, nodes]);

    return {
        visibleNodes,
        nodeById,
        toolbarNode,
        overlayNode,
        infoNode,
        cropNode,
        audioTrimNode,
        maskEditNode,
        splitNode,
        upscaleNode,
        angleNode,
        contextMenuNode,
        previewNode,
        comicNode,
        openDirectorNode,
        selectedImageNodes,
        selectedImageCount,
        canCreateComic,
        hasMultipleSelectedNodes,
        activeNodeId,
        contextMenuBusy,
        canGenerateFromContextMenu,
        canEditFromContextMenu,
        contextMenuGenerateLabel,
        batchChildCountById,
        groupChildCountById,
        batchMotionById,
        relatedHighlight,
        selectionFocus,
        configInputsById,
        publishInputsById,
        directorPanoramasByNodeId,
        mentionReferencesByNodeId,
        connectedNodesByNodeId,
        referenceConnectedNodeIds,
        videoFrameOptionsByNodeId,
        videoResourceOptionsByNodeId,
    };
}
