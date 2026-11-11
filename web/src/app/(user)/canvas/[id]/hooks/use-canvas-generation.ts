"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { nanoid } from "nanoid";

import { createCanvasAudioTask } from "@/services/api/audio";
import { createCanvasImageTask, requestImageQuestion, type CanvasImageTask } from "@/services/api/image";
import { createVideoGenerationTask } from "@/services/api/video";
import { deleteStoredImages, resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { channelProtocolForConfig, defaultConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { isAutoDLConfig } from "@/lib/autodl";
import { IMAGE_MASK_EDIT_PROMPT_PREFIX } from "@/lib/image-reference-prompt";
import { isKIESeedreamLayerDecompositionModel } from "@/lib/kie-models";
import { supportsVideoFrameReferences } from "@/lib/video-model-capabilities";
import type { ReferenceImage } from "@/types/image";

import type { CanvasImageAngleParams } from "../../components/canvas-node-angle-dialog";
import type { CanvasImageCropRect } from "../../components/canvas-node-crop-dialog";
import { appendImageNegativePrompt, buildNodeChatMessages, buildNodeGenerationContext, hydrateNodeGenerationContext } from "../../components/canvas-node-generation";
import type { CanvasImageMaskEditPayload } from "../../components/canvas-node-mask-edit-dialog";
import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import type { CanvasImageSplitParams } from "../../components/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "../../components/canvas-node-upscale-dialog";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../../constants";
import { applyCameraPrompt } from "../../utils/canvas-camera";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "../../utils/canvas-image-data";
import { resolveImageNegativePrompt } from "../../utils/canvas-negative-prompt";
import { fitNodeSize, nodeSizeFromRatio } from "../../utils/canvas-node-size";
import { PANORAMA_IMAGE_SIZE, buildPanoramaPrompt, isCanvasImageNodeType, isPanoramaNodeType } from "../../utils/canvas-panorama";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ContextMenuState } from "../../types";
import { applyCanvasAudioTaskUpdate, applyCanvasImageTaskConnections, applyCanvasImageTaskUpdate, applyCanvasVideoTaskUpdate } from "../lib/canvas-task-updates";
import { canvasTaskCompleted, canvasTaskFailed, parseCanvasTaskTime } from "../lib/canvas-task-helpers";
import { buildAudioGenerationMetadata, buildImageGenerationMetadata, getGenerationCount, imageMetadata } from "../lib/canvas-node-builders";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS } from "../lib/canvas-node-constants";
import { createCanvasNode } from "../lib/canvas-node-factory";
import { buildGenerationConfig } from "../lib/canvas-generation-config";
import { generationReferenceUrls, selectAudioReference, withCanvasVideoAdvancedConfig } from "../lib/canvas-generation-helpers";
import { buildAngleLabel, buildAnglePrompt, findRetrySourceNode, sourceNodeReferenceImages } from "../lib/canvas-graph";
import { submitCanvasWorkflowTask, workflowAudioTask, workflowImageTask, workflowVideoTask } from "../lib/canvas-workflow-tasks";
import type { CanvasNodeTaskRun } from "./use-canvas-tasks";
import type { useCanvasTaskSystem } from "./use-canvas-task-system";

type CanvasGenerationTaskSystem = ReturnType<typeof useCanvasTaskSystem>;

export type CanvasGenerateNodeOptions = {
    /** 批量队列后台生成：跳过选中节点、打开面板等交互副作用。 */
    background?: boolean;
    /** 覆盖本次生成的图片数量，批量队列固定按 1 张执行，避免全局 count 导致一张节点出多图。 */
    countOverride?: string;
    /** 强制原地覆盖已有内容，供复刻文案「重新生成」等内部流程使用。 */
    overwrite?: boolean;
};

type CanvasGenerationMessage = {
    error: (content: string) => void;
    warning: (content: string) => void;
    success: (content: string) => void;
    loading: (content: string, duration?: number) => () => void;
};

type UseCanvasGenerationOptions = {
    projectId: string;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    effectiveConfig: AiConfig;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (open?: boolean) => void;
    message: CanvasGenerationMessage;
    runningRequestRef: CanvasGenerationTaskSystem["runningRequestRef"];
    setRunningNodeId: CanvasGenerationTaskSystem["setRunningNodeId"];
    nodeTaskRunsRef: CanvasGenerationTaskSystem["nodeTaskRunsRef"];
    submitNodeTask: CanvasGenerationTaskSystem["submitNodeTask"];
    isNodeTaskActive: CanvasGenerationTaskSystem["isNodeTaskActive"];
    handleStopNode: CanvasGenerationTaskSystem["handleStopNode"];
    selectOnly: (nodeId: string) => void;
    selectMany: (ids: Iterable<string>) => void;
    setSelectedConnectionId: (id: string | null) => void;
    setContextMenu: (contextMenu: ContextMenuState | null) => void;
    openOverlay: (overlay: { kind: "prompt"; nodeId: string }) => void;
    closeOverlay: () => void;
    cancelPendingHistoryCommit: () => void;
};

/**
 * 画布生成：单节点/配置节点生成、批量图片与任务回写、重试、图片后处理（裁剪/切图/放大/角度/局部编辑/反推提示词）。
 */
export function useCanvasGeneration({
    projectId,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    effectiveConfig,
    isAiConfigReady,
    openConfigDialog,
    message,
    runningRequestRef,
    setRunningNodeId,
    nodeTaskRunsRef,
    submitNodeTask,
    isNodeTaskActive,
    handleStopNode,
    selectOnly,
    selectMany,
    setSelectedConnectionId,
    setContextMenu,
    openOverlay,
    closeOverlay,
    cancelPendingHistoryCommit,
}: UseCanvasGenerationOptions) {
    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (!isCanvasImageNodeType(node.type) || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(
                    CanvasNodeType.Text,
                    { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY },
                    { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 },
                ),
                title: "反推提示词",
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                    },
                ),
                title: "反推提示词配置",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
                { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id },
            ]);
            selectOnly(configNode.id);
            setSelectedConnectionId(null);
            openOverlay({ kind: "prompt", nodeId: configNode.id });
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message, openOverlay, selectOnly, setSelectedConnectionId, setConnections, setContextMenu, setNodes],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        const cropped = await cropDataUrl(node.metadata.content, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Cropped Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        selectOnly(childId);
        openOverlay({ kind: "prompt", nodeId: childId });
    }, [openOverlay, selectOnly, setConnections, setNodes]);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            closeOverlay();
            const hideSplitLoading = message.loading("正在处理切图...", 0);
            let uploadedImages: UploadedImage[] = [];

            try {
                const pieces = await splitDataUrl(node.metadata.content, params);
                const rows = params.horizontalLines.length + 1;
                const columns = params.verticalLines.length + 1;
                const gap = 16;
                const cellWidth = node.width / columns;
                const cellHeight = node.height / rows;
                const startX = node.position.x + node.width + 96;
                const startY = node.position.y;
                const uploadResults = await Promise.allSettled(
                    pieces.map(async (piece) => ({
                        piece,
                        image: await uploadImage(piece.dataUrl),
                    })),
                );
                const uploadedPieces = uploadResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
                uploadedImages = uploadedPieces.map(({ image }) => image);
                const failedUpload = uploadResults.find((result) => result.status === "rejected");

                if (failedUpload?.status === "rejected") throw failedUpload.reason;

                const childNodes = uploadedPieces.map(({ piece, image }) => {
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        width: cellWidth,
                        height: cellHeight,
                        metadata: {
                            ...imageMetadata(image),
                            prompt: node.metadata?.prompt,
                        },
                    } satisfies CanvasNodeData;
                });

                setNodes((prev) => [...prev, ...childNodes]);
                setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
                selectMany(childNodes.map((child) => child.id));
                setSelectedConnectionId(null);
                closeOverlay();
                uploadedImages = [];
                message.success(`已切分为 ${childNodes.length} 个子节点`);
            } catch (error) {
                let cleanupFailed = false;

                if (uploadedImages.length) {
                    try {
                        await deleteStoredImages(uploadedImages.map((image) => image.storageKey));
                    } catch {
                        cleanupFailed = true;
                    }
                }

                const errorMessage = error instanceof Error ? error.message : "切图失败";
                message.error(cleanupFailed ? `${errorMessage}；部分临时图片清理失败` : errorMessage);
            } finally {
                hideSplitLoading();
            }
        },
        [closeOverlay, message, selectMany, setSelectedConnectionId, setConnections, setNodes],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const baseGenerationConfig = buildGenerationConfig(effectiveConfig, node, "image");
            const generationConfig = { ...baseGenerationConfig, model: payload.model || baseGenerationConfig.model, activeChannelId: payload.channelId || baseGenerationConfig.imageChannelId || baseGenerationConfig.activeChannelId, imageChannelId: payload.channelId || baseGenerationConfig.imageChannelId, count: "1", size: node.metadata?.size || "auto" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = `${IMAGE_MASK_EDIT_PROMPT_PREFIX}${userPrompt}`;
            const childId = nanoid();
            const clientTaskId = `client_image_task_${nanoid()}`;
            const markedReference = { id: `${node.id}-marked`, name: `image-${node.id}-marked.png`, type: "image/png", dataUrl: payload.markedDataUrl };
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [markedReference]);
            const childNode: CanvasNodeData = {
                id: childId,
                type: CanvasNodeType.Image,
                title: userPrompt.slice(0, 32) || "局部编辑结果",
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width: node.width,
                height: node.height,
                metadata: { prompt, status: NODE_STATUS_LOADING, startedAt: Date.now(), progress: 0, clientTaskId, imageTaskId: clientTaskId, ...generationMetadata },
            };
            closeOverlay();
            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(childId);
            setNodes((prev) => [...prev, childNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            selectOnly(childId);
            setSelectedConnectionId(null);
            openOverlay({ kind: "prompt", nodeId: childId });
            try {
                const task = await submitNodeTask(childId, clientTaskId, (signal, onServerTask) => createCanvasImageTask(generationConfig, prompt, [markedReference], { signal, onServerTask, nodeId: childId, sourceId: projectId, clientTaskId }));
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                setNodes((prev) => applyCanvasImageTaskUpdate(prev, childId, task, childNode.metadata?.startedAt || Date.now(), { width: node.width, height: node.height }, clientTaskId));
                setConnections((prev) => isNodeTaskActive(childId, clientTaskId) ? applyCanvasImageTaskConnections(prev, childId, task) : prev);
            } catch (error) {
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [closeOverlay, effectiveConfig, isAiConfigReady, message, openConfigDialog, openOverlay, projectId, isNodeTaskActive, submitNodeTask, runningRequestRef, selectOnly, setRunningNodeId, setSelectedConnectionId, setConnections, setNodes],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content) return;
        closeOverlay();
        const hideLoading = message.loading("正在放大图片...", 0);
        try {
            const upscaled = await upscaleDataUrl(node.metadata.content, params);
            const image = await uploadImage(upscaled);
            const size = fitNodeSize(image.width, image.height);
            const childId = nanoid();
            const child: CanvasNodeData = {
                id: childId,
                type: CanvasNodeType.Image,
                title: "Upscaled Image",
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width: size.width,
                height: size.height,
                metadata: {
                    ...imageMetadata(image),
                    prompt: node.metadata?.prompt,
                },
            };
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            selectOnly(childId);
            openOverlay({ kind: "prompt", nodeId: childId });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片放大失败");
        } finally {
            hideLoading();
        }
    }, [closeOverlay, message, openOverlay, selectOnly, setConnections, setNodes]);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const referenceImages = [{ id: node.id, name: `image-${node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }];
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, referenceImages);
            const clientTaskId = `client_image_task_${nanoid()}`;
            const startedAt = Date.now();
            closeOverlay();
            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, clientTaskId, imageTaskId: clientTaskId, startedAt, progress: 0, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            selectOnly(childId);
            openOverlay({ kind: "prompt", nodeId: childId });
            try {
                const task = await submitNodeTask(childId, clientTaskId, (signal, onServerTask) => createCanvasImageTask(generationConfig, prompt, referenceImages, { signal, onServerTask, nodeId: childId, sourceId: projectId, clientTaskId }));
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                setNodes((prev) => applyCanvasImageTaskUpdate(prev, childId, task, startedAt, { width: imageConfig.width, height: imageConfig.height }, clientTaskId));
                setConnections((prev) => isNodeTaskActive(childId, clientTaskId) ? applyCanvasImageTaskConnections(prev, childId, task) : prev);
            } catch (error) {
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [closeOverlay, effectiveConfig, openConfigDialog, openOverlay, projectId, isNodeTaskActive, submitNodeTask, isAiConfigReady, runningRequestRef, selectOnly, setRunningNodeId, setConnections, setNodes],
    );

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasGenerateNodeOptions) => {
            const background = options?.background === true;
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            const workflowRef = mode === "text" ? undefined : sourceNode?.metadata?.workflowRef;
            if (workflowRef && !useUserStore.getState().token) {
                message.error("工作流生成需要先登录");
                return;
            }
            if (!workflowRef && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const overwriteExisting = options?.overwrite === true || (effectiveConfig.nodeRegenerateBehavior === "overwrite" && sourceNode?.type === mode && !sourceNode.metadata?.isBatchRoot)
                && Boolean(sourceNode.metadata?.content || sourceNode.metadata?.clientTaskId)
                && (mode !== "image" || workflowRef || !isKIESeedreamLayerDecompositionModel(generationConfig.model));
            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(nodeId);
            const preparingRun: CanvasNodeTaskRun | undefined = overwriteExisting ? nodeTaskRunsRef.current.get(nodeId) || { id: "", controller: new AbortController() } : undefined;
            if (preparingRun) {
                preparingRun.preparing = runningRequest;
                nodeTaskRunsRef.current.set(nodeId, preparingRun);
            }
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent) && !overwriteExisting;
            const generationContext = await hydrateNodeGenerationContext(
                buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt),
            );
            const effectivePrompt = generationContext.prompt.trim();
            const imageNegativePrompt = isCanvasImageNodeType(sourceNode?.type)
                ? resolveImageNegativePrompt(effectivePrompt, sourceNode?.metadata?.negativePrompt, sourceNode?.metadata?.autoNegativePrompt !== false)
                : "";
            const cameraPrompt =
                mode === "video" || (mode === "image" && !isPanoramaNodeType(sourceNode?.type))
                    ? applyCameraPrompt(effectivePrompt, sourceNode?.metadata?.cameraControl)
                    : effectivePrompt;
            const requestPrompt = appendImageNegativePrompt(cameraPrompt, imageNegativePrompt);
            const markSourceStatus = !isCanvasImageNodeType(sourceNode?.type) && !editingTextNode;
            const statusPrompt = sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
            if (!effectivePrompt && (mode === "text" || (mode === "audio" && !workflowRef))) {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
                return;
            }
            let pendingChildIds: string[] = [];
            let submittedTask: { nodeId: string; id: string } | undefined;
            const textTaskId = mode === "text" ? `client_text_task_${nanoid()}` : "";
            const generationStartedAt = Date.now();
            try {
                if (overwriteExisting && (nodeTaskRunsRef.current.get(nodeId) !== preparingRun || preparingRun?.preparing !== runningRequest)) return;
                const currentStatus = nodesRef.current.find((node) => node.id === nodeId)?.metadata?.status;
                if (preparingRun?.id && !preparingRun.controller.signal.aborted
                    && (preparingRun.submission || currentStatus === "loading" || currentStatus === "stopping")
                    && !canvasTaskCompleted(preparingRun.task?.status) && !canvasTaskFailed(preparingRun.task?.status)) {
                    await handleStopNode(nodeId);
                    if (nodeTaskRunsRef.current.get(nodeId) !== preparingRun || preparingRun.preparing !== runningRequest
                        || (!preparingRun.controller.signal.aborted
                            && !canvasTaskCompleted(preparingRun.task?.status) && !canvasTaskFailed(preparingRun.task?.status))) return;
                }
                if (overwriteExisting && !nodesRef.current.some((node) => node.id === nodeId && !node.metadata?.isBatchRoot)) return;
                if (mode !== "audio" && preparingRun?.preparing === runningRequest) delete preparingRun.preparing;
                if (markSourceStatus) setNodes((prev) => prev.map((node) => node.id === nodeId ? {
                    ...node,
                    metadata: {
                        ...node.metadata, prompt: statusPrompt,
                        ...(mode === "text" && sourceNode?.type !== CanvasNodeType.Config ? { clientTaskId: textTaskId, taskBackend: undefined } : {}),
                        ...(overwriteExisting ? { content: undefined, storageKey: "" } : {}),
                        status: NODE_STATUS_LOADING, startedAt: generationStartedAt,
                        durationMs: undefined, errorDetails: undefined,
                    },
                } : node));
                if (mode === "image" && isPanoramaNodeType(sourceNode?.type)) {
                    const panoramaSourcePrompt = prompt.trim();
                    const sourceReference: ReferenceImage[] = sourceNode?.metadata?.content
                        ? [{ id: sourceNode.id, name: `image-${sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                        : [];
                    const referenceImages = [...generationContext.referenceImages, ...sourceReference];
                    const panoramaPrompt = buildPanoramaPrompt(effectivePrompt, referenceImages.length > 0);
                    const panoramaRequestPrompt = appendImageNegativePrompt(panoramaPrompt, imageNegativePrompt);
                    const panoramaGenerationConfig = { ...generationConfig, size: PANORAMA_IMAGE_SIZE };
                    const count = getGenerationCount(options?.countOverride ?? panoramaGenerationConfig.count);
                    const isEmptyPanoramaNode = !sourceNode?.metadata?.content;
                    const panoramaNodeConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Panorama];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootId = isEmptyPanoramaNode ? nodeId : nanoid();
                    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
                    const targetIds = count > 1 ? childIds : [rootId];
                    const targetTaskIds = Object.fromEntries(targetIds.map((id) => [id, "client_image_task_" + nanoid()]));
                    const primaryTargetId = targetIds[0];
                    pendingChildIds = isEmptyPanoramaNode ? childIds : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Panorama,
                        title: sourceNode?.title || "全景图",
                        position: {
                            x: isEmptyPanoramaNode ? parentPosition.x : parentPosition.x + panoramaNodeConfig.width + gap,
                            y: parentPosition.y + panoramaNodeConfig.height / 2 - panoramaNodeConfig.height / 2,
                        },
                        width: isEmptyPanoramaNode ? sourceNode?.width || panoramaNodeConfig.width : panoramaNodeConfig.width,
                        height: isEmptyPanoramaNode ? sourceNode?.height || panoramaNodeConfig.height : panoramaNodeConfig.height,
                        metadata: {
                            ...buildImageGenerationMetadata(referenceImages.length ? "edit" : "generation", panoramaGenerationConfig, count, referenceImages),
                            workflowRef,
                            prompt: panoramaSourcePrompt,
                            panoramaSourcePrompt,
                            panoramaFinalPrompt: panoramaRequestPrompt,
                            panoramaProjection: undefined,
                            status: NODE_STATUS_LOADING,
                            startedAt: generationStartedAt,
                            progress: 0,
                            clientTaskId: count > 1 ? undefined : targetTaskIds[rootId],
                            imageTaskId: workflowRef && count > 1 ? undefined : primaryTargetId ? targetTaskIds[primaryTargetId] : undefined,
                            primaryImageId: count > 1 ? primaryTargetId : undefined,
                            isBatchRoot: count > 1,
                            batchChildIds: count > 1 ? childIds : undefined,
                            batchUsesReferenceImages: referenceImages.length > 0,
                            imageBatchExpanded: count > 1 ? true : undefined,
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Panorama,
                        title: sourceNode?.title || "全景图",
                        position: {
                            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (panoramaNodeConfig.width + 36),
                            y: rootNode.position.y + Math.floor(index / 2) * (panoramaNodeConfig.height + rowGap),
                        },
                        width: panoramaNodeConfig.width,
                        height: panoramaNodeConfig.height,
                        metadata: {
                            ...buildImageGenerationMetadata(referenceImages.length ? "edit" : "generation", panoramaGenerationConfig, count, referenceImages),
                            workflowRef,
                            prompt: panoramaSourcePrompt,
                            panoramaSourcePrompt,
                            panoramaFinalPrompt: panoramaRequestPrompt,
                            panoramaProjection: undefined,
                            status: NODE_STATUS_LOADING,
                            startedAt: generationStartedAt,
                            progress: 0,
                            clientTaskId: targetTaskIds[id], imageTaskId: targetTaskIds[id],
                            batchRootId: count > 1 ? rootId : undefined,
                        },
                    }));
                    const batchConnections = [...(isEmptyPanoramaNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];

                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isEmptyPanoramaNode
                                    ? {
                                        ...node,
                                        position: rootNode.position,
                                        width: rootNode.width,
                                        height: rootNode.height,
                                        title: background ? node.title : rootNode.title,
                                        metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                                    }
                                    : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } }
                                : node,
                        ),
                        ...(isEmptyPanoramaNode ? [] : [rootNode]),
                        ...childNodes,
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    if (!background) {
                        selectOnly(nodeId);
                        setSelectedConnectionId(null);
                        openOverlay({ kind: "prompt", nodeId });
                    }

                    const taskResults = await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const task = await submitNodeTask(targetId, targetTaskIds[targetId], async (signal, onServerTask) => workflowRef
                                    ? await workflowImageTask(await submitCanvasWorkflowTask(workflowRef, panoramaGenerationConfig, "image", panoramaRequestPrompt, referenceImages, [], [], targetId, projectId, targetTaskIds[targetId], () => onServerTask("workflow"), signal))
                                    : await createCanvasImageTask({ ...panoramaGenerationConfig, count: "1", quality: panoramaGenerationConfig.quality === "auto" ? "medium" : panoramaGenerationConfig.quality }, panoramaRequestPrompt, referenceImages, { signal, onServerTask, nodeId: targetId, sourceId: projectId, clientTaskId: targetTaskIds[targetId] }));
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                if (task.image_url || task.url) {
                                    setNodes((prev) => {
                                        if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                        const root = prev.find((node) => node.id === rootId);
                                        let next = applyCanvasImageTaskUpdate(prev, targetId, task, generationStartedAt, { width: panoramaNodeConfig.width, height: panoramaNodeConfig.height }, targetTaskIds[targetId]);
                                        if (task.source !== "workflow" && targetId !== rootId && root?.metadata?.primaryImageId === targetId) {
                                            next = applyCanvasImageTaskUpdate(next, rootId, task, generationStartedAt, { width: panoramaNodeConfig.width, height: panoramaNodeConfig.height });
                                        }
                                        return next;
                                    });
                                    if (task.source === "workflow") setConnections((prev) => isNodeTaskActive(targetId, targetTaskIds[targetId]) ? applyCanvasImageTaskConnections(prev, targetId, task, count > 1 ? rootId : undefined) : prev);
                                    return true;
                                }
                                setNodes((prev) => {
                                    if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                    const root = prev.find((node) => node.id === rootId);
                                    return prev.map((node) => {
                                        if (node.id !== targetId && node.id !== rootId) return node;
                                        if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryImageId)) {
                                            return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, primaryImageId: targetId, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined } };
                                        }
                                        if (node.id === targetId) {
                                            return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined } };
                                        }
                                        return node;
                                    });
                                });
                                return true;
                            } catch (error) {
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                const errorDetails = error instanceof Error ? error.message : "全景图生成失败";
                                setNodes((prev) => workflowRef
                                    ? applyCanvasImageTaskUpdate(prev, targetId, { id: targetTaskIds[targetId], source: "workflow", status: "failed", error: { message: errorDetails } }, generationStartedAt, { width: panoramaNodeConfig.width, height: panoramaNodeConfig.height })
                                    : prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                                return false;
                            }
                        }),
                    );
                    const hasSuccess = taskResults.some(Boolean);
                    const hasFailure = taskResults.some((result) => !result);
                    if (hasFailure) message.error(hasSuccess ? "部分全景图任务创建失败" : "全部全景图任务创建失败");
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === rootId && !hasSuccess
                                ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部全景图任务创建失败" } }
                                : node,
                        ),
                    );
                    return;
                }

                if (mode === "image") {
                    const count = !workflowRef && isKIESeedreamLayerDecompositionModel(generationConfig.model) ? 1 : getGenerationCount(options?.countOverride ?? generationConfig.count);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && (overwriteExisting || !sourceNode?.metadata?.content);
                    const batchRoot = overwriteExisting && sourceNode?.metadata?.batchRootId ? nodesRef.current.find((node) => node.id === sourceNode.metadata?.batchRootId && node.metadata?.isBatchRoot) : undefined;
                    const createBatchRoot = count > 1 && !batchRoot;
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content && !overwriteExisting
                            ? [{ id: sourceNode.id, name: `image-${sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = [...generationContext.referenceImages, ...sourceReference];
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const imageSize = nodeSizeFromRatio(generationConfig.size, imageConfig.width, imageConfig.height) || imageConfig;
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootId = isEmptyImageNode ? nodeId : nanoid();
                    const displayRootId = batchRoot?.id || rootId;
                    const childIds = Array.from({ length: createBatchRoot ? count : batchRoot ? count - 1 : 0 }, () => nanoid());
                    const targetIds = createBatchRoot ? childIds : [rootId, ...childIds];
                    const targetTaskIds = Object.fromEntries(targetIds.map((id) => [id, `client_image_task_${nanoid()}`]));
                    const primaryTargetId = targetIds[0];
                    pendingChildIds = isEmptyImageNode ? childIds : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
                            y: parentPosition.y + parentConfig.height / 2 - imageSize.height / 2,
                        },
                        width: isEmptyImageNode ? sourceNode?.width || imageSize.width : imageSize.width,
                        height: isEmptyImageNode ? sourceNode?.height || imageSize.height : imageSize.height,
                        metadata: {
                            prompt: effectivePrompt,
                            cameraControl: sourceNode?.metadata?.cameraControl,
                            status: NODE_STATUS_LOADING,
                            startedAt: generationStartedAt,
                            progress: 0,
                            clientTaskId: createBatchRoot ? undefined : targetTaskIds[rootId],
                            imageTaskId: workflowRef && createBatchRoot ? undefined : primaryTargetId ? targetTaskIds[primaryTargetId] : undefined,
                            primaryImageId: createBatchRoot ? primaryTargetId : undefined,
                            isBatchRoot: createBatchRoot,
                            batchChildIds: createBatchRoot ? childIds : undefined,
                            ...(batchRoot ? { batchRootId: batchRoot.id } : {}),
                            batchUsesReferenceImages: referenceImages.length > 0,
                            ...generationMetadata,
                            workflowRef,
                            imageBatchExpanded: createBatchRoot ? true : undefined,
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageSize.width + 36),
                            y: rootNode.position.y + Math.floor(index / 2) * (imageSize.height + rowGap),
                        },
                        width: imageSize.width,
                        height: imageSize.height,
                        metadata: { prompt: effectivePrompt, cameraControl: sourceNode?.metadata?.cameraControl, status: NODE_STATUS_LOADING, startedAt: generationStartedAt, progress: 0, clientTaskId: targetTaskIds[id], imageTaskId: targetTaskIds[id], batchRootId: batchRoot?.id || (createBatchRoot ? rootId : undefined), ...generationMetadata, workflowRef },
                    }));
                    const batchConnections = [...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: displayRootId, toNodeId: childId }))];

                    if (overwriteExisting && createBatchRoot) {
                        cancelPendingHistoryCommit();
                        nodeTaskRunsRef.current.set(rootId, { id: "", controller: new AbortController(), generation: runningRequest });
                        nodesRef.current = nodesRef.current.map((node) => node.id === rootId
                            ? { ...node, metadata: { ...node.metadata, isBatchRoot: true } } : node);
                    }
                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === batchRoot?.id && (childIds.length || node.metadata?.primaryImageId === nodeId)
                                ? {
                                    ...node,
                                    metadata: {
                                        ...node.metadata,
                                        batchChildIds: [...(node.metadata?.batchChildIds || []), ...childIds],
                                        ...(node.metadata?.primaryImageId === nodeId
                                            && !(node.metadata.clientTaskId && node.metadata.imageTaskId === node.metadata.clientTaskId
                                                && [NODE_STATUS_LOADING, "stopping"].includes(node.metadata.status || "")) ? {
                                            content: undefined, storageKey: "", status: NODE_STATUS_LOADING,
                                            errorDetails: undefined, clientTaskId: undefined,
                                            imageTaskId: workflowRef ? undefined : targetTaskIds[nodeId],
                                            imageTaskResultId: undefined, workflowRef,
                                            startedAt: generationStartedAt, durationMs: undefined, progress: 0,
                                        } : {}),
                                    },
                                }
                                : node.id === nodeId
                                ? isConfigNode
                                    ? {
                                        ...node,
                                        metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, startedAt: generationStartedAt, durationMs: undefined, errorDetails: undefined },
                                    }
                                    : isEmptyImageNode
                                        ? {
                                            ...node,
                                            position: overwriteExisting ? node.position : rootNode.position,
                                            width: overwriteExisting ? node.width : rootNode.width,
                                            height: overwriteExisting ? node.height : rootNode.height,
                                            title: background ? node.title : rootNode.title,
                                            metadata: { ...node.metadata, ...rootNode.metadata, ...(overwriteExisting ? { content: undefined, storageKey: "", imageTaskResultId: undefined, taskBackend: undefined, durationMs: undefined } : {}), errorDetails: undefined },
                                        }
                                        : isImageNode
                                            ? {
                                                ...node,
                                                metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                                            }
                                            : {
                                                ...node,
                                                type: CanvasNodeType.Text,
                                                title: prompt.slice(0, 32) || "Prompt",
                                                width: parentConfig.width,
                                                height: parentConfig.height,
                                                metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                                            }
                                : node,
                        ),
                        ...(isEmptyImageNode ? [] : [rootNode]),
                        ...childNodes.map((child, index) => {
                            const parent = prev.find((node) => node.id === (batchRoot?.id || (overwriteExisting ? rootId : "")));
                            const slot = (batchRoot ? parent?.metadata?.batchChildIds?.length || 0 : 0) + index;
                            return parent ? { ...child, position: { x: parent.position.x + parent.width + 120 + (slot % 2) * (imageSize.width + 36), y: parent.position.y + Math.floor(slot / 2) * (imageSize.height + rowGap) } } : child;
                        }),
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    if (!background) {
                        selectOnly(nodeId);
                        setSelectedConnectionId(null);
                        openOverlay({ kind: "prompt", nodeId });
                    }

                    const taskResults = await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const task = await submitNodeTask(targetId, targetTaskIds[targetId], async (signal, onServerTask) => workflowRef
                                    ? await workflowImageTask(await submitCanvasWorkflowTask(workflowRef, generationConfig, "image", requestPrompt, referenceImages, [], [], targetId, projectId, targetTaskIds[targetId], () => onServerTask("workflow"), signal))
                                    : await createCanvasImageTask({ ...generationConfig, count: "1" }, requestPrompt, referenceImages, { signal, onServerTask, nodeId: targetId, sourceId: projectId, clientTaskId: targetTaskIds[targetId] }), overwriteExisting && targetId === nodeId ? runningRequest : undefined);
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                if (task.image_url || task.url) {
                                    setNodes((prev) => {
                                        if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                        const root = prev.find((node) => node.id === displayRootId);
                                        let next = applyCanvasImageTaskUpdate(prev, targetId, task, generationStartedAt, { width: imageSize.width, height: imageSize.height }, targetTaskIds[targetId]);
                                        if (task.source !== "workflow" && targetId !== displayRootId && root?.metadata?.primaryImageId === targetId && (!batchRoot || root.metadata.imageTaskId === targetTaskIds[targetId])) {
                                            next = applyCanvasImageTaskUpdate(next, displayRootId, task, generationStartedAt, { width: imageSize.width, height: imageSize.height });
                                        }
                                        return next;
                                    });
                                    setConnections((prev) => isNodeTaskActive(targetId, targetTaskIds[targetId]) ? applyCanvasImageTaskConnections(prev, targetId, task, batchRoot?.id || (createBatchRoot ? rootId : undefined)) : prev);
                                    return true;
                                }
                                setNodes((prev) => {
                                    if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                    const root = prev.find((node) => node.id === displayRootId);
                                    return prev.map((node) => {
                                        if (node.id !== targetId && node.id !== displayRootId) return node;
                                        if (node.id === displayRootId && (targetId === displayRootId || !root?.metadata?.primaryImageId))
                                            return {
                                                ...node,
                                                metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, primaryImageId: targetId, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined },
                                            };
                                        if (node.id === targetId)
                                            return {
                                                ...node,
                                                metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined },
                                            };
                                        return node;
                                    });
                                });
                                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return true;
                            } catch (error) {
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                const errorDetails = error instanceof Error ? error.message : "生成失败";
                                setNodes((prev) => workflowRef
                                    ? applyCanvasImageTaskUpdate(prev, targetId, { id: targetTaskIds[targetId], source: "workflow", status: "failed", error: { message: errorDetails } }, generationStartedAt, { width: imageSize.width, height: imageSize.height })
                                    : prev.map((node) => (node.id === targetId || (node.id === batchRoot?.id && node.metadata?.primaryImageId === targetId && node.metadata.imageTaskId === targetTaskIds[targetId]) ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                                return false;
                            }
                        }),
                    );
                    const hasSuccess = taskResults.some(Boolean);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR } }
                                : node.id === rootId && !hasSuccess && (!targetTaskIds[rootId] || (node.metadata?.clientTaskId === targetTaskIds[rootId] && isNodeTaskActive(rootId, targetTaskIds[rootId])))
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR } }
                                    : node,
                        ),
                    );
                    return;
                }

                if (mode === "video") {
                    const videoGenerationConfig = workflowRef ? generationConfig : withCanvasVideoAdvancedConfig(generationConfig, generationContext);
                    const frameReferencesEnabled = Boolean(workflowRef) || supportsVideoFrameReferences(videoGenerationConfig.model, channelProtocolForConfig(videoGenerationConfig));
                    const firstFrame = frameReferencesEnabled ? generationContext.firstFrame : null;
                    const lastFrame = frameReferencesEnabled ? generationContext.lastFrame : null;
                    const videoReferenceImages = frameReferencesEnabled || isAutoDLConfig(videoGenerationConfig) ? generationContext.referenceImages : [...generationContext.referenceImages, ...[generationContext.firstFrame, generationContext.lastFrame].filter((image): image is ReferenceImage => Boolean(image))];
                    const spec = nodeSizeFromRatio(videoGenerationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && (overwriteExisting || !sourceNode.metadata?.content);
                    const videoId = isEmptyVideoNode ? nodeId : nanoid();
                    const clientTaskId = `client_video_task_${nanoid()}`;
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoNode: CanvasNodeData = {
                        id: videoId,
                        type: CanvasNodeType.Video,
                        title: effectivePrompt.slice(0, 32) || "Generated Video",
                        position: isEmptyVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
                        width: isEmptyVideoNode ? sourceNode.width : spec.width,
                        height: isEmptyVideoNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, cameraControl: sourceNode?.metadata?.cameraControl, status: NODE_STATUS_LOADING, model: videoGenerationConfig.model, channelId: videoGenerationConfig.videoChannelId || videoGenerationConfig.activeChannelId, workflowRef, size: videoGenerationConfig.size, seconds: videoGenerationConfig.videoSeconds, vquality: videoGenerationConfig.vquality, mode: videoGenerationConfig.videoMode, negativePrompt: videoGenerationConfig.videoNegativePrompt, multiShot: videoGenerationConfig.videoMultiShot, shotType: videoGenerationConfig.videoShotType, generateAudio: videoGenerationConfig.videoGenerateAudio, characterOrientation: videoGenerationConfig.videoCharacterOrientation, watermark: videoGenerationConfig.videoWatermark, references: generationReferenceUrls({ ...generationContext, referenceImages: videoReferenceImages, firstFrame, lastFrame }), firstFrameNodeId: sourceNode?.metadata?.firstFrameNodeId, lastFrameNodeId: sourceNode?.metadata?.lastFrameNodeId, klingImageNodeIds: sourceNode?.metadata?.klingImageNodeIds, klingMultiPrompt: sourceNode?.metadata?.klingMultiPrompt, klingElementList: sourceNode?.metadata?.klingElementList, startedAt: generationStartedAt, progress: 0, clientTaskId, videoTaskId: clientTaskId },
                    };
                    pendingChildIds = [videoId];
                    setNodes((prev) => (isEmptyVideoNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode, ...(overwriteExisting ? { position: node.position, width: node.width, height: node.height, metadata: { ...node.metadata, ...videoNode.metadata, taskBackend: undefined, videoTaskVideoId: undefined, videoTaskTranslation: undefined } } : {}) } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode]));
                    if (!isEmptyVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    submittedTask = { nodeId: videoId, id: clientTaskId };
                    const videoTask = await submitNodeTask(videoId, clientTaskId, async (signal, onServerTask) => workflowRef
                        ? await workflowVideoTask(await submitCanvasWorkflowTask(workflowRef, videoGenerationConfig, "video", requestPrompt, [firstFrame, ...videoReferenceImages, lastFrame].filter((image): image is ReferenceImage => Boolean(image)), generationContext.referenceVideos, generationContext.referenceAudios, videoId, projectId, clientTaskId, () => onServerTask("workflow"), signal))
                        : (await createVideoGenerationTask(videoGenerationConfig, requestPrompt, { references: videoReferenceImages, firstFrame, lastFrame, videoReferences: generationContext.referenceVideos, audioReferences: generationContext.referenceAudios }, undefined, { signal, onServerTask, clientTaskId, source: "canvas", sourceId: videoId })).task, overwriteExisting ? runningRequest : undefined);
                    if (!isNodeTaskActive(videoId, clientTaskId)) return;
                    setNodes((prev) => applyCanvasVideoTaskUpdate(prev, videoId, videoTask, videoGenerationConfig, generationStartedAt, spec, clientTaskId));
                    return;
                }

                if (mode === "audio") {
                    const workflowAudios = workflowRef ? generationContext.referenceAudios : [];
                    const referenceAudio = workflowRef ? undefined : selectAudioReference(generationConfig, sourceNode?.metadata, generationContext.referenceAudios);
                    if (preparingRun?.preparing === runningRequest) delete preparingRun.preparing;
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && (overwriteExisting || !sourceNode.metadata?.content);
                    const audioId = isEmptyAudioNode ? nodeId : nanoid();
                    const clientAudioTaskId = `client_audio_task_${nanoid()}`;
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: isEmptyAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
                        width: isEmptyAudioNode ? sourceNode.width : spec.width,
                        height: isEmptyAudioNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, startedAt: generationStartedAt, progress: 0, clientTaskId: clientAudioTaskId, audioTaskId: clientAudioTaskId, ...buildAudioGenerationMetadata(generationConfig, sourceNode?.metadata), workflowRef },
                    };
                    pendingChildIds = [audioId];
                    setNodes((prev) => (isEmptyAudioNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode, ...(overwriteExisting ? { position: node.position, width: node.width, height: node.height, metadata: { ...node.metadata, ...audioNode.metadata, taskBackend: undefined, audioTaskResultId: undefined } } : {}) } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode]));
                    if (!isEmptyAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    submittedTask = { nodeId: audioId, id: clientAudioTaskId };
                    const task = await submitNodeTask(audioId, clientAudioTaskId, async (signal, onServerTask) => workflowRef
                        ? await workflowAudioTask(await submitCanvasWorkflowTask(workflowRef, generationConfig, "audio", effectivePrompt, [], [], workflowAudios, audioId, projectId, clientAudioTaskId, () => onServerTask("workflow"), signal))
                        : await createCanvasAudioTask(generationConfig, effectivePrompt, { signal, onServerTask, nodeId: audioId, sourceId: projectId, clientTaskId: clientAudioTaskId }, referenceAudio), overwriteExisting ? runningRequest : undefined);
                    if (!isNodeTaskActive(audioId, clientAudioTaskId)) return;
                    setNodes((prev) => applyCanvasAudioTaskUpdate(prev, audioId, task, generationStartedAt, clientAudioTaskId));
                    return;
                }

                let streamed = "";
                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = isConfigNode ? getGenerationCount(generationConfig.count) : 1;
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const childIds = isConfigNode || editingTextNode ? Array.from({ length: textCount }, () => nanoid()) : [];
                pendingChildIds = childIds;
                if (isConfigNode || editingTextNode) {
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Text,
                        title: effectivePrompt.slice(0, 32) || "Generated Text",
                        position: {
                            x: parentPosition.x + parentConfig.width + 96,
                            y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
                        },
                        width: textConfig.width,
                        height: textConfig.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, fontSize: 14, clientTaskId: textTaskId },
                    }));
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                    setConnections((prev) => [...prev, ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }))]);
                }

                const answers = await Promise.all(
                    (childIds.length ? childIds : [nodeId]).map((targetNodeId) => {
                        let localStreamed = "";
                        return submitNodeTask(targetNodeId, textTaskId, async (signal) => ({ id: textTaskId, status: "completed", text: await requestImageQuestion(generationConfig, buildNodeChatMessages({ ...generationContext, prompt: effectivePrompt }), (text) => {
                            localStreamed = text;
                            streamed = text;
                            setNodes((prev) => isNodeTaskActive(targetNodeId, textTaskId) && prev.some((node) => node.id === targetNodeId && node.metadata?.clientTaskId === textTaskId) ? prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: text, status: NODE_STATUS_LOADING } } : node)) : prev);
                        }, signal) }), overwriteExisting ? runningRequest : undefined).then((task) => ({ nodeId: targetNodeId, content: task.text || localStreamed })).catch((error) => {
                            if (!isNodeTaskActive(targetNodeId, textTaskId)) return { nodeId: targetNodeId, content: "" };
                            throw error;
                        });
                    }),
                );
                const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
                setNodes((prev) =>
                    prev.some((node) => (node.id === nodeId && isConfigNode) || (node.metadata?.clientTaskId === textTaskId && isNodeTaskActive(node.id, textTaskId))) ? prev.map((node) =>
                        (node.id !== nodeId || !isConfigNode) && (node.metadata?.clientTaskId !== textTaskId || !isNodeTaskActive(node.id, textTaskId)) ? node
                            : childIds.includes(node.id)
                            ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                            : node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                                : node.id === nodeId && !editingTextNode
                                    ? { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Generated Text", metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                                    : node,
                    ) : prev,
                );
            } catch (error) {
                if (submittedTask && !isNodeTaskActive(submittedTask.nodeId, submittedTask.id)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => {
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    if (mode === "text" && !prev.some((node) => (node.id === nodeId && isConfigNode)
                        || (node.metadata?.clientTaskId === textTaskId && isNodeTaskActive(node.id, textTaskId)))) return prev;
                    return prev.map((node) => {
                        if (mode === "text" && (node.id !== nodeId || !isConfigNode)
                            && (node.metadata?.clientTaskId !== textTaskId || !isNodeTaskActive(node.id, textTaskId))) return node;
                        if (node.id !== nodeId && !pendingChildIds.includes(node.id)) return node;
                        if (node.id === nodeId && !markSourceStatus) return node;
                        return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } };
                    });
                });
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [cancelPendingHistoryCommit, effectiveConfig, openConfigDialog, openOverlay, isNodeTaskActive, submitNodeTask, handleStopNode, isAiConfigReady, message, nodeTaskRunsRef, projectId, runningRequestRef, selectOnly, setRunningNodeId, setSelectedConnectionId, connectionsRef, nodesRef, setConnections, setNodes],
    );

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const retryWorkflowRef = node.metadata?.workflowRef;
            const batchPrimaryId = retryWorkflowRef && isCanvasImageNodeType(node.type) && node.metadata?.isBatchRoot ? node.metadata.primaryImageId : undefined;
            const retryTargetId = batchPrimaryId && nodesRef.current.some((item) => item.id === batchPrimaryId) ? batchPrimaryId : node.id;
            const retryBatchRootId = isCanvasImageNodeType(node.type) ? (retryTargetId === node.id ? node.metadata?.batchRootId : node.id) : undefined;
            const retryBatchRoot = retryBatchRootId ? nodesRef.current.find((item) => item.id === retryBatchRootId) : null;
            const retryMirrorsRoot = retryBatchRoot?.metadata?.primaryImageId === retryTargetId;
            const isPanorama = isPanoramaNodeType(node.type);
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = isCanvasImageNodeType(node.type) ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                        ...effectiveConfig,
                        model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                        imageChannelId: savedImageMetadata.channelId || effectiveConfig.imageChannelId,
                        activeChannelId: savedImageMetadata.channelId || effectiveConfig.imageChannelId,
                        quality: savedImageMetadata.quality || effectiveConfig.quality,
                        size: isPanorama ? PANORAMA_IMAGE_SIZE : savedImageMetadata.size || effectiveConfig.size,
                        count: "1",
                    }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (retryWorkflowRef && !useUserStore.getState().token) {
                message.error("工作流生成需要先登录");
                return;
            }
            if (!retryWorkflowRef && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (isPanorama ? savedImageMetadata?.panoramaFinalPrompt || "" : savedImageMetadata?.prompt || context?.prompt || "").trim();
            const retryNegativePrompt = !isPanorama && isCanvasImageNodeType(node.type)
                ? resolveImageNegativePrompt(prompt, savedImageMetadata?.negativePrompt || node.metadata?.negativePrompt, (savedImageMetadata?.autoNegativePrompt ?? node.metadata?.autoNegativePrompt) !== false)
                : "";
            const retryCameraPrompt = isPanorama ? prompt : applyCameraPrompt(prompt, savedImageMetadata?.cameraControl || node.metadata?.cameraControl);
            const requestPrompt = appendImageNegativePrompt(retryCameraPrompt, retryNegativePrompt);
            if (!prompt && !retryWorkflowRef && !(node.type === CanvasNodeType.Video && isAutoDLConfig(generationConfig))) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            const retryImages = retryReferenceImages || [];

            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(node.id);
            const retryStartedAt = Date.now();
            const retrySuffix = nanoid();
            const retryVideoTaskId = node.type === CanvasNodeType.Video ? `client_video_task_${retrySuffix}` : "";
            const retryImageTaskId = isCanvasImageNodeType(node.type) ? `client_image_task_${retrySuffix}` : "";
            const retryAudioTaskId = node.type === CanvasNodeType.Audio ? `client_audio_task_${retrySuffix}` : "";
            const retryClientTaskId = retryVideoTaskId || retryImageTaskId || retryAudioTaskId || (node.type === CanvasNodeType.Text ? `client_text_task_${retrySuffix}` : "");
            setNodes((prev) => prev.map((item) => {
                const isRetryTarget = item.id === retryTargetId;
                if (!isRetryTarget && !(retryMirrorsRoot && item.id === retryBatchRootId)) return item;
                return { ...item, metadata: { ...item.metadata, clientTaskId: isRetryTarget ? retryClientTaskId || undefined : undefined, taskBackend: undefined, status: NODE_STATUS_LOADING, errorDetails: undefined, content: undefined, storageKey: "", progress: 0, startedAt: retryStartedAt, ...(item.type === CanvasNodeType.Video ? { videoTaskId: retryVideoTaskId, videoTaskVideoId: undefined, videoTaskTranslation: undefined } : {}), ...(isCanvasImageNodeType(item.type) ? { imageTaskId: isRetryTarget || retryMirrorsRoot && !retryWorkflowRef ? retryImageTaskId : undefined, imageTaskResultId: undefined } : {}), ...(item.type === CanvasNodeType.Audio ? { audioTaskId: retryAudioTaskId, audioTaskResultId: undefined } : {}) } };
            }));

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const task = await submitNodeTask(node.id, retryClientTaskId, async (signal) => ({ id: retryClientTaskId, status: "completed", text: await requestImageQuestion(generationConfig, buildNodeChatMessages({ ...context, prompt }), (text) => {
                        streamed = text;
                        setNodes((prev) => isNodeTaskActive(node.id, retryClientTaskId) && prev.some((item) => item.id === node.id && item.metadata?.clientTaskId === retryClientTaskId) ? prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)) : prev);
                    }, signal) }));
                    setNodes((prev) => isNodeTaskActive(node.id, retryClientTaskId) && prev.some((item) => item.id === node.id && item.metadata?.clientTaskId === retryClientTaskId) ? prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: task.text || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)) : prev);
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const videoGenerationConfig = retryWorkflowRef ? generationConfig : context ? withCanvasVideoAdvancedConfig(generationConfig, context) : generationConfig;
                    const frameReferencesEnabled = Boolean(retryWorkflowRef) || supportsVideoFrameReferences(videoGenerationConfig.model, channelProtocolForConfig(videoGenerationConfig));
                    const firstFrame = frameReferencesEnabled ? context?.firstFrame || null : null;
                    const lastFrame = frameReferencesEnabled ? context?.lastFrame || null : null;
                    const references = frameReferencesEnabled || isAutoDLConfig(videoGenerationConfig) ? retryImages : [...retryImages, ...[context?.firstFrame, context?.lastFrame].filter((image): image is ReferenceImage => Boolean(image))];
                    const task = await submitNodeTask(node.id, retryVideoTaskId, async (signal, onServerTask) => retryWorkflowRef
                        ? await workflowVideoTask(await submitCanvasWorkflowTask(retryWorkflowRef, videoGenerationConfig, "video", requestPrompt, [firstFrame, ...references, lastFrame].filter((image): image is ReferenceImage => Boolean(image)), context?.referenceVideos || [], context?.referenceAudios || [], node.id, projectId, retryVideoTaskId, () => onServerTask("workflow"), signal))
                        : (await createVideoGenerationTask(videoGenerationConfig, requestPrompt, { references, firstFrame, lastFrame, videoReferences: context?.referenceVideos || [], audioReferences: context?.referenceAudios || [] }, undefined, { signal, onServerTask, clientTaskId: retryVideoTaskId, source: "canvas", sourceId: node.id })).task);
                    if (!isNodeTaskActive(node.id, retryVideoTaskId)) return;
                    setNodes((prev) => applyCanvasVideoTaskUpdate(prev, node.id, task, videoGenerationConfig, retryStartedAt, { width: node.width, height: node.height }, retryVideoTaskId));
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const workflowAudios = retryWorkflowRef ? context?.referenceAudios || [] : [];
                    const referenceAudio = retryWorkflowRef ? undefined : selectAudioReference(generationConfig, sourceNode?.metadata, context?.referenceAudios || []);
                    const task = await submitNodeTask(node.id, retryAudioTaskId, async (signal, onServerTask) => retryWorkflowRef
                        ? await workflowAudioTask(await submitCanvasWorkflowTask(retryWorkflowRef, generationConfig, "audio", prompt, [], [], workflowAudios, node.id, projectId, retryAudioTaskId, () => onServerTask("workflow"), signal))
                        : await createCanvasAudioTask(generationConfig, prompt, { signal, onServerTask, nodeId: node.id, sourceId: projectId, clientTaskId: retryAudioTaskId }, referenceAudio));
                    if (!isNodeTaskActive(node.id, retryAudioTaskId)) return;
                    setNodes((prev) => applyCanvasAudioTaskUpdate(prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, prompt, ...buildAudioGenerationMetadata(generationConfig, sourceNode?.metadata) } } : item)), node.id, task, retryStartedAt, retryAudioTaskId));
                    return;
                }

                const task = await submitNodeTask(retryTargetId, retryImageTaskId, async (signal, onServerTask) => retryWorkflowRef
                    ? await workflowImageTask(await submitCanvasWorkflowTask(retryWorkflowRef, generationConfig, "image", requestPrompt, useReferenceImages ? retryImages : [], [], [], retryTargetId, projectId, retryImageTaskId, () => onServerTask("workflow"), signal))
                    : await createCanvasImageTask({ ...generationConfig, quality: isPanorama && generationConfig.quality === "auto" ? "medium" : generationConfig.quality }, requestPrompt, useReferenceImages ? retryImages : [], { signal, onServerTask, nodeId: node.id, sourceId: projectId, clientTaskId: retryImageTaskId }));
                if (!isNodeTaskActive(retryTargetId, retryImageTaskId)) return;
                const generationMetadata = savedImageMetadata?.generationType
                    ? { generationType: savedImageMetadata.generationType, model: generationConfig.model, channelId: generationConfig.imageChannelId || generationConfig.activeChannelId, size: generationConfig.size, quality: generationConfig.quality, count: savedImageMetadata.count || 1, references: savedImageMetadata.references }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                setNodes((prev) => {
                    if (!isNodeTaskActive(retryTargetId, retryImageTaskId)) return prev;
                    let next = prev.map((item) =>
                        item.id === retryTargetId
                            ? {
                                ...item,
                                type: isPanoramaNodeType(item.type) ? CanvasNodeType.Panorama : CanvasNodeType.Image,
                                metadata: {
                                    ...item.metadata,
                                    ...(isPanoramaNodeType(item.type) ? { prompt: item.metadata?.panoramaSourcePrompt || item.metadata?.prompt || "", panoramaSourcePrompt: item.metadata?.panoramaSourcePrompt || item.metadata?.prompt || "", panoramaFinalPrompt: prompt, panoramaProjection: undefined } : { prompt }),
                                    ...generationMetadata,
                                    imageTaskId: task.id,
                                    imageTaskResultId: undefined,
                                    startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || retryStartedAt,
                                    progress: task.progress || 0,
                                    errorDetails: undefined,
                                },
                            }
                            : item,
                    );
                    if (task.source === "workflow" || task.image_url || task.url) next = applyCanvasImageTaskUpdate(next, retryTargetId, task, retryStartedAt, { width: node.width, height: node.height }, retryImageTaskId);
                    if (retryMirrorsRoot && retryBatchRootId && task.source !== "workflow" && (task.image_url || task.url)) next = applyCanvasImageTaskUpdate(next, retryBatchRootId, task, retryStartedAt, { width: node.width, height: node.height });
                    return next;
                });
                if (task.source === "workflow" || task.image_url || task.url) setConnections((prev) => isNodeTaskActive(retryTargetId, retryImageTaskId) ? applyCanvasImageTaskConnections(prev, retryTargetId, task, retryBatchRootId) : prev);
            } catch (error) {
                if (retryClientTaskId && !isNodeTaskActive(retryTargetId, retryClientTaskId)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                if (retryWorkflowRef && isCanvasImageNodeType(node.type)) {
                    const failedTask: CanvasImageTask = { id: retryImageTaskId, source: "workflow", status: "failed", error: { message: errorDetails } };
                    setNodes((prev) => applyCanvasImageTaskUpdate(prev, retryTargetId, failedTask, retryStartedAt, { width: node.width, height: node.height }, retryImageTaskId));
                    setConnections((prev) => isNodeTaskActive(retryTargetId, retryImageTaskId) ? applyCanvasImageTaskConnections(prev, retryTargetId, failedTask, retryBatchRootId) : prev);
                } else {
                    setNodes((prev) => node.type !== CanvasNodeType.Text || (isNodeTaskActive(node.id, retryClientTaskId) && prev.some((item) => item.id === node.id && item.metadata?.clientTaskId === retryClientTaskId)) ? prev.map((item) => (item.id === retryTargetId || (retryMirrorsRoot && item.id === retryBatchRootId) ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)) : prev);
                }
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [effectiveConfig, message, openConfigDialog, projectId, isNodeTaskActive, submitNodeTask, isAiConfigReady, runningRequestRef, setRunningNodeId, connectionsRef, nodesRef, setConnections, setNodes],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            selectOnly(configNode.id);
            setSelectedConnectionId(null);
            openOverlay({ kind: "prompt", nodeId: configNode.id });
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, openOverlay, selectOnly, setSelectedConnectionId, connectionsRef, nodesRef, setConnections, setNodes],
    );

    const runNodeGenerate = useCallback(
        (node: CanvasNodeData) => {
            if (node.metadata?.status === "error" || node.metadata?.status === "stopped") {
                void handleRetryNode(node);
                return;
            }
            if (node.type === CanvasNodeType.Text) {
                generateImageFromTextNode(node);
                return;
            }
            const mode: CanvasNodeGenerationMode = node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : node.type === CanvasNodeType.Config ? node.metadata?.generationMode || "image" : "image";
            const prompt = node.type === CanvasNodeType.Panorama ? node.metadata?.panoramaSourcePrompt || "" : node.type === CanvasNodeType.Config ? node.metadata?.composerContent ?? node.metadata?.prompt ?? "" : node.metadata?.prompt ?? "";
            void handleGenerateNode(node.id, mode, prompt);
        },
        [generateImageFromTextNode, handleGenerateNode, handleRetryNode],
    );

    return {
        handleGenerateNode,
        handleRetryNode,
        createImageReversePromptNodes,
        cropImageNode,
        splitImageNode,
        maskEditImageNode,
        upscaleImageNode,
        generateAngleNode,
        generateImageFromTextNode,
        runNodeGenerate,
    };
}

const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}
