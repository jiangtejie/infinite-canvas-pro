"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CanvasAudioTask } from "@/services/api/audio";
import { pollCanvasAudioTaskStatus } from "@/services/api/audio";
import type { CanvasImageTask } from "@/services/api/image";
import { pollCanvasImageTaskStatus } from "@/services/api/image";
import { VIDEO_POLL_INTERVAL_MS, pollVideoGenerationTaskStatus, type VideoResponse } from "@/services/api/video";
import { getWorkflowTask } from "@/services/api/workflow-generation";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { buildGenerationConfig } from "../lib/canvas-generation-config";
import { NODE_STATUS_LOADING } from "../lib/canvas-node-constants";
import { canvasVideoTaskFromMetadata, canvasVideoTaskId } from "../lib/canvas-task-helpers";
import { applyCanvasAudioTaskUpdate, applyCanvasImageTaskConnections, applyCanvasImageTaskUpdate, applyCanvasVideoTaskUpdate } from "../lib/canvas-task-updates";
import { workflowAudioTask, workflowImageTask, workflowVideoTask } from "../lib/canvas-workflow-tasks";

type UseCanvasTaskPollingOptions = {
    projectLoaded: boolean;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    effectiveConfig: AiConfig;
    handleStopNode: (nodeId: string) => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    rememberNodeTask: <T extends CanvasImageTask | CanvasAudioTask | VideoResponse>(nodeId: string, id: string | undefined, task: T) => T;
    isNodeTaskActive: (nodeId: string, id?: string) => boolean;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    pollingVideoNodeIdsRef: MutableRefObject<Map<string, AbortController>>;
    pollingImageNodeIdsRef: MutableRefObject<Map<string, AbortController>>;
    pollingAudioNodeIdsRef: MutableRefObject<Map<string, AbortController>>;
};

/**
 * 画布任务轮询：停止中的节点继续停止，加载中的视频 / 图片 / 音频按各自接口拉取并合并。
 */
export function useCanvasTaskPolling({ projectLoaded, nodesRef, effectiveConfig, handleStopNode, isAiConfigReady, rememberNodeTask, isNodeTaskActive, setNodes, setConnections, pollingVideoNodeIdsRef, pollingImageNodeIdsRef, pollingAudioNodeIdsRef }: UseCanvasTaskPollingOptions) {
    useEffect(() => {
        if (!projectLoaded) return;
        const pollCanvasTasks = () => {
            nodesRef.current.filter((node) => node.metadata?.status === "stopping" && !node.metadata.errorDetails).forEach((node) => { void handleStopNode(node.id); });
            const videoTargets = nodesRef.current.filter((node) => node.type === CanvasNodeType.Video && node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content && canvasVideoTaskId(node.metadata));
            videoTargets.forEach((node) => {
                if (pollingVideoNodeIdsRef.current.has(node.id)) return;
                const taskId = canvasVideoTaskId(node.metadata);
                const workflowToken = node.metadata?.workflowRef ? useUserStore.getState().token : "";
                const generationConfig = buildGenerationConfig(effectiveConfig, node, "video");
                if (!taskId || (!node.metadata?.workflowRef && !isAiConfigReady(generationConfig, generationConfig.model))) return;
                const controller = new AbortController();
                pollingVideoNodeIdsRef.current.set(node.id, controller);
                void (node.metadata?.workflowRef
                    ? getWorkflowTask(workflowToken, taskId, controller.signal).then((task) => workflowVideoTask(task, workflowToken))
                    : pollVideoGenerationTaskStatus(generationConfig, canvasVideoTaskFromMetadata(node.metadata), controller.signal))
                    .then((result) => {
                        if (controller.signal.aborted) return;
                        const task = rememberNodeTask(node.id, node.metadata?.clientTaskId, result);
                        if (!isNodeTaskActive(node.id, node.metadata?.clientTaskId)) return;
                        setNodes((prev) => applyCanvasVideoTaskUpdate(prev, node.id, task, generationConfig, node.metadata?.startedAt || Date.now(), { width: node.width, height: node.height }, node.metadata?.clientTaskId));
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        pollingVideoNodeIdsRef.current.delete(node.id);
                    });
            });
            const imageTargets = nodesRef.current.filter((node) => isCanvasImageNodeType(node.type) && node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content && node.metadata.imageTaskId);
            imageTargets.forEach((node) => {
                if (pollingImageNodeIdsRef.current.has(node.id) || !node.metadata?.imageTaskId) return;
                const workflowToken = node.metadata.workflowRef ? useUserStore.getState().token : "";
                const controller = new AbortController();
                pollingImageNodeIdsRef.current.set(node.id, controller);
                void (node.metadata.workflowRef
                    ? getWorkflowTask(workflowToken, node.metadata.imageTaskId, controller.signal).then((task) => workflowImageTask(task, workflowToken))
                    : pollCanvasImageTaskStatus(node.metadata.imageTaskId, controller.signal))
                    .then((result) => {
                        if (controller.signal.aborted) return;
                        const task = rememberNodeTask(node.metadata?.clientTaskId ? node.id : node.metadata?.primaryImageId || node.id, node.metadata?.clientTaskId || node.metadata?.imageTaskId, result);
                        if (!node.metadata?.isBatchRoot && !isNodeTaskActive(node.id, node.metadata?.clientTaskId)) return;
                        setNodes((prev) => applyCanvasImageTaskUpdate(prev, node.id, task, node.metadata?.startedAt || Date.now(), { width: node.width, height: node.height }, node.metadata?.clientTaskId));
                        setConnections((prev) => node.metadata?.isBatchRoot || isNodeTaskActive(node.id, node.metadata?.clientTaskId) ? applyCanvasImageTaskConnections(prev, node.id, task, node.metadata?.batchRootId) : prev);
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        pollingImageNodeIdsRef.current.delete(node.id);
                    });
            });
            const audioTargets = nodesRef.current.filter((node) => node.type === CanvasNodeType.Audio && node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content && node.metadata.audioTaskId);
            audioTargets.forEach((node) => {
                if (pollingAudioNodeIdsRef.current.has(node.id) || !node.metadata?.audioTaskId) return;
                const workflowToken = node.metadata.workflowRef ? useUserStore.getState().token : "";
                const controller = new AbortController();
                pollingAudioNodeIdsRef.current.set(node.id, controller);
                void (node.metadata.workflowRef
                    ? getWorkflowTask(workflowToken, node.metadata.audioTaskId, controller.signal).then((task) => workflowAudioTask(task, workflowToken))
                    : pollCanvasAudioTaskStatus(node.metadata.audioTaskId, controller.signal))
                    .then((task) => {
                        if (controller.signal.aborted) return;
                        rememberNodeTask(node.id, node.metadata?.clientTaskId, task);
                        if (!isNodeTaskActive(node.id, node.metadata?.clientTaskId)) return;
                        setNodes((prev) => applyCanvasAudioTaskUpdate(prev, node.id, task, node.metadata?.startedAt || Date.now(), node.metadata?.clientTaskId));
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        pollingAudioNodeIdsRef.current.delete(node.id);
                    });
            });
        };
        pollCanvasTasks();
        const timer = window.setInterval(pollCanvasTasks, VIDEO_POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [effectiveConfig, handleStopNode, isAiConfigReady, isNodeTaskActive, nodesRef, pollingAudioNodeIdsRef, pollingImageNodeIdsRef, pollingVideoNodeIdsRef, projectLoaded, rememberNodeTask, setConnections, setNodes]);
}
