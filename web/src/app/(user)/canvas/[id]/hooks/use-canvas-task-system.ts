"use client";

import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasConnection, CanvasNodeData } from "../../types";
import { useCanvasTaskControl } from "./use-canvas-task-control";
import { useCanvasTaskPolling } from "./use-canvas-task-polling";
import { useCanvasTaskRunner } from "./use-canvas-task-runner";
import type { CanvasNodeTaskRun } from "./use-canvas-tasks";

type CanvasTaskSystemOptions = {
    projectLoaded: boolean;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    historyRef: MutableRefObject<{ past: Array<{ nodes: CanvasNodeData[] }>; future: Array<{ nodes: CanvasNodeData[] }> }>;
    lastHistoryRef: MutableRefObject<{ nodes: CanvasNodeData[] } | null>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    effectiveConfig: AiConfig;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    onError: (message: string) => void;
};

/**
 * 画布任务系统门面：注册表、提交、停止、轮询与轮询 ref 统一在这里组合。
 */
export function useCanvasTaskSystem({ projectLoaded, nodesRef, historyRef, lastHistoryRef, setNodes, setConnections, effectiveConfig, isAiConfigReady, onError }: CanvasTaskSystemOptions) {
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const runningRequestRef = useRef<symbol | null>(null);
    const nodeTaskRunsRef = useRef(new Map<string, CanvasNodeTaskRun>());
    const pollingVideoNodeIdsRef = useRef(new Map<string, AbortController>());
    const pollingImageNodeIdsRef = useRef(new Map<string, AbortController>());
    const pollingAudioNodeIdsRef = useRef(new Map<string, AbortController>());

    const { rememberNodeTask, submitNodeTask, isNodeTaskActive } = useCanvasTaskRunner({ nodeTaskRunsRef, setNodes });
    const { handleStopNode } = useCanvasTaskControl({ nodeTaskRunsRef, nodesRef, historyRef, lastHistoryRef, setNodes, pollingImageNodeIdsRef, pollingVideoNodeIdsRef, pollingAudioNodeIdsRef, onError });
    useCanvasTaskPolling({ projectLoaded, nodesRef, effectiveConfig, handleStopNode, isAiConfigReady, rememberNodeTask, isNodeTaskActive, setNodes, setConnections, pollingVideoNodeIdsRef, pollingImageNodeIdsRef, pollingAudioNodeIdsRef });

    const abortNodePolling = useCallback((nodeId: string) => {
        pollingImageNodeIdsRef.current.get(nodeId)?.abort();
        pollingVideoNodeIdsRef.current.get(nodeId)?.abort();
        pollingAudioNodeIdsRef.current.get(nodeId)?.abort();
    }, []);

    return { runningNodeId, setRunningNodeId, runningRequestRef, nodeTaskRunsRef, rememberNodeTask, submitNodeTask, isNodeTaskActive, handleStopNode, abortNodePolling };
}
