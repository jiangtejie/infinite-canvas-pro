"use client";

import { createElement, useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { nanoid } from "nanoid";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { type CanvasConnection, type CanvasFilmShotQueue, type CanvasNodeData } from "../../types";
import { planFilmShotBatch } from "../lib/film-batch-preflight";
import type { FilmShotBatchKind, FilmShotBatchState } from "../lib/film-studio-types";
import { FilmBatchPlanSummary } from "../components/film-batch-plan-summary";

type Message = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
};

type Options = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    generate: (shotId: string, kind: FilmShotBatchKind) => Promise<void>;
    stop: (shotId: string, kind: FilmShotBatchKind) => Promise<void>;
    ensureConfig: (kind: FilmShotBatchKind) => boolean;
    resolveReferenceLimit: (kind: FilmShotBatchKind) => number;
    onQueueChange?: (queue: CanvasFilmShotQueue | null) => void;
    message: Message;
};

type FilmShotBatchStartOptions = {
    resume?: { id: string; startedAt: number };
    skipConfirm?: boolean;
};

const INITIAL_STATE: FilmShotBatchState = { running: false, kind: null, total: 0, completed: 0, failed: 0, currentTitle: "", currentIndex: 0, currentShotId: "" };
const POLL_INTERVAL_MS = 700;
const NODE_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_GRACE_MS = 15000;
const STOP_GRACE_MS = 5000;

export function useFilmShotBatch({ nodesRef, connectionsRef, generate, stop, ensureConfig, resolveReferenceLimit, onQueueChange, message }: Options) {
    const confirm = useConfirm();
    const [state, setState] = useState<FilmShotBatchState>(INITIAL_STATE);
    const runningRef = useRef(false);
    const stopRequestedRef = useRef(false);
    const activeShotRef = useRef("");
    const activeKindRef = useRef<FilmShotBatchKind | null>(null);
    const runTokenRef = useRef(0);

    useEffect(() => () => {
        runTokenRef.current += 1;
    }, []);

    const waitForShot = useCallback(async (shotId: string, runToken: number): Promise<"success" | "failure" | "stopped"> => {
        const startedAt = Date.now();
        let sawActive = false;
        let stopStartedAt = 0;
        await sleep(POLL_INTERVAL_MS);
        while (Date.now() - startedAt < NODE_TIMEOUT_MS) {
            if (runTokenRef.current !== runToken) return "stopped";
            const node = nodesRef.current.find((item) => item.id === shotId);
            if (!node) return "failure";
            const status = node.metadata?.status;
            const active = status === "loading" || status === "stopping";
            if (active) sawActive = true;
            if (stopRequestedRef.current) {
                if (!stopStartedAt) stopStartedAt = Date.now();
                if (!active || Date.now() - stopStartedAt > STOP_GRACE_MS) return "stopped";
            } else if (!active) {
                if (status === "success") return "success";
                if (status === "error" || status === "stopped") return "failure";
                if (sawActive) return "failure";
                if (Date.now() - startedAt > ACTIVITY_GRACE_MS) return "failure";
            }
            await sleep(POLL_INTERVAL_MS);
        }
        return "failure";
    }, [nodesRef]);

    const startBatch = useCallback(async (shotIds: Iterable<string>, kind: FilmShotBatchKind, options: FilmShotBatchStartOptions = {}) => {
        if (runningRef.current) {
            message.warning("已有批量生成在进行中");
            return;
        }
        const plan = planFilmShotBatch(nodesRef.current, connectionsRef.current, shotIds, kind, { maxReferences: resolveReferenceLimit(kind) });
        if (!plan.ready.length) {
            if (options.resume) onQueueChange?.(null);
            const reasons = [...new Set(plan.skipped.map((skip) => skip.message))].slice(0, 3).join("；");
            message.warning(reasons ? `没有可生成的镜头：${reasons}` : "请选择可生成的镜头");
            return;
        }
        const kindLabel = kind === "image" ? "分镜图" : "分镜视频";
        if (!ensureConfig(kind)) {
            message.warning(`请先配置可用的${kind === "image" ? "图片" : "视频"}模型`);
            return;
        }
        if (!options.skipConfirm) {
            const confirmed = await confirm({
                title: `批量生成${kindLabel}（${plan.ready.length} 镜）`,
                description: createElement(FilmBatchPlanSummary, { plan }),
                confirmText: "开始生成",
                cancelText: "返回检查",
                width: 520,
                stacked: true,
            });
            if (!confirmed) return;
        }
        const targets = plan.ready.flatMap((item) => {
            const node = nodesRef.current.find((candidate) => candidate.id === item.shotId);
            return node ? [node] : [];
        });
        const queueId = options.resume?.id || nanoid();
        const queueStartedAt = options.resume?.startedAt || Date.now();
        onQueueChange?.({ id: queueId, startedAt: queueStartedAt, kind, remainingShotIds: targets.map((node) => node.id) });

        runningRef.current = true;
        stopRequestedRef.current = false;
        activeShotRef.current = "";
        activeKindRef.current = kind;
        runTokenRef.current += 1;
        const runToken = runTokenRef.current;
        setState({ running: true, kind, total: targets.length, completed: 0, failed: 0, currentTitle: "", currentIndex: 0, currentShotId: "" });
        let completed = 0;
        let failed = 0;
        let interrupted = false;
        try {
            for (const [index, node] of targets.entries()) {
                if (stopRequestedRef.current || runTokenRef.current !== runToken) {
                    interrupted = true;
                    break;
                }
                onQueueChange?.({ id: queueId, startedAt: queueStartedAt, kind, remainingShotIds: targets.slice(index).map((target) => target.id) });
                const payload = node.metadata?.filmShot;
                activeShotRef.current = node.id;
                setState((prev) => ({ ...prev, currentIndex: index + 1, currentTitle: payload?.shotNo || node.title || `镜头 ${index + 1}`, currentShotId: node.id }));
                try {
                    await generate(node.id, kind);
                    const result = await waitForShot(node.id, runToken);
                    if (result === "stopped") {
                        interrupted = true;
                        break;
                    }
                    if (result === "success") completed += 1;
                    else failed += 1;
                } catch {
                    failed += 1;
                }
                setState((prev) => ({ ...prev, completed, failed }));
            }
        } finally {
            if (runTokenRef.current === runToken) {
                runningRef.current = false;
                stopRequestedRef.current = false;
                activeShotRef.current = "";
                activeKindRef.current = null;
                onQueueChange?.(null);
                setState((prev) => ({ ...prev, running: false, currentTitle: "", currentIndex: 0, currentShotId: "" }));
                if (interrupted) message.warning(`批量${kindLabel}已停止，成功 ${completed} 镜，失败 ${failed} 镜`);
                else if (failed) message.warning(`批量${kindLabel}完成，成功 ${completed} 镜，失败 ${failed} 镜`);
                else message.success(`已生成 ${completed} 镜${kindLabel}`);
            }
        }
    }, [confirm, connectionsRef, ensureConfig, generate, message, nodesRef, onQueueChange, resolveReferenceLimit, waitForShot]);

    const stopBatch = useCallback(async () => {
        if (!runningRef.current) return;
        stopRequestedRef.current = true;
        const shotId = activeShotRef.current;
        const kind = activeKindRef.current;
        if (shotId && kind) await stop(shotId, kind);
    }, [stop]);

    return { batchState: state, startBatch, stopBatch };
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
