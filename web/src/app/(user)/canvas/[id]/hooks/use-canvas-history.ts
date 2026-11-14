"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CanvasAudioTask } from "@/services/api/audio";
import type { CanvasImageTask } from "@/services/api/image";
import type { VideoResponse } from "@/services/api/video";
import { collectImageStorageKeys } from "@/lib/storage-reference-keys";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { buildGenerationConfig } from "../lib/canvas-generation-config";
import { NODE_STATUS_LOADING } from "../lib/canvas-node-constants";
import { applyCanvasAudioTaskUpdate, applyCanvasImageTaskConnections, applyCanvasImageTaskUpdate, applyCanvasVideoTaskUpdate, fitCanvasMediaNode } from "../lib/canvas-task-updates";
import type { CanvasNodeTaskRun } from "./use-canvas-tasks";

export type CanvasHistoryEntry = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

type CanvasHistoryOptions = {
    projectLoaded: boolean;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    nodeTaskRunsRef: MutableRefObject<Map<string, CanvasNodeTaskRun>>;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    setBackgroundMode: (mode: CanvasBackgroundMode) => void;
    setShowImageInfo: (show: boolean) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    onHistoryApplied?: () => void;
};

/**
 * 画布撤销/重做：历史快照、180ms 合并提交、10 步上限与引用媒体的延迟清理。
 */
export function useCanvasHistory({
    projectLoaded,
    nodes,
    connections,
    nodesRef,
    connectionsRef,
    nodeTaskRunsRef,
    backgroundMode,
    showImageInfo,
    setBackgroundMode,
    setShowImageInfo,
    setNodes,
    setConnections,
    onHistoryApplied,
}: CanvasHistoryOptions) {
    const effectiveConfig = useEffectiveConfig();
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const historyCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const historyCleanupKeysRef = useRef(new Map<string, string>());
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            backgroundMode,
            showImageInfo,
        }),
        [backgroundMode, connectionsRef, nodesRef, showImageInfo],
    );

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown, storageKeys?: ReadonlyMap<string, string>) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current, tasks: Array.from(nodeTaskRunsRef.current.values()) }, storageKeys);
        },
        [cleanupAssetImages, nodeTaskRunsRef],
    );

    useEffect(() => () => {
        const storageKeys = historyCleanupKeysRef.current;
        collectImageStorageKeys([historyRef.current, lastHistoryRef.current, Array.from(nodeTaskRunsRef.current.values())], new Set(), undefined, storageKeys).forEach((key) => storageKeys.set(key, key));
        historyCleanupKeysRef.current = new Map<string, string>();
        if (historyCleanupTimerRef.current) {
            clearTimeout(historyCleanupTimerRef.current);
            historyCleanupTimerRef.current = null;
        }
        const usedKeys = collectImageStorageKeys(nodesRef.current, new Set(), storageKeys);
        if (Array.from(storageKeys.values()).some((key) => !usedKeys.has(key))) cleanupAssetImages({ nodes: nodesRef.current }, storageKeys, useUserStore.getState().token);
    }, [cleanupAssetImages, nodeTaskRunsRef, nodesRef]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (previous?.nodes === next.nodes && previous.connections === next.connections && previous.backgroundMode === next.backgroundMode && previous.showImageInfo === next.showImageInfo) return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            const historyDropped = historyRef.current.past.length >= 10 || historyRef.current.future.length > 0;
            if (historyDropped) {
                const dropped = [...historyRef.current.past.slice(0, -9), ...historyRef.current.future];
                collectImageStorageKeys([dropped, Array.from(nodeTaskRunsRef.current.values())], new Set(), undefined, historyCleanupKeysRef.current).forEach((key) => historyCleanupKeysRef.current.set(key, key));
                const retainedNodes = [...current.nodes, ...last.nodes, ...historyRef.current.past.slice(-9).flatMap((entry) => entry.nodes)];
                const retainedRuns = new Set(retainedNodes.map((node) => `${node.id}:${node.metadata?.clientTaskId || ""}`));
                nodeTaskRunsRef.current.forEach((run, key) => {
                    if (key.includes(":") && !retainedRuns.has(key)) { delete run.task; delete run.mediaSize; nodeTaskRunsRef.current.delete(key); }
                });
            }
            historyRef.current.past = [...historyRef.current.past.slice(-9), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
            if (historyDropped) {
                if (historyCleanupTimerRef.current) clearTimeout(historyCleanupTimerRef.current);
                historyCleanupTimerRef.current = setTimeout(() => {
                    historyCleanupTimerRef.current = null;
                    const storageKeys = historyCleanupKeysRef.current;
                    historyCleanupKeysRef.current = new Map<string, string>();
                    cleanupCanvasFiles(undefined, storageKeys);
                }, 2000);
            }
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [backgroundMode, cleanupCanvasFiles, connections, createHistoryEntry, nodes, nodeTaskRunsRef, projectLoaded, showImageInfo]);

    const cancelPendingHistoryCommit = useCallback(() => {
        if (!historyCommitTimerRef.current) return;
        clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = null;
    }, []);

    const resetHistory = useCallback((restoredNodes: CanvasNodeData[], restoredConnections: CanvasConnection[], mode: CanvasBackgroundMode, info: boolean) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        historyRef.current = { past: [], future: [] };
        lastHistoryRef.current = { nodes: restoredNodes, connections: restoredConnections, backgroundMode: mode, showImageInfo: info };
        setHistoryState({ canUndo: false, canRedo: false });
    }, []);

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        let restoredConnections = entry.connections;
        const pendingRestores: [CanvasNodeData, CanvasNodeTaskRun][] = [];
        let mediaSizeChanged = false;
        let restoredNodes = entry.nodes.map((node) => {
            const id = node.metadata?.clientTaskId;
            if (!id) {
                if (nodeTaskRunsRef.current.get(node.id)?.id) nodeTaskRunsRef.current.set(node.id, { id: "", controller: new AbortController() });
                return node;
            }
            const run: CanvasNodeTaskRun = nodeTaskRunsRef.current.get(`${node.id}:${id}`) || { id, controller: new AbortController(), backend: node.metadata?.taskBackend };
            nodeTaskRunsRef.current.set(node.id, run);
            nodeTaskRunsRef.current.set(`${node.id}:${id}`, run);
            if (run.backend || (run.task && !run.controller.signal.aborted && node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content)) pendingRestores.push([node, run]);
            const updated = fitCanvasMediaNode(node, run.mediaSize);
            mediaSizeChanged ||= updated !== node;
            return updated;
        });
        if (!mediaSizeChanged) restoredNodes = entry.nodes;
        for (const [node, run] of pendingRestores) {
            const id = node.metadata!.clientTaskId!;
            if (run.backend) restoredNodes = restoredNodes.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, taskBackend: run.backend } } : item);
            if (!run.task || run.controller.signal.aborted || node.metadata?.status !== NODE_STATUS_LOADING || node.metadata.content) continue;
            const startedAt = node.metadata.startedAt || Date.now();
            const size = { width: node.width, height: node.height };
            if (node.type === CanvasNodeType.Video) {
                restoredNodes = applyCanvasVideoTaskUpdate(restoredNodes, node.id, run.task as VideoResponse, buildGenerationConfig(effectiveConfig, node, "video"), startedAt, size, id);
            } else if (node.type === CanvasNodeType.Audio) {
                restoredNodes = applyCanvasAudioTaskUpdate(restoredNodes, node.id, run.task as CanvasAudioTask, startedAt, id);
            } else if (isCanvasImageNodeType(node.type)) {
                const task = run.task as CanvasImageTask;
                restoredNodes = applyCanvasImageTaskUpdate(restoredNodes, node.id, task, startedAt, size, id);
                restoredConnections = applyCanvasImageTaskConnections(restoredConnections, node.id, task, node.metadata.batchRootId);
                const root = restoredNodes.find((item) => item.id === node.metadata?.batchRootId);
                if (task.source !== "workflow" && root?.metadata?.primaryImageId === node.id) restoredNodes = applyCanvasImageTaskUpdate(restoredNodes, root.id, task, startedAt, size);
            }
        }
        const restoredEntry = { ...entry, nodes: restoredNodes, connections: restoredConnections };
        lastHistoryRef.current = restoredEntry;
        nodesRef.current = restoredNodes;
        connectionsRef.current = restoredConnections;
        setNodes(restoredNodes);
        setConnections(restoredConnections);
        setBackgroundMode(entry.backgroundMode);
        setShowImageInfo(entry.showImageInfo);
        onHistoryApplied?.();
        setTimeout(() => {
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, [effectiveConfig, nodeTaskRunsRef, nodesRef, connectionsRef, setNodes, setConnections, setBackgroundMode, setShowImageInfo, onHistoryApplied]);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    return { historyRef, lastHistoryRef, historyPausedRef, historyState, cleanupCanvasFiles, cancelPendingHistoryCommit, resetHistory, undoCanvas, redoCanvas };
}
