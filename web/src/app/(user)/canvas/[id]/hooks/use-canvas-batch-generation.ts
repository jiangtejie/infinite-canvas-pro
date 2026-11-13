"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestCreditCost } from "@/constant/credits";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";

import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import type { CanvasConnection, CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { collectBatchGenerationTargets } from "../lib/canvas-batch";
import type { CanvasGenerateNodeOptions } from "./use-canvas-generation";

export type CanvasBatchGenerationState = {
    running: boolean;
    total: number;
    completed: number;
    failed: number;
    currentTitle: string;
    currentIndex: number;
};

export type CanvasBatchRunStatus = "success" | "partial" | "stopped" | "timeout" | "cancelled" | "busy" | "unavailable";

export type CanvasBatchRunResult = {
    status: CanvasBatchRunStatus;
    total: number;
    completed: number;
    failed: number;
    failedNodeIds: string[];
};

type CanvasBatchMessage = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
};

type UseCanvasBatchGenerationOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    effectiveConfig: AiConfig;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (open?: boolean) => void;
    selectMany: (ids: Iterable<string>) => void;
    handleGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasGenerateNodeOptions) => Promise<void>;
    handleStopNode: (nodeId: string) => Promise<void>;
    message: CanvasBatchMessage;
};

export type CanvasBatchResult = "success" | "failure" | "stopped" | "timeout";

const INITIAL_STATE: CanvasBatchGenerationState = { running: false, total: 0, completed: 0, failed: 0, currentTitle: "", currentIndex: 0 };
const NODE_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 700;
const ACTIVITY_GRACE_MS = 5000;
const ACTIVE_STATUS = new Set(["loading", "stopping"]);

/**
 * 画布批量生成：串行队列，逐张调用现有单节点生成链路并等待任务终态；
 * 不引入新的任务系统，也不改变 runningRequestRef 的单例语义。
 */
export function useCanvasBatchGeneration({
    nodesRef,
    connectionsRef,
    effectiveConfig,
    isAiConfigReady,
    openConfigDialog,
    selectMany,
    handleGenerateNode,
    handleStopNode,
    message,
}: UseCanvasBatchGenerationOptions) {
    const confirm = useConfirm();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const [batchState, setBatchState] = useState<CanvasBatchGenerationState>(INITIAL_STATE);
    const runningRef = useRef(false);
    const stopRequestedRef = useRef(false);
    const activeNodeIdRef = useRef("");
    const runTokenRef = useRef(0);

    useEffect(() => () => {
        runTokenRef.current += 1;
    }, []);

    const waitForGeneration = useCallback(async (targetNodeId: string, runToken: number, snapshot: { ids: Set<string>; status?: string; startedAt?: number; clientTaskId?: string }): Promise<CanvasBatchResult> => {
        const startedAt = Date.now();
        let sawActivity = false;
        await sleep(POLL_INTERVAL_MS);
        while (Date.now() - startedAt < NODE_TIMEOUT_MS) {
            if (runTokenRef.current !== runToken) return "stopped";
            const nodes = nodesRef.current;
            const connections = connectionsRef.current;
            const target = nodes.find((node) => node.id === targetNodeId);
            if (!target) return "failure";
            // 只认本次生成新建的下游节点：目标已有的下游可能被用户独立起了任务，
            // 把它们的 loading/失败算进本张会白等十分钟并污染成功失败计数。
            const newDownstreamIds = new Set(connections.filter((connection) => connection.fromNodeId === targetNodeId && !snapshot.ids.has(connection.toNodeId)).map((connection) => connection.toNodeId));
            const activeNodes = nodes.filter((node) => ACTIVE_STATUS.has(node.metadata?.status || ""));
            const downstreamActive = activeNodes.filter((node) => newDownstreamIds.has(node.id));
            const targetActive = ACTIVE_STATUS.has(target.metadata?.status || "");
            const activeNode = targetActive ? target : downstreamActive[0];
            activeNodeIdRef.current = activeNode?.id || targetNodeId;
            if (!sawActivity) {
                sawActivity = targetActive
                    || newDownstreamIds.size > 0
                    || target.metadata?.startedAt !== snapshot.startedAt
                    || target.metadata?.clientTaskId !== snapshot.clientTaskId
                    || (snapshot.status === "idle" && target.metadata?.status === "success");
            }
            if (!targetActive && !downstreamActive.length) {
                if (!sawActivity) {
                    if (Date.now() - startedAt < ACTIVITY_GRACE_MS) {
                        await sleep(POLL_INTERVAL_MS);
                        continue;
                    }
                    return "failure";
                }
                if (stopRequestedRef.current) return "stopped";
                if (target.metadata?.status === "error" || target.metadata?.status === "stopped") return "failure";
                const failedNewNode = nodes.some((node) => newDownstreamIds.has(node.id) && (node.metadata?.status === "error" || node.metadata?.status === "stopped"));
                return failedNewNode ? "failure" : "success";
            }
            if (stopRequestedRef.current && !activeNode) return "stopped";
            await sleep(POLL_INTERVAL_MS);
        }
        return "timeout";
    }, [connectionsRef, nodesRef]);

    const startBatch = useCallback(async (nodeIds: Iterable<string>, options?: { label?: string; overwrite?: boolean }): Promise<CanvasBatchRunResult> => {
        if (runningRef.current) return createBatchRunResult("busy");
        const { targetNodeIds: targets, skippedCount } = collectBatchGenerationTargets(nodesRef.current, nodeIds);
        if (!targets.length) {
            message.warning(skippedCount ? "选中的图片节点都没有提示词，请先填写提示词" : "请选择要批量生成的图片节点");
            return createBatchRunResult("unavailable");
        }
        if (skippedCount) message.warning(`已跳过 ${skippedCount} 个没有提示词的图片节点`);
        const imageModel = effectiveConfig.imageModel || effectiveConfig.model;
        if (!isAiConfigReady(effectiveConfig, imageModel)) {
            openConfigDialog(true);
            return createBatchRunResult("unavailable");
        }
        const credits = requestCreditCost({ channelMode: effectiveConfig.channelMode, modelCosts, model: imageModel, count: 1 }) * targets.length;
        const label = options?.label?.trim() || "批量生成";
        runningRef.current = true;
        let confirmed = false;
        try {
            confirmed = await confirm({
                title: `${label}（${targets.length} 张）`,
                description: `将按顺序逐张生成图片，图片模型：${imageModel}；${credits > 0 ? `预计消耗 ${credits.toLocaleString()} 力点；` : ""}生成过程中可随时停止，已完成的结果会保留。`,
                confirmText: "开始生成",
                cancelText: "取消",
            });
        } catch {
            confirmed = false;
        }
        if (!confirmed) {
            runningRef.current = false;
            return createBatchRunResult("cancelled");
        }

        stopRequestedRef.current = false;
        activeNodeIdRef.current = "";
        runTokenRef.current += 1;
        const runToken = runTokenRef.current;
        selectMany(targets);
        setBatchState({ running: true, total: targets.length, completed: 0, failed: 0, currentTitle: "", currentIndex: 0 });
        let completed = 0;
        let failed = 0;
        let interrupted = false;
        let timedOut = false;
        const failedNodeIds: string[] = [];
        try {
            for (const [index, nodeId] of targets.entries()) {
                if (stopRequestedRef.current || runTokenRef.current !== runToken) {
                    interrupted = true;
                    break;
                }
                const node = nodesRef.current.find((item) => item.id === nodeId);
                if (!node || !isCanvasImageNodeType(node.type)) {
                    failed += 1;
                    failedNodeIds.push(nodeId);
                    setBatchState((prev) => ({ ...prev, completed, failed }));
                    continue;
                }
                setBatchState((prev) => ({ ...prev, currentIndex: index + 1, currentTitle: node.title || `图片 ${index + 1}` }));
                const snapshot = {
                    ids: new Set(nodesRef.current.map((item) => item.id)),
                    status: node.metadata?.status,
                    startedAt: node.metadata?.startedAt,
                    clientTaskId: node.metadata?.clientTaskId,
                };
                activeNodeIdRef.current = nodeId;
                try {
                    await handleGenerateNode(nodeId, "image", node.metadata?.prompt || "", { background: true, countOverride: "1", overwrite: options?.overwrite });
                    const result = await waitForGeneration(nodeId, runToken, snapshot);
                    if (result === "stopped") {
                        interrupted = true;
                        break;
                    }
                    if (result === "success") completed += 1;
                    else {
                        failed += 1;
                        if (result === "timeout") timedOut = true;
                        failedNodeIds.push(nodeId);
                    }
                } catch {
                    failed += 1;
                    failedNodeIds.push(nodeId);
                }
                if (runTokenRef.current !== runToken) {
                    return createBatchRunResult("stopped", targets.length, completed, failed, [...failedNodeIds]);
                }
                setBatchState((prev) => ({ ...prev, completed, failed }));
            }
        } finally {
            if (runTokenRef.current === runToken) {
                runningRef.current = false;
                stopRequestedRef.current = false;
                activeNodeIdRef.current = "";
                setBatchState((prev) => ({ ...prev, running: false, currentTitle: "", currentIndex: 0 }));
                const prefix = options?.label ? `${options.label}：` : "";
                if (interrupted) message.warning(`${prefix}已停止，成功 ${completed} 张，失败 ${failed} 张`);
                else if (failed) message.warning(`${prefix}完成，成功 ${completed} 张，失败 ${failed} 张`);
                else message.success(`${prefix}已生成 ${completed} 张图片`);
            }
        }
        return createBatchRunResult(interrupted ? "stopped" : failed === 0 ? "success" : completed === 0 && timedOut ? "timeout" : "partial", targets.length, completed, failed, [...failedNodeIds]);
    }, [confirm, effectiveConfig, handleGenerateNode, isAiConfigReady, message, modelCosts, nodesRef, openConfigDialog, selectMany, waitForGeneration]);

    const stopBatch = useCallback(async () => {
        if (!runningRef.current) return;
        stopRequestedRef.current = true;
        const activeNodeId = activeNodeIdRef.current;
        if (!activeNodeId) return;
        const activeNode = nodesRef.current.find((node) => node.id === activeNodeId);
        if (!activeNode) return;
        if (activeNode.metadata?.status !== "loading" && activeNode.metadata?.status !== "stopping") return;
        await handleStopNode(activeNodeId).catch(() => undefined);
    }, [handleStopNode, nodesRef]);

    return { batchState, startBatch, stopBatch };
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function createBatchRunResult(status: CanvasBatchRunStatus, total = 0, completed = 0, failed = 0, failedNodeIds: string[] = []): CanvasBatchRunResult {
    return { status, total, completed, failed, failedNodeIds };
}
