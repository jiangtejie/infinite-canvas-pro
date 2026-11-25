"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestCreditCost } from "@/constant/credits";
import { usesAccountProxy } from "@/services/api/ai-request";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";

import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import type { CanvasConnection, CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { collectBatchGenerationTargets, type CanvasBatchRunResult, type CanvasBatchRunStatus } from "../lib/canvas-batch";
import { reconcileRemixBatchResume, remixBatchAttemptCounts } from "../lib/canvas-remix-batch";
import type { RemixBatchProgress } from "../../remix-types";
import type { CanvasGenerateNodeOptions } from "./use-canvas-generation";

export type CanvasBatchGenerationState = {
    running: boolean;
    total: number;
    completed: number;
    failed: number;
    currentTitle: string;
    currentIndex: number;
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
    reviewBatch: (nodeIds: string[], credits: number) => Promise<boolean | null>;
    onBatchProgress?: (nodeIds: string[], progress: Omit<RemixBatchProgress, "id" | "runId">) => void;
};

export type CanvasBatchResult = "success" | "failure" | "stopped" | "timeout";

const INITIAL_STATE: CanvasBatchGenerationState = { running: false, total: 0, completed: 0, failed: 0, currentTitle: "", currentIndex: 0 };
const NODE_TIMEOUT_MS = 10 * 60 * 1000;
// 云端队列模式下任务会排队等待服务端 worker，等待上限要覆盖排队时间。
const SERVER_QUEUE_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 700;
const ACTIVITY_GRACE_MS = 5000;
const ACTIVE_STATUS = new Set(["loading", "stopping"]);

/**
 * 画布批量生成：逐张调用现有单节点生成链路。本地直连时串行等待每张终态；
 * 登录代理时任务由服务端持久队列执行，先逐张提交再统一等待，刷新页面也不会丢失已提交任务。
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
    reviewBatch,
    onBatchProgress,
}: UseCanvasBatchGenerationOptions) {
    const confirm = useConfirm();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const [batchState, setBatchState] = useState<CanvasBatchGenerationState>(INITIAL_STATE);
    const runningRef = useRef(false);
    const stopRequestedRef = useRef(false);
    const activeNodeIdRef = useRef("");
    const queuedNodeIdsRef = useRef<string[]>([]);
    const runTokenRef = useRef(0);

    useEffect(() => () => {
        runTokenRef.current += 1;
    }, []);
    // 节点保存在 ref 中，加载/恢复后的每次渲染都需要同步一次暂停批次进度。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (runningRef.current) return;
        const batch = nodesRef.current.find((node) => node.metadata?.remixRun?.batch?.status === "paused")?.metadata?.remixRun?.batch;
        if (!batch) return;
        setBatchState((prev) => prev.total === batch.nodeIds.length && prev.completed === batch.completed && prev.failed === batch.failed
            ? prev
            : { running: false, total: batch.nodeIds.length, completed: batch.completed, failed: batch.failed, currentTitle: "", currentIndex: batch.cursor });
    });

    const waitForGeneration = useCallback(async (targetNodeId: string, runToken: number, snapshot: { ids: Set<string>; status?: string; startedAt?: number; clientTaskId?: string }, timeoutMs = NODE_TIMEOUT_MS): Promise<CanvasBatchResult> => {
        const startedAt = Date.now();
        let sawActivity = false;
        await sleep(POLL_INTERVAL_MS);
        while (Date.now() - startedAt < timeoutMs) {
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

    const startBatch = useCallback(async (nodeIds: Iterable<string>, options?: { label?: string; overwrite?: boolean; resume?: RemixBatchProgress }): Promise<CanvasBatchRunResult> => {
        const requestedNodeIds = [...nodeIds];
        if (runningRef.current) return createBatchRunResult("busy", 0, 0, 0, [], requestedNodeIds);
        const { targetNodeIds: targets, skippedCount } = collectBatchGenerationTargets(nodesRef.current, requestedNodeIds);
        if (!targets.length) {
            message.warning(skippedCount ? "选中的图片节点都没有提示词，请先填写提示词" : "请选择要批量生成的图片节点");
            return createBatchRunResult("unavailable", requestedNodeIds.length, 0, 0, [], requestedNodeIds);
        }
        if (skippedCount) message.warning(`已跳过 ${skippedCount} 个没有提示词的图片节点`);
        const imageModel = effectiveConfig.imageModel || effectiveConfig.model;
        if (!isAiConfigReady(effectiveConfig, imageModel)) {
            openConfigDialog(true);
            return createBatchRunResult("unavailable", targets.length, 0, 0, [], targets);
        }
        const credits = requestCreditCost({ channelMode: effectiveConfig.channelMode, modelCosts, model: imageModel, count: 1 }) * targets.length;
        const label = options?.label?.trim() || "批量生成";
        const serverQueued = usesAccountProxy(effectiveConfig);
        runningRef.current = true;
        let confirmed = false;
        try {
            const remixReview = await reviewBatch(targets, credits);
            confirmed = remixReview === null ? await confirm({
                title: `${label}（${targets.length} 张）`,
                description: `${serverQueued ? "将全部提交到云端队列生成，关闭页面后仍会继续" : "将按顺序逐张生成图片"}，图片模型：${imageModel}；${credits > 0 ? `预计消耗 ${credits.toLocaleString()} 力点；` : ""}生成过程中可随时停止，已完成的结果会保留。`,
                confirmText: "开始生成",
                cancelText: "取消",
            }) : remixReview;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "复刻生成校验失败");
            confirmed = false;
        }
        if (!confirmed) {
            runningRef.current = false;
            return createBatchRunResult("cancelled", targets.length, 0, 0, [], targets);
        }

        stopRequestedRef.current = false;
        activeNodeIdRef.current = "";
        runTokenRef.current += 1;
        const runToken = runTokenRef.current;
        const resume = options?.resume ? reconcileRemixBatchResume(options.resume, nodesRef.current) : undefined;
        const progressNodeIds = resume?.nodeIds || targets;
        const initialCursor = resume?.cursor || 0;
        const persistProgress = (cursor: number, completed: number, failed: number, failedNodeIds: string[], status: RemixBatchProgress["status"]) => {
            onBatchProgress?.(progressNodeIds, { nodeIds: progressNodeIds, cursor, completed, failed, failedNodeIds, status });
        };
        selectMany(targets);
        let completed = resume?.completed || 0;
        let failed = resume?.failed || 0;
        let displayCompleted = 0;
        let displayFailed = 0;
        const completedNodeIds: string[] = [];
        let interrupted = false;
        let timedOut = false;
        let cursor = initialCursor;
        let failedNodeIds = [...(resume?.failedNodeIds || [])];
        persistProgress(initialCursor, completed, failed, failedNodeIds, "running");
        setBatchState({ running: true, total: targets.length, completed: 0, failed: 0, currentTitle: "", currentIndex: 0 });
        const recordResult = (nodeId: string, result: CanvasBatchResult) => {
            if (result === "success") {
                displayCompleted += 1;
                completedNodeIds.push(nodeId);
            } else {
                displayFailed += 1;
                if (result === "timeout") timedOut = true;
            }
            const counts = remixBatchAttemptCounts({ completed, failed, failedNodeIds }, nodeId, result === "success" ? "success" : "failure");
            completed = counts.completed;
            failed = counts.failed;
            failedNodeIds = counts.failedNodeIds;
            setBatchState((prev) => ({ ...prev, completed: displayCompleted, failed: displayFailed }));
        };
        // 提交单张并返回等待其终态的 Promise（包在对象里，避免 async 自动展开成串行等待）；串行模式立即等待，云端队列模式全部提交后统一等待。
        const submitTarget = async (node: CanvasNodeData): Promise<{ waiting: Promise<CanvasBatchResult> }> => {
            const snapshot = {
                ids: new Set(nodesRef.current.map((item) => item.id)),
                status: node.metadata?.status,
                startedAt: node.metadata?.startedAt,
                clientTaskId: node.metadata?.clientTaskId,
            };
            activeNodeIdRef.current = node.id;
            try {
                await handleGenerateNode(node.id, "image", node.metadata?.prompt || "", { background: true, countOverride: "1", overwrite: options?.overwrite });
            } catch {
                return { waiting: Promise.resolve<CanvasBatchResult>("failure") };
            }
            return { waiting: waitForGeneration(node.id, runToken, snapshot, serverQueued ? SERVER_QUEUE_TIMEOUT_MS : NODE_TIMEOUT_MS) };
        };
        const pending: Promise<void>[] = [];
        queuedNodeIdsRef.current = serverQueued ? targets : [];
        try {
            for (const [targetIndex, nodeId] of targets.entries()) {
                if (stopRequestedRef.current || runTokenRef.current !== runToken) {
                    interrupted = true;
                    break;
                }
                const node = nodesRef.current.find((item) => item.id === nodeId);
                cursor = Math.max(0, progressNodeIds.indexOf(nodeId));
                if (!node || !isCanvasImageNodeType(node.type)) {
                    recordResult(nodeId, "failure");
                    persistProgress(cursor + 1, completed, failed, failedNodeIds, "running");
                    continue;
                }
                persistProgress(cursor, completed, failed, failedNodeIds, "running");
                setBatchState((prev) => ({ ...prev, currentIndex: targetIndex + 1, currentTitle: node.title || `图片 ${targetIndex + 1}` }));
                const { waiting } = await submitTarget(node);
                const submittedCursor = cursor + 1;
                if (serverQueued) {
                    persistProgress(submittedCursor, completed, failed, failedNodeIds, "running");
                    pending.push(waiting.then((result) => {
                        if (result === "stopped") {
                            interrupted = true;
                            return;
                        }
                        recordResult(nodeId, result);
                        if (runTokenRef.current === runToken) persistProgress(submittedCursor, completed, failed, failedNodeIds, "running");
                    }));
                    continue;
                }
                const result = await waiting;
                if (result === "stopped") {
                    interrupted = true;
                    break;
                }
                recordResult(nodeId, result);
                if (runTokenRef.current !== runToken) {
                    return createBatchRunResult("stopped", progressNodeIds.length, completed, failed, [...failedNodeIds], targets, completedNodeIds);
                }
                persistProgress(submittedCursor, completed, failed, failedNodeIds, "running");
            }
            if (pending.length) {
                setBatchState((prev) => ({ ...prev, currentTitle: "等待云端队列完成" }));
                await Promise.all(pending);
                if (runTokenRef.current !== runToken) {
                    return createBatchRunResult("stopped", progressNodeIds.length, completed, failed, [...failedNodeIds], targets, completedNodeIds);
                }
            }
        } finally {
            if (runTokenRef.current === runToken) {
                runningRef.current = false;
                stopRequestedRef.current = false;
                activeNodeIdRef.current = "";
                queuedNodeIdsRef.current = [];
                setBatchState((prev) => ({ ...prev, running: false, currentTitle: "", currentIndex: 0 }));
                const latest = resume ? reconcileRemixBatchResume({ ...resume, status: "running" }, nodesRef.current) : undefined;
                const finalCursor = latest?.cursor ?? progressNodeIds.length;
                const finalCounts = latest ? { completed: latest.completed, failed: latest.failed, failedNodeIds: latest.failedNodeIds } : { completed, failed, failedNodeIds };
                completed = finalCounts.completed;
                failed = finalCounts.failed;
                failedNodeIds = finalCounts.failedNodeIds;
                const hasRemaining = finalCursor < progressNodeIds.length;
                persistProgress(finalCursor, completed, failed, failedNodeIds, interrupted || hasRemaining ? "paused" : "completed");
                const prefix = options?.label ? `${options.label}：` : "";
                if (interrupted) message.warning(`${prefix}已停止，成功 ${completed} 张，失败 ${failed} 张`);
                else if (failed) message.warning(`${prefix}完成，成功 ${completed} 张，失败 ${failed} 张`);
                else message.success(`${prefix}已生成 ${completed} 张图片`);
            }
        }
        return createBatchRunResult(interrupted ? "stopped" : failed === 0 ? "success" : completed === 0 && timedOut ? "timeout" : "partial", progressNodeIds.length, completed, failed, [...failedNodeIds], targets, completedNodeIds);
    }, [confirm, effectiveConfig, handleGenerateNode, isAiConfigReady, message, modelCosts, nodesRef, onBatchProgress, openConfigDialog, reviewBatch, selectMany, waitForGeneration]);

    const stopBatch = useCallback(async () => {
        if (!runningRef.current) return;
        stopRequestedRef.current = true;
        // 云端队列模式下多张同时在跑，停止时一并停掉本批次所有进行中的节点。
        const ids = new Set([activeNodeIdRef.current, ...queuedNodeIdsRef.current].filter(Boolean));
        const activeNodes = nodesRef.current.filter((node) => ids.has(node.id) && ACTIVE_STATUS.has(node.metadata?.status || ""));
        await Promise.all(activeNodes.map((node) => handleStopNode(node.id).catch(() => undefined)));
    }, [handleStopNode, nodesRef]);

    return { batchState, startBatch, stopBatch };
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function createBatchRunResult(status: CanvasBatchRunStatus, total = 0, completed = 0, failed = 0, failedNodeIds: string[] = [], nodeIds: string[] = [], completedNodeIds: string[] = []): CanvasBatchRunResult {
    return { status, total, completed, failed, failedNodeIds, nodeIds, completedNodeIds };
}
