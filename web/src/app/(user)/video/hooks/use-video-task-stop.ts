"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { stopCanvasTask } from "@/services/api/canvas-tasks";

import type { GenerationLog, GenerationResult } from "../history";
import { errorDetail, errorMessage, isClientVideoTaskId, logStore, sortVideoLogs, updateResultByLogId } from "../history";
import type { VideoTaskRun } from "../task-types";

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
 * 停止视频任务：先向后端请求停止，未确认时恢复轮询；本地兜底 abort 并落库。
 */
export function useVideoTaskStop({ videoTaskRunsRef, logsRef, historySyncRef, setLogs, setResults, saveGenerationLog, persistVideoLog, deleteAccountVideoLogs, onError }: UseVideoTaskStopOptions) {
    const stopVideoTask = useCallback(async (logId: string) => {
        const log = logsRef.current.find((item) => item.id === logId);
        if (!log?.task || (log.status !== "生成中" && log.status !== "停止中")) return;
        const run: VideoTaskRun = videoTaskRunsRef.current.get(logId) || { id: log.task.id, controller: new AbortController(), backend: log.taskBackend };
        if (run.stopping) return;
        run.stopping = true;
        videoTaskRunsRef.current.set(logId, run);
        const stoppingLog: GenerationLog = { ...log, status: "停止中", durationMs: Math.max(0, Date.now() - log.createdAt), error: undefined, errorDetail: undefined };
        logsRef.current = sortVideoLogs([stoppingLog, ...logsRef.current.filter((item) => item.id !== logId)]);
        setLogs((value) => sortVideoLogs([stoppingLog, ...value.filter((item) => item.id !== logId)]));
        setResults((value) => updateResultByLogId(value, logId, { status: "stopping", durationMs: stoppingLog.durationMs, error: undefined, errorDetail: undefined }));
        const active = () => videoTaskRunsRef.current.get(logId) === run;
        const savingStop = saveGenerationLog(stoppingLog, active).catch(() => undefined);
        try {
            const submittedLog = run.backend === "workflow" ? await run.submission?.catch(() => undefined) : undefined;
            let nextLog: GenerationLog;
            try {
                if (run.backend) {
                    const result = await stopCanvasTask("video", run.id, run.backend === "workflow" && isClientVideoTaskId(run.id), "video-workbench");
                    if (!result.stopped) {
                        await Promise.allSettled([savingStop, run.poll]);
                        if (!active()) return;
                        if (run.settledLog) {
                            const settled = run.settledLog;
                            run.settledLog = undefined;
                            await saveGenerationLog(settled, active);
                            setResults((value) => active() ? value.filter((item) => item.taskLogId !== logId && item.id !== logId) : value);
                            return;
                        }
                        if (submittedLog?.status === "失败") {
                            setResults((value) => value.map((item) =>
                                (item.taskLogId === logId || item.id === logId) && item.status === "stopping"
                                    ? { ...item, status: "failed" as const, durationMs: submittedLog.durationMs, error: submittedLog.error, errorDetail: submittedLog.errorDetail }
                                    : item,
                            ));
                            await saveGenerationLog(submittedLog, active);
                            return;
                        }
                        const resumedLog: GenerationLog = { ...(submittedLog ?? log), status: "生成中", error: undefined, errorDetail: undefined };
                        setResults((value) => value.map((item) =>
                            (item.taskLogId === logId || item.id === logId) && item.status === "stopping"
                                ? { ...item, status: "pending" as const, error: undefined, errorDetail: undefined }
                                : item,
                        ));
                        await saveGenerationLog(resumedLog, active);
                        return;
                    }
                }
                run.controller.abort();
                nextLog = { ...(submittedLog ?? stoppingLog), status: "已停止", durationMs: stoppingLog.durationMs, error: undefined, errorDetail: undefined };
            } catch (error) {
                nextLog = { ...(submittedLog ?? stoppingLog), status: "停止中", durationMs: stoppingLog.durationMs, error: errorMessage(error), errorDetail: errorDetail(error) };
            }
            await Promise.allSettled([run.submission, run.poll, historySyncRef.current, savingStop]);
            if (!active()) return;
            logsRef.current = sortVideoLogs([nextLog, ...logsRef.current.filter((item) => item.id !== logId)]);
            setLogs((value) => sortVideoLogs([nextLog, ...value.filter((item) => item.id !== logId)]));
            setResults((value) => updateResultByLogId(value, logId, { status: nextLog.status === "已停止" ? "stopped" : "stopping", durationMs: nextLog.durationMs, error: nextLog.error, errorDetail: nextLog.errorDetail }));
            if (nextLog.error) onError(nextLog.error);
            await saveGenerationLog(nextLog, active).catch((error) => { onError(`${nextLog.status === "已停止" ? "任务已停止，但记录保存失败" : "停止记录保存失败"}：${errorMessage(error)}`); });
            if (active()) await persistVideoLog(nextLog);
        } finally {
            run.stopping = false;
            if (!active()) await Promise.allSettled([logStore.removeItem(logId), deleteAccountVideoLogs([stoppingLog])]);
        }
    }, [deleteAccountVideoLogs, historySyncRef, logsRef, onError, persistVideoLog, saveGenerationLog, setLogs, setResults, videoTaskRunsRef]);

    return { stopVideoTask };
}
