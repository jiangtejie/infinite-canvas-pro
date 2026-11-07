"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { stopCanvasTask } from "@/services/api/canvas-tasks";

import type { GenerationLog, GenerationResult } from "../history";
import { errorMessage, isClientVideoTaskId, logStore, sortVideoLogs } from "../history";
import type { VideoTaskRun } from "../task-types";

const STOP_SETTLE_TIMEOUT_MS = 3000;
const STOP_REQUEST_TIMEOUT_MS = 5000;

/** 停止收尾等待超时：某个挂起 promise 不能让 UI 永远停在「停止中」。 */
function settleWithTimeout(promises: Array<Promise<unknown> | undefined>, timeoutMs: number) {
    return new Promise<void>((resolve) => {
        const timer = globalThis.setTimeout(() => resolve(), timeoutMs);
        void Promise.allSettled(promises).then(() => {
            globalThis.clearTimeout(timer);
            resolve();
        });
    });
}

/** 停止请求超时：请求挂起时也要给本地停止一个机会。 */
function requestStop(run: () => Promise<{ stopped: boolean }>) {
    return new Promise<{ stopped: boolean }>((resolve, reject) => {
        const timer = globalThis.setTimeout(() => reject(new Error("停止请求超时")), STOP_REQUEST_TIMEOUT_MS);
        run().then(
            (result) => {
                globalThis.clearTimeout(timer);
                resolve(result);
            },
            (error) => {
                globalThis.clearTimeout(timer);
                reject(error);
            },
        );
    });
}

type UseVideoTaskStopOptions = {
    videoTaskRunsRef: MutableRefObject<Map<string, VideoTaskRun>>;
    logsRef: MutableRefObject<GenerationLog[]>;
    historySyncRef: MutableRefObject<Promise<unknown>>;
    setLogs: Dispatch<SetStateAction<GenerationLog[]>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    saveGenerationLog: (log: GenerationLog, active?: () => boolean) => Promise<void>;
    persistVideoLog: (log: GenerationLog) => Promise<void>;
    deleteAccountVideoLogs: (items: GenerationLog[]) => Promise<void>;
    onError: (message: string) => void;
};

/**
 * 停止视频任务：先向后端请求停止，未确认时恢复轮询；本地 client 任务直接 abort 并落已停止。
 */
export function useVideoTaskStop({ videoTaskRunsRef, logsRef, historySyncRef, setLogs, setResults, saveGenerationLog, persistVideoLog, deleteAccountVideoLogs, onError }: UseVideoTaskStopOptions) {
    const stopVideoTask = useCallback(async (logId: string) => {
        const log = logsRef.current.find((item) => item.id === logId);
        if (!log?.task || (log.status !== "生成中" && log.status !== "停止中")) return;
        const run: VideoTaskRun = videoTaskRunsRef.current.get(logId) || { id: log.task.id, controller: new AbortController(), backend: log.taskBackend };
        if (run.stopping) return;
        run.stopping = true;
        videoTaskRunsRef.current.set(logId, run);
        // 本地渠道 + client_video_task 的任务由前端持有生命周期，后端停止未确认时也按本地停止处理。
        const localClientTask = log.config?.channelMode === "local" && isClientVideoTaskId(run.id);
        const patchResult = (patch: Partial<GenerationResult>) => {
            setResults((value) => value.map((item) => (item.taskLogId === logId || item.id === logId ? { ...item, ...patch } : item)));
        };
        const stoppingLog: GenerationLog = { ...log, status: "停止中", durationMs: Math.max(0, Date.now() - log.createdAt), error: undefined, errorDetail: undefined };
        logsRef.current = sortVideoLogs([stoppingLog, ...logsRef.current.filter((item) => item.id !== logId)]);
        setLogs((value) => sortVideoLogs([stoppingLog, ...value.filter((item) => item.id !== logId)]));
        patchResult({ status: "stopping", durationMs: stoppingLog.durationMs, error: undefined, errorDetail: undefined });
        const active = () => videoTaskRunsRef.current.get(logId) === run;
        const savingStop = saveGenerationLog(stoppingLog, active).catch(() => undefined);
        let stoppedSuccessfully = false;
        try {
            const submittedLog = run.backend === "workflow" ? await run.submission?.catch(() => undefined) : undefined;
            let nextLog: GenerationLog;
            let stopErrorMessage = "";
            try {
                let confirmed = !run.backend;
                if (run.backend) {
                    const result = await requestStop(() => stopCanvasTask("video", run.id, run.backend === "workflow" && isClientVideoTaskId(run.id), "video-workbench"));
                    confirmed = Boolean(result.stopped);
                }
                if (confirmed || localClientTask) {
                    run.controller.abort();
                    nextLog = { ...(submittedLog ?? stoppingLog), status: "已停止", durationMs: stoppingLog.durationMs, error: undefined, errorDetail: undefined };
                } else {
                    await settleWithTimeout([savingStop, run.poll], STOP_SETTLE_TIMEOUT_MS);
                    if (!active()) return;
                    if (run.settledLog) {
                        const settled = run.settledLog;
                        run.settledLog = undefined;
                        await saveGenerationLog(settled, active);
                        setResults((value) => active() ? value.filter((item) => item.taskLogId !== logId && item.id !== logId) : value);
                        return;
                    }
                    if (submittedLog?.status === "失败") {
                        patchResult({ status: "failed", durationMs: submittedLog.durationMs, error: submittedLog.error, errorDetail: submittedLog.errorDetail });
                        await saveGenerationLog(submittedLog, active);
                        return;
                    }
                    const resumedLog: GenerationLog = { ...(submittedLog ?? log), status: "生成中", error: undefined, errorDetail: undefined };
                    patchResult({ status: "pending", error: undefined, errorDetail: undefined });
                    await saveGenerationLog(resumedLog, active);
                    return;
                }
            } catch (error) {
                if (run.backend && !localClientTask) {
                    // 后端任务停止失败时不冻结：恢复为「生成中」继续轮询。
                    stopErrorMessage = `停止失败，已恢复轮询：${errorMessage(error)}`;
                    nextLog = { ...(submittedLog ?? stoppingLog), status: "生成中", durationMs: stoppingLog.durationMs, error: undefined, errorDetail: undefined };
                } else {
                    // 本地 client 任务没有可回退的后端停止语义，直接 abort 本地轮询并落已停止。
                    run.controller.abort();
                    nextLog = { ...(submittedLog ?? stoppingLog), status: "已停止", durationMs: stoppingLog.durationMs, error: undefined, errorDetail: undefined };
                }
            }
            await settleWithTimeout([run.submission, run.poll, historySyncRef.current, savingStop], STOP_SETTLE_TIMEOUT_MS);
            if (!active()) return;
            if (run.settledLog) {
                // 停止等待期间任务已经完成，以完成结果为准，不再写回停止状态。
                const settled = run.settledLog;
                run.settledLog = undefined;
                await saveGenerationLog(settled, active);
                setResults((value) => active() ? value.filter((item) => item.taskLogId !== logId && item.id !== logId) : value);
                return;
            }
            stoppedSuccessfully = nextLog.status === "已停止";
            logsRef.current = sortVideoLogs([nextLog, ...logsRef.current.filter((item) => item.id !== logId)]);
            setLogs((value) => sortVideoLogs([nextLog, ...value.filter((item) => item.id !== logId)]));
            patchResult(stoppedSuccessfully
                ? { status: "stopped", durationMs: nextLog.durationMs, error: undefined, errorDetail: undefined }
                : { status: "pending", durationMs: nextLog.durationMs, error: nextLog.error, errorDetail: nextLog.errorDetail });
            if (stopErrorMessage) onError(stopErrorMessage);
            else if (nextLog.error) onError(nextLog.error);
            await saveGenerationLog(nextLog, active).catch((error) => { onError(`${nextLog.status === "已停止" ? "任务已停止，但记录保存失败" : "停止记录保存失败"}：${errorMessage(error)}`); });
            if (active()) await persistVideoLog(nextLog);
        } finally {
            run.stopping = false;
            if (!active()) await Promise.allSettled([logStore.removeItem(logId), deleteAccountVideoLogs([stoppingLog])]);
            // 已确认停止后移除运行记录并保持 abort 状态，页面轮询不会再为它重启任务。
            else if (stoppedSuccessfully) videoTaskRunsRef.current.delete(logId);
        }
    }, [deleteAccountVideoLogs, historySyncRef, logsRef, onError, persistVideoLog, saveGenerationLog, setLogs, setResults, videoTaskRunsRef]);

    return { stopVideoTask };
}
