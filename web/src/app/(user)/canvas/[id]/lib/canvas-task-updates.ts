import { isKIESeedreamLayerDecompositionModel } from "@/lib/kie-models";
import type { CanvasAudioTask } from "@/services/api/audio";
import type { CanvasImageTask } from "@/services/api/image";
import type { VideoResponse } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";

import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../../types";
import { fitNodeSize, nodeSizeFromRatio } from "../../utils/canvas-node-size";
import { PANORAMA_NODE_SIZE, isCanvasImageNodeType, isPanoramaNodeType } from "../../utils/canvas-panorama";
import { canvasRecoverableTaskId } from "./canvas-agent-summary";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "./canvas-node-constants";
import { canvasImageTaskChildIds, canvasImageTaskURLs, canvasTaskCompleted, canvasTaskFailed, canvasVideoTaskCompleted, canvasVideoTaskFailed, parseCanvasTaskTime, parseCanvasVideoTaskSize, parseCanvasVideoTaskTime } from "./canvas-task-helpers";

export type CanvasTaskMediaSize = { mediaSize?: { content: string; width: number; height: number } };

export function fitCanvasMediaNode(node: CanvasNodeData, size: CanvasTaskMediaSize["mediaSize"]) {
    if (!size || node.metadata?.content !== size.content || (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video) || node.metadata.isBatchRoot || node.metadata.batchRootId) return node;
    const frame = node.metadata.freeResize || Math.abs(node.width / node.height - size.width / size.height) < 1e-6 ? node : fitNodeSize(size.width, size.height, node.width, node.height);
    if (node.width === frame.width && node.height === frame.height && node.metadata.naturalWidth === size.width && node.metadata.naturalHeight === size.height) return node;
    return { ...node, width: frame.width, height: frame.height, metadata: { ...node.metadata, naturalWidth: size.width, naturalHeight: size.height } };
}

export function applyCanvasVideoTaskUpdate(nodes: CanvasNodeData[], nodeId: string, task: VideoResponse & CanvasTaskMediaSize, config: AiConfig, startedAt: number, fallbackSize: { width: number; height: number }, clientTaskId?: string) {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target || target.metadata?.status === "stopped" || (target.metadata?.status === "stopping" && !canvasVideoTaskCompleted(task)) || (clientTaskId && target.metadata?.clientTaskId !== clientTaskId)) return nodes;
    return nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const progress = typeof task.progress === "number" ? Math.max(0, Math.min(100, task.progress)) : node.metadata?.progress || 0;
        const url = task.video_url || task.url || "";
        const completed = canvasVideoTaskCompleted(task);
        const failed = canvasVideoTaskFailed(task) || (completed && !url);
        const taskStartedAt = parseCanvasVideoTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || startedAt;
        const metadata: CanvasNodeMetadata = {
            ...node.metadata,
            status: failed ? NODE_STATUS_ERROR : completed ? NODE_STATUS_SUCCESS : NODE_STATUS_LOADING,
            errorDetails: failed ? task.error?.message || (completed ? "视频生成完成但没有返回视频地址" : "视频生成失败") : undefined,
            model: task.model || config.model,
            size: task.size || node.metadata?.size || config.size,
            seconds: task.seconds || node.metadata?.seconds || config.videoSeconds,
            vquality: node.metadata?.vquality || config.vquality,
            mode: node.metadata?.mode || config.videoMode,
            negativePrompt: node.metadata?.negativePrompt || config.videoNegativePrompt,
            generateAudio: node.metadata?.generateAudio || config.videoGenerateAudio,
            characterOrientation: node.metadata?.characterOrientation || config.videoCharacterOrientation,
            watermark: node.metadata?.watermark || config.videoWatermark,
            startedAt: taskStartedAt,
            durationMs: Date.now() - taskStartedAt,
            progress,
            videoTaskId: task.task_id || task.id || node.metadata?.videoTaskId,
            videoTaskVideoId: task.video_id || node.metadata?.videoTaskVideoId,
            videoTaskTranslation: task.translationSnapshot,
        };
        if (!completed || !url) return { ...node, metadata };
        const taskSize = task.mediaSize?.content === url ? task.mediaSize : parseCanvasVideoTaskSize(task.size, fallbackSize);
        const videoSize = fitNodeSize(taskSize.width, taskSize.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        return {
            ...node,
            width: videoSize.width,
            height: videoSize.height,
            position: { x: node.position.x + node.width / 2 - videoSize.width / 2, y: node.position.y + node.height / 2 - videoSize.height / 2 },
            metadata: {
                ...metadata,
                content: url,
                storageKey: task.storageKey || "",
                status: NODE_STATUS_SUCCESS,
                naturalWidth: taskSize.width,
                naturalHeight: taskSize.height,
                bytes: 0,
                mimeType: "video/mp4",
                progress: 100,
            },
        };
    });
}

export function applyCanvasAudioTaskUpdate(nodes: CanvasNodeData[], nodeId: string, task: CanvasAudioTask, startedAt: number, clientTaskId?: string) {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target || target.metadata?.status === "stopped" || (target.metadata?.status === "stopping" && !canvasTaskCompleted(task.status) && !task.audio_url && !task.url) || (clientTaskId && target.metadata?.clientTaskId !== clientTaskId)) return nodes;
    return nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const progress = typeof task.progress === "number" ? Math.max(0, Math.min(100, task.progress)) : node.metadata?.progress || 0;
        const url = task.audio_url || task.url || "";
        const completed = canvasTaskCompleted(task.status) || Boolean(url);
        const failed = canvasTaskFailed(task.status) || (completed && !url);
        const taskStartedAt = parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || startedAt;
        const metadata: CanvasNodeMetadata = {
            ...node.metadata,
            status: failed ? NODE_STATUS_ERROR : completed ? NODE_STATUS_SUCCESS : NODE_STATUS_LOADING,
            errorDetails: failed ? task.error?.message || "音频生成失败" : undefined,
            startedAt: taskStartedAt,
            durationMs: Date.now() - taskStartedAt,
            progress,
            audioTaskId: task.id || node.metadata?.audioTaskId,
        };
        if (!completed || !url) return { ...node, metadata };
        return {
            ...node,
            metadata: {
                ...metadata,
                content: url,
                storageKey: task.storageKey || "",
                status: NODE_STATUS_SUCCESS,
                bytes: task.bytes || 0,
                mimeType: task.mimeType || "audio/mpeg",
                progress: 100,
                audioTaskResultId: task.id,
            },
        };
    });
}

export function applyCanvasImageTaskUpdate(nodes: CanvasNodeData[], nodeId: string, task: CanvasImageTask & CanvasTaskMediaSize, startedAt: number, fallbackSize: { width: number; height: number }, clientTaskId?: string) {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target || target.metadata?.status === "stopped" || (target.metadata?.status === "stopping" && !canvasTaskCompleted(task.status) && !canvasImageTaskURLs(task).length && task.status.toLowerCase() !== "failed") || (clientTaskId && target.metadata?.clientTaskId !== clientTaskId)) return nodes;
    if (target.metadata?.isBatchRoot && target.metadata.imageTaskId !== task.id) return nodes;
    const urls = canvasImageTaskURLs(task);
    const updated = nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const progress = typeof task.progress === "number" ? Math.max(0, Math.min(100, task.progress)) : node.metadata?.progress || 0;
        const url = urls[0] || "";
        const completed = canvasTaskCompleted(task.status) || Boolean(url);
        const failed = canvasTaskFailed(task.status) || (completed && !url);
        const taskStartedAt = parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || startedAt;
        const metadata: CanvasNodeMetadata = {
            ...node.metadata,
            status: failed ? NODE_STATUS_ERROR : completed ? NODE_STATUS_SUCCESS : NODE_STATUS_LOADING,
            errorDetails: failed ? task.error?.message || "图片生成失败" : undefined,
            startedAt: taskStartedAt,
            durationMs: Date.now() - taskStartedAt,
            progress,
            imageTaskId: task.id || node.metadata?.imageTaskId,
        };
        if (!completed || !url) return { ...node, metadata };
        const stored = task.imageStorage?.find((image) => image?.url === url);
        const isPanorama = isPanoramaNodeType(node.type);
        const requestedSize = nodeSizeFromRatio(node.metadata?.size || "", fallbackSize.width, fallbackSize.height);
        const mediaSize = !isPanorama && urls.length === 1 && !node.metadata?.isBatchRoot && !node.metadata?.batchRootId && task.mediaSize?.content === url ? task.mediaSize : undefined;
        const naturalWidth = mediaSize?.width || task.width || requestedSize?.width || fallbackSize.width || node.width;
        const naturalHeight = mediaSize?.height || task.height || requestedSize?.height || fallbackSize.height || node.height;
        const imageSize = isPanorama ? PANORAMA_NODE_SIZE : fitNodeSize(naturalWidth, naturalHeight, NODE_DEFAULT_SIZE[CanvasNodeType.Image].width, NODE_DEFAULT_SIZE[CanvasNodeType.Image].width);
        return {
            ...node,
            width: imageSize.width,
            height: imageSize.height,
            position: { x: node.position.x + node.width / 2 - imageSize.width / 2, y: node.position.y + node.height / 2 - imageSize.height / 2 },
            metadata: {
                ...metadata,
                content: url,
                storageKey: task.storageKey || "",
                status: NODE_STATUS_SUCCESS,
                naturalWidth: mediaSize?.width || stored?.width || naturalWidth,
                naturalHeight: mediaSize?.height || stored?.height || naturalHeight,
                bytes: task.bytes || 0,
                mimeType: task.mimeType || "image/png",
                progress: 100,
                imageTaskResultId: task.id,
                panoramaProjection: isPanorama ? ("equirectangular" as const) : undefined,
            },
        };
    });
    const root = updated.find((node) => node.id === nodeId);
    if (!root) return updated;
    const batchRootId = task.source === "workflow" ? root.metadata?.batchRootId : undefined;
    if (batchRootId) {
        const batchRoot = updated.find((node) => node.id === batchRootId);
        if (!batchRoot) return updated;
        const resultPrefix = `${nodeId}-result-`;
        const extraIds = canvasImageTaskChildIds(nodeId, task).slice(1);
        const taskChildIds = [nodeId, ...extraIds];
        const currentChildIds = (batchRoot.metadata?.batchChildIds || []).filter((id) => !id.startsWith(resultPrefix));
        const batchChildIds = currentChildIds.includes(nodeId)
            ? currentChildIds.flatMap((id) => id === nodeId ? taskChildIds : [id])
            : [...currentChildIds, ...taskChildIds];
        const targetNode: CanvasNodeData = {
            ...root,
            metadata: {
                ...root.metadata,
                isBatchRoot: undefined,
                batchChildIds: undefined,
                primaryImageId: undefined,
                imageBatchExpanded: undefined,
                batchRootId,
            },
        };
        const extraNodes = urls.slice(1).map((url, index): CanvasNodeData => {
            const stored = task.imageStorage?.find((image) => image?.url === url);
            const naturalWidth = stored?.width || root.metadata?.naturalWidth || root.width;
            const naturalHeight = stored?.height || root.metadata?.naturalHeight || root.height;
            const imageSize = isPanoramaNodeType(root.type) ? PANORAMA_NODE_SIZE : fitNodeSize(naturalWidth, naturalHeight, NODE_DEFAULT_SIZE[CanvasNodeType.Image].width, NODE_DEFAULT_SIZE[CanvasNodeType.Image].width);
            return {
                ...targetNode,
                id: extraIds[index],
                width: imageSize.width,
                height: imageSize.height,
                metadata: {
                    ...targetNode.metadata,
                    content: url,
                    storageKey: stored?.storageKey || "",
                    mimeType: stored?.mimeType || "image/png",
                    bytes: stored?.bytes || 0,
                    naturalWidth,
                    naturalHeight,
                    status: NODE_STATUS_SUCCESS,
                    progress: 100,
                    imageTaskId: undefined,
                    imageTaskResultId: task.id,
                },
            };
        });
        const childIndex = new Map(batchChildIds.map((id, index) => [id, index]));
        const flatNodes = updated
            .flatMap((node): CanvasNodeData[] => {
                if (node.id === nodeId) return [targetNode, ...extraNodes];
                return node.id.startsWith(resultPrefix) ? [] : [node];
            })
            .map((node) => {
                const index = childIndex.get(node.id);
                if (index === undefined || node.metadata?.batchRootId !== batchRootId) return node;
                return {
                    ...node,
                    position: {
                        x: batchRoot.position.x + batchRoot.width + 120 + (index % 2) * (fallbackSize.width + 36),
                        y: batchRoot.position.y + Math.floor(index / 2) * (fallbackSize.height + 36),
                    },
                };
            });
        const flatNodeById = new Map(flatNodes.map((node) => [node.id, node]));
        let primaryImageId = batchChildIds.includes(batchRoot.metadata?.primaryImageId || "") ? batchRoot.metadata?.primaryImageId : batchChildIds[0];
        let primaryNode = primaryImageId ? flatNodeById.get(primaryImageId) : undefined;
        if ([NODE_STATUS_ERROR, "stopping", "stopped"].includes(primaryNode?.metadata?.status || "") && !primaryNode?.metadata?.content) {
            const children = batchChildIds.flatMap((id) => {
                const child = flatNodeById.get(id);
                return child ? [child] : [];
            });
            const replacement = children.find((node) => Boolean(node.metadata?.content)) || children.find((node) => node.metadata?.status === NODE_STATUS_LOADING);
            if (replacement) {
                primaryNode = replacement;
                primaryImageId = replacement.id;
            }
        }
        return flatNodes.map((node) => {
            if (node.id !== batchRootId) return node;
            if (node.metadata?.clientTaskId && node.metadata.imageTaskId === node.metadata.clientTaskId && [NODE_STATUS_LOADING, "stopping"].includes(node.metadata.status || "")) return { ...node, metadata: { ...node.metadata, batchChildIds } };
            const primary = primaryNode?.metadata;
            return {
                ...node,
                ...(primaryNode?.metadata?.content ? { width: primaryNode.width, height: primaryNode.height } : {}),
                metadata: {
                    ...node.metadata,
                    isBatchRoot: true,
                    batchChildIds,
                    primaryImageId,
                    imageBatchExpanded: node.metadata?.imageBatchExpanded ?? true,
                    status: primary?.status || node.metadata?.status,
                    errorDetails: primary?.errorDetails,
                    startedAt: primary?.startedAt,
                    durationMs: primary?.durationMs,
                    progress: primary?.progress,
                    content: primary?.content,
                    storageKey: primary?.storageKey || "",
                    mimeType: primary?.mimeType,
                    bytes: primary?.bytes || 0,
                    naturalWidth: primary?.naturalWidth,
                    naturalHeight: primary?.naturalHeight,
                    panoramaProjection: primary?.panoramaProjection,
                    imageTaskId: primary?.workflowRef ? undefined : primary?.imageTaskId,
                    workflowRef: primary?.workflowRef,
                    imageTaskResultId: primary?.imageTaskResultId,
                },
            };
        });
    }
    if (urls.length < 2) return updated;
    const supportsMultiOutput = task.source === "workflow"
        ? isCanvasImageNodeType(root.type)
        : root.type === CanvasNodeType.Image && isKIESeedreamLayerDecompositionModel(task.model);
    if (!supportsMultiOutput) return updated;
    const childIds = canvasImageTaskChildIds(nodeId, task);
    const childNodes = urls.map((url, index): CanvasNodeData => {
        const id = childIds[index];
        const stored = task.imageStorage?.find((image) => image?.url === url);
        return {
            ...root,
            id,
            position: {
                x: root.position.x + root.width + 120 + (index % 2) * (root.width + 36),
                y: root.position.y + Math.floor(index / 2) * (root.height + 36),
            },
            metadata: {
                ...root.metadata,
                content: url,
                status: NODE_STATUS_SUCCESS,
                progress: 100,
                storageKey: stored?.storageKey || "",
                mimeType: stored?.mimeType || "image/png",
                bytes: stored?.bytes || 0,
                naturalWidth: stored?.width || root.metadata?.naturalWidth,
                naturalHeight: stored?.height || root.metadata?.naturalHeight,
                imageTaskId: undefined,
                imageTaskResultId: task.id,
                isBatchRoot: undefined,
                batchChildIds: undefined,
                primaryImageId: undefined,
                imageBatchExpanded: undefined,
                batchRootId: nodeId,
            },
        };
    });
    return [
        ...updated.filter((node) => !childIds.includes(node.id)).map((node) => {
            if (node.id === nodeId) return { ...node, metadata: { ...node.metadata, isBatchRoot: true, batchChildIds: childIds, primaryImageId: childIds[0], imageBatchExpanded: true, count: urls.length } };
            if (node.metadata?.batchRootId === nodeId) return { ...node, metadata: { ...node.metadata, batchRootId: undefined } };
            return node;
        }),
        ...childNodes,
    ];
}

export function applyCanvasImageTaskConnections(connections: CanvasConnection[], nodeId: string, task: CanvasImageTask, batchRootId?: string) {
    if (task.source === "workflow" && batchRootId) {
        const resultPrefix = `${nodeId}-result-`;
        const childIds = [nodeId, ...canvasImageTaskChildIds(nodeId, task).slice(1)];
        const childIdSet = new Set(childIds);
        const next = connections.filter((connection) => {
            if (connection.fromNodeId === nodeId && connection.toNodeId.startsWith(resultPrefix)) return false;
            return connection.fromNodeId !== batchRootId || !connection.toNodeId.startsWith(resultPrefix) || childIdSet.has(connection.toNodeId);
        });
        const existing = new Set(next.map((connection) => `${connection.fromNodeId}:${connection.toNodeId}`));
        return [...next, ...childIds.flatMap((childId): CanvasConnection[] => existing.has(`${batchRootId}:${childId}`) ? [] : [{ id: `${batchRootId}-connection-${childId}`, fromNodeId: batchRootId, toNodeId: childId }])];
    }
    if (task.source !== "workflow" && !isKIESeedreamLayerDecompositionModel(task.model)) return connections;
    const childIds = canvasImageTaskChildIds(nodeId, task);
    if (childIds.length < 2) return connections;
    const existing = new Set(connections.map((connection) => `${connection.fromNodeId}:${connection.toNodeId}`));
    return [...connections, ...childIds.flatMap((childId): CanvasConnection[] => existing.has(`${nodeId}:${childId}`) ? [] : [{ id: `${nodeId}-connection-${childId}`, fromNodeId: nodeId, toNodeId: childId }])];
}

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => (node.metadata?.status === "loading" && !canvasRecoverableTaskId(node) ? { ...node, metadata: { ...node.metadata, status: "error" as const, errorDetails: "页面刷新后生成已中断，请重新生成。" } } : node));
}
