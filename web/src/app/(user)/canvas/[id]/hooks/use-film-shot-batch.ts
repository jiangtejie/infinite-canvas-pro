"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { filmFrameReady, filmVideoMode } from "../lib/film-shot-video-frames";
import type { FilmShotBatchKind, FilmShotBatchState } from "../lib/film-studio-types";

type Message = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
};

type Options = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    generate: (shotId: string, kind: FilmShotBatchKind) => Promise<void>;
    stop: (shotId: string, kind: FilmShotBatchKind) => Promise<void>;
    ensureConfig: (kind: FilmShotBatchKind) => boolean;
    message: Message;
};

const INITIAL_STATE: FilmShotBatchState = { running: false, kind: null, total: 0, completed: 0, failed: 0, currentTitle: "", currentIndex: 0 };
const POLL_INTERVAL_MS = 700;
const NODE_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_GRACE_MS = 15000;
const STOP_GRACE_MS = 5000;

export function useFilmShotBatch({ nodesRef, generate, stop, ensureConfig, message }: Options) {
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

    const startBatch = useCallback(async (shotIds: Iterable<string>, kind: FilmShotBatchKind) => {
        if (runningRef.current) {
            message.warning("已有批量生成在进行中");
            return;
        }
        const seen = new Set<string>();
        const targets: CanvasNodeData[] = [];
        let skippedText = 0;
        let skippedBusy = 0;
        let skippedFrame = 0;
        for (const shotId of shotIds) {
            if (seen.has(shotId)) continue;
            seen.add(shotId);
            const node = nodesRef.current.find((item) => item.id === shotId);
            const payload = node?.metadata?.filmShot;
            if (!node || node.type !== CanvasNodeType.Shot || !payload) continue;
            if (!(payload.prompt || payload.description || "").trim()) {
                skippedText += 1;
                continue;
            }
            if (node.metadata?.status === "loading" || node.metadata?.status === "stopping") {
                skippedBusy += 1;
                continue;
            }
            if (kind === "video" && filmVideoMode(payload) === "frames" && !filmFrameReady(payload.firstFrame)) {
                skippedFrame += 1;
                continue;
            }
            targets.push(node);
        }
        if (!targets.length) {
            message.warning(skippedText ? "选中的镜头都没有画面描述或提示词" : "请选择可生成的镜头");
            return;
        }
        const kindLabel = kind === "image" ? "分镜图" : "分镜视频";
        const skipped = [
            skippedText ? `${skippedText} 镜缺描述` : "",
            skippedBusy ? `${skippedBusy} 镜生成中` : "",
            skippedFrame ? `${skippedFrame} 镜首尾帧缺首帧` : "",
        ].filter(Boolean).join("、");
        if (skipped) message.warning(`已跳过 ${skipped}`);
        if (!ensureConfig(kind)) {
            message.warning(`请先配置可用的${kind === "image" ? "图片" : "视频"}模型`);
            return;
        }
        const confirmed = await confirm({
            title: `批量生成${kindLabel}（${targets.length} 镜）`,
            description: `将按镜头顺序逐个生成${kindLabel}，单个镜头失败不会影响后续；生成过程中可随时停止，已完成结果会保留。`,
            confirmText: "开始生成",
            cancelText: "取消",
        });
        if (!confirmed) return;

        runningRef.current = true;
        stopRequestedRef.current = false;
        activeShotRef.current = "";
        activeKindRef.current = kind;
        runTokenRef.current += 1;
        const runToken = runTokenRef.current;
        setState({ running: true, kind, total: targets.length, completed: 0, failed: 0, currentTitle: "", currentIndex: 0 });
        let completed = 0;
        let failed = 0;
        let interrupted = false;
        try {
            for (const [index, node] of targets.entries()) {
                if (stopRequestedRef.current || runTokenRef.current !== runToken) {
                    interrupted = true;
                    break;
                }
                const payload = node.metadata?.filmShot;
                activeShotRef.current = node.id;
                setState((prev) => ({ ...prev, currentIndex: index + 1, currentTitle: payload?.shotNo || node.title || `镜头 ${index + 1}` }));
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
                setState((prev) => ({ ...prev, running: false, currentTitle: "", currentIndex: 0 }));
                if (interrupted) message.warning(`批量${kindLabel}已停止，成功 ${completed} 镜，失败 ${failed} 镜`);
                else if (failed) message.warning(`批量${kindLabel}完成，成功 ${completed} 镜，失败 ${failed} 镜`);
                else message.success(`已生成 ${completed} 镜${kindLabel}`);
            }
        }
    }, [confirm, ensureConfig, generate, message, nodesRef, waitForShot]);

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
