"use client";

import { useMemo } from "react";

import { buildNodeGenerationInputs } from "../../components/canvas-node-generation";
import type { CanvasVideoFrameOption } from "../../components/canvas-node-prompt-panel";
import type { CanvasVideoResourceOption } from "../../components/canvas-video-settings-popover";
import { CanvasNodeType, type CanvasConnection, type CanvasDirectorPanorama, type CanvasNodeData, type CanvasOverlay, type ContextMenuState, type ViewportTransform } from "../../types";
import { expandComicBookPageRelations } from "../../utils/comic-book-relations";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { buildNodeMentionReferences, isCanvasReferenceNode } from "../../utils/canvas-resource-references";
import { indexCanvasNodes, isHiddenBatchChild, isHiddenBatchConnectionEndpoint } from "../lib/canvas-graph";
import { collectPublishInputs } from "../lib/canvas-publish";

/** 无引用节点的共享空数组。 */
const EMPTY_MENTION_REFERENCES: ReturnType<typeof buildNodeMentionReferences> = [];

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
    const nodeById = useMemo(() => indexCanvasNodes(nodes), [nodes]);

    // 批量折叠子节点的隐藏判断每帧都要问一次，先算成集合，避免逐节点 find。
    const hiddenBatchChildIds = useMemo(() => {
        const hidden = new Set<string>();
        nodes.forEach((node) => {
            if (isHiddenBatchChild(node, nodeById, collapsingBatchIds)) hidden.add(node.id);
        });
        return hidden;
    }, [collapsingBatchIds, nodeById, nodes]);

    const visibleNodes = useMemo(() => {
        // 视口状态按 80ms 节流提交，裁切边距改成屏幕常量，快速平移时才不会露出空白。
        const padding = Math.max(280, Math.min(1600, 360 / viewport.k));
        const width = size.width;
        const height = size.height;
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + width / viewport.k + padding * 2;
        const viewBottom = viewTop + height / viewport.k + padding * 2;

        return nodes.filter((node) => !hiddenBatchChildIds.has(node.id) && node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
    }, [hiddenBatchChildIds, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    // 连线同样按视口裁切：贝塞尔控制点最多外扩 curvature，按包围盒保守判断即可。
    const visibleConnections = useMemo(() => {
        const padding = Math.max(400, Math.min(1800, 520 / viewport.k));
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + size.width / viewport.k + padding * 2;
        const viewBottom = viewTop + size.height / viewport.k + padding * 2;
        return connections.filter((connection) => {
            const from = nodeById.get(connection.fromNodeId);
            const to = nodeById.get(connection.toNodeId);
            if (!from || !to) return false;
            if (isHiddenBatchConnectionEndpoint(from, nodeById) || isHiddenBatchConnectionEndpoint(to, nodeById)) return false;
            const startX = from.position.x + from.width;
            const startY = from.position.y + from.height / 2;
            const endX = to.position.x;
            const endY = to.position.y + to.height / 2;
            const bulge = Math.max(Math.abs(endX - startX) * 0.5, 50);
            return Math.max(startX, endX) + bulge > viewLeft && Math.min(startX, endX) - bulge < viewRight && Math.max(startY, endY) > viewTop && Math.min(startY, endY) < viewBottom;
        });
    }, [connections, nodeById, size.height, size.width, viewport.k, viewport.x, viewport.y]);
    const connectionsByTargetNodeId = useMemo(() => {
        const map = new Map<string, CanvasConnection[]>();
        connections.forEach((connection) => {
            const list = map.get(connection.toNodeId);
            if (list) list.push(connection);
            else map.set(connection.toNodeId, [connection]);
        });
        return map;
    }, [connections]);
    const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
    const overlayNode = activeOverlay ? nodeById.get(activeOverlay.nodeId) || null : null;
    const infoNode = activeOverlay?.kind === "info" ? overlayNode : null;
    const cropNode = activeOverlay?.kind === "crop" ? overlayNode : null;
    const audioTrimNode = activeOverlay?.kind === "audioTrim" ? overlayNode : null;
    const maskEditNode = activeOverlay?.kind === "maskEdit" ? overlayNode : null;
    const splitNode = activeOverlay?.kind === "split" ? overlayNode : null;
    const upscaleNode = activeOverlay?.kind === "upscale" ? overlayNode : null;
    const denoiseNode = activeOverlay?.kind === "denoise" ? overlayNode : null;
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
        // 组容器与子节点同亮：选中子节点时保留父组，选中组时保留全部子节点。
        const groupId = focusNode?.metadata?.groupId;
        if (groupId) nodeIds.add(groupId);
        if (focusNode?.type === CanvasNodeType.Group) {
            nodes.forEach((node) => {
                if (node.metadata?.groupId === focusId) nodeIds.add(node.id);
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
        nodes.forEach((node) => {
            const references = buildNodeMentionReferences(node, nodes, connections);
            // 没有引用时复用同一个空数组，节点 memo 才不会被新数组击穿。
            map.set(node.id, references.length ? references : EMPTY_MENTION_REFERENCES);
        });
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
            const options = (connectionsByTargetNodeId.get(node.id) || []).flatMap((connection) => {
                const imageNode = nodeById.get(connection.fromNodeId);
                return isCanvasImageNodeType(imageNode?.type) && imageNode?.metadata?.content ? [{ nodeId: imageNode.id, label: imageNode.title || "图片节点", previewUrl: imageNode.metadata.content }] : [];
            });
            map.set(node.id, options);
        });
        return map;
    }, [connectionsByTargetNodeId, nodeById, nodes]);

    const videoResourceOptionsByNodeId = useMemo(() => {
        const map = new Map<string, CanvasVideoResourceOption[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Config && node.type !== CanvasNodeType.Audio) return;
            const options: CanvasVideoResourceOption[] = (connectionsByTargetNodeId.get(node.id) || []).flatMap<CanvasVideoResourceOption>((connection) => {
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
    }, [connectionsByTargetNodeId, nodeById, nodes]);

    return {
        visibleNodes,
        visibleConnections,
        nodeById,
        toolbarNode,
        overlayNode,
        infoNode,
        cropNode,
        audioTrimNode,
        maskEditNode,
        splitNode,
        upscaleNode,
        denoiseNode,
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
