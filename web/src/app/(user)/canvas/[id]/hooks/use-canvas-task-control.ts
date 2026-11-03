"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { stopCanvasTask } from "@/services/api/canvas-tasks";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { NODE_STATUS_LOADING } from "../lib/canvas-node-constants";
import type { CanvasNodeTaskRun } from "./use-canvas-tasks";

type CanvasTaskHistoryRef = MutableRefObject<{ past: Array<{ nodes: CanvasNodeData[] }>; future: Array<{ nodes: CanvasNodeData[] }> }>;

type UseCanvasTaskControlOptions = {
    nodeTaskRunsRef: MutableRefObject<Map<string, CanvasNodeTaskRun>>;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    historyRef: CanvasTaskHistoryRef;
    lastHistoryRef: MutableRefObject<{ nodes: CanvasNodeData[] } | null>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    pollingImageNodeIdsRef: MutableRefObject<Map<string, AbortController>>;
    pollingVideoNodeIdsRef: MutableRefObject<Map<string, AbortController>>;
    pollingAudioNodeIdsRef: MutableRefObject<Map<string, AbortController>>;
    onError: (message: string) => void;
};

/**
 * 停止任务：先请求服务端停止，失败则回退 loading，成功后 abort 本地请求并同步历史快照。
 */
export function useCanvasTaskControl({ nodeTaskRunsRef, nodesRef, historyRef, lastHistoryRef, setNodes, pollingImageNodeIdsRef, pollingVideoNodeIdsRef, pollingAudioNodeIdsRef, onError }: UseCanvasTaskControlOptions) {
    const handleStopNode = useCallback(async (nodeId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        const id = nodeTaskRunsRef.current.get(nodeId)?.id || node?.metadata?.clientTaskId;
        if (!node || !id || node.metadata?.isBatchRoot || (node.metadata?.status !== "loading" && node.metadata?.status !== "stopping" && !nodeTaskRunsRef.current.get(nodeId)?.submission)) return;
        const kind = isCanvasImageNodeType(node.type) ? "image" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : node.type === CanvasNodeType.Text ? "text" : null;
        if (!kind) return;
        const run: CanvasNodeTaskRun = nodeTaskRunsRef.current.get(nodeId) || { id, controller: new AbortController(), backend: node.metadata?.taskBackend };
        if (run.id !== id || run.stopping) return;
        nodeTaskRunsRef.current.set(nodeId, run);
        nodeTaskRunsRef.current.set(`${nodeId}:${id}`, run);
        run.stopping = true;
        const updateTaskNodes = (update: (items: CanvasNodeData[]) => CanvasNodeData[]) => {
            const apply = (items: CanvasNodeData[]) => items.some((item) => item.id === nodeId && item.metadata?.clientTaskId === id) ? update(items) : items;
            setNodes(apply);
            for (const entry of [...historyRef.current.past, ...historyRef.current.future, ...(lastHistoryRef.current ? [lastHistoryRef.current] : [])]) entry.nodes = apply(entry.nodes);
        };
        const root = nodesRef.current.find((item) => item.id === node.metadata?.batchRootId && item.metadata?.isBatchRoot && item.metadata.primaryImageId === nodeId && !(item.metadata.clientTaskId && item.metadata.imageTaskId === item.metadata.clientTaskId && [NODE_STATUS_LOADING, "stopping"].includes(item.metadata.status || "")));
        updateTaskNodes((prev) => prev.map((item) => (item.id === nodeId && item.metadata?.clientTaskId === id) || (item.id === root?.id && item.metadata?.primaryImageId === nodeId && item.metadata?.imageTaskId === root?.metadata?.imageTaskId) ? { ...item, metadata: { ...item.metadata, status: "stopping", errorDetails: undefined } } : item));
        try {
            if (run.backend && kind !== "text") {
                if (kind !== "video" || run.backend === "workflow") await run.submission?.catch(() => undefined);
                const result = await stopCanvasTask(kind, id, run.backend === "workflow");
                if (!result.stopped) {
                    updateTaskNodes((prev) => prev.map((item) =>
                        ((item.id === nodeId && item.metadata?.clientTaskId === id)
                            || (item.id === root?.id && item.metadata?.primaryImageId === nodeId && item.metadata?.imageTaskId === root?.metadata?.imageTaskId))
                            && item.metadata?.status === "stopping"
                            ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, ...(item.id === nodeId && run.backend === "workflow" && run.task?.id ? { [`${kind}TaskId`]: run.task.id } : {}) } }
                            : item,
                    ));
                    return;
                }
            }
            run.controller.abort();
            pollingImageNodeIdsRef.current.get(nodeId)?.abort();
            if (root && nodesRef.current.some((item) => item.id === root.id && item.metadata?.imageTaskId === root.metadata?.imageTaskId)) pollingImageNodeIdsRef.current.get(root.id)?.abort();
            pollingVideoNodeIdsRef.current.get(nodeId)?.abort();
            pollingAudioNodeIdsRef.current.get(nodeId)?.abort();
            updateTaskNodes((prev) => prev.map((item) => ((item.id === nodeId && item.metadata?.clientTaskId === id && item.metadata?.status === "stopping") || (item.id === root?.id && item.metadata?.primaryImageId === nodeId && item.metadata.imageTaskId === root?.metadata?.imageTaskId && item.metadata.status === "stopping")) ? { ...item, metadata: { ...item.metadata, ...(item.metadata?.batchRootId ? { count: 1 } : {}), status: "stopped", durationMs: Date.now() - (item.metadata?.startedAt || Date.now()), errorDetails: undefined } } : item));
        } catch (error) {
            const errorDetails = error instanceof Error ? error.message : "停止失败，请重试停止";
            onError(errorDetails);
            updateTaskNodes((prev) => prev.map((item) => (item.id === nodeId && item.metadata?.clientTaskId === id) || (item.id === root?.id && item.metadata?.primaryImageId === nodeId && item.metadata?.imageTaskId === root?.metadata?.imageTaskId && item.metadata.status === "stopping") ? { ...item, metadata: { ...item.metadata, errorDetails } } : item));
        } finally {
            run.stopping = false;
        }
    }, [historyRef, lastHistoryRef, nodeTaskRunsRef, nodesRef, onError, pollingAudioNodeIdsRef, pollingImageNodeIdsRef, pollingVideoNodeIdsRef, setNodes]);

    return { handleStopNode };
}
