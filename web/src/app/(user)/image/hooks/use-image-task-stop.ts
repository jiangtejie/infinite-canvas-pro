"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { stopCanvasTask } from "@/services/api/canvas-tasks";

import type { GenerationLog, GenerationResult } from "../history";
import { errorMessage } from "../history";

type UseImageTaskStopOptions = {
    logsRef: MutableRefObject<GenerationLog[]>;
    setLogs: Dispatch<SetStateAction<GenerationLog[]>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    saveLog: (log: GenerationLog, active?: () => boolean) => Promise<void>;
    onError: (message: string) => void;
};

/**
 * 停止生图任务：后端已落库的任务统一走 /canvas/tasks/stop（来源 image-workbench）。
 * 停止失败时恢复为「生成中」，让原有轮询继续接管，不丢任务。
 */
export function useImageTaskStop({ logsRef, setLogs, setResults, saveLog, onError }: UseImageTaskStopOptions) {
    const stopImageTask = useCallback(async (logId: string) => {
        const log = logsRef.current.find((item) => item.id === logId);
        if (!log?.task?.id || (log.status !== "生成中" && log.status !== "停止中")) return;
        const active = () => logsRef.current.some((item) => item.id === logId && item.status === "停止中");
        // 直接按 logId 更新结果：stale stopping 保护会挡掉 resumed/stopped 等合法状态回写。
        const patchResult = (patch: Partial<GenerationResult>) => {
            setResults((value) => value.map((item) => (item.taskLogId === logId || item.id === logId ? { ...item, ...patch } : item)));
        };
        const replaceLog = (nextLog: GenerationLog) => {
            logsRef.current = logsRef.current.map((item) => item.id === logId ? nextLog : item);
            setLogs((value) => value.map((item) => item.id === logId ? nextLog : item));
        };
        const stoppingLog: GenerationLog = { ...log, status: "停止中" };
        replaceLog(stoppingLog);
        patchResult({ status: "stopping", error: undefined, errorDetail: undefined });
        const savingStop = saveLog(stoppingLog, active).catch(() => undefined);
        try {
            const result = await stopCanvasTask("image", log.task.id, false, "image-workbench");
            await Promise.allSettled([savingStop]);
            if (!result.stopped) {
                const resumedLog: GenerationLog = { ...log, status: "生成中" };
                replaceLog(resumedLog);
                patchResult({ status: "pending", error: undefined, errorDetail: undefined });
                await saveLog(resumedLog);
                onError("停止失败：任务可能已经完成，已恢复轮询");
                return;
            }
            const stoppedLog: GenerationLog = { ...log, status: "已停止", durationMs: Math.max(0, Date.now() - log.createdAt), errorDetails: [] };
            replaceLog(stoppedLog);
            patchResult({ status: "stopped", durationMs: stoppedLog.durationMs, error: undefined, errorDetail: undefined });
            await saveLog(stoppedLog);
        } catch (error) {
            const resumedLog: GenerationLog = { ...log, status: "生成中" };
            replaceLog(resumedLog);
            patchResult({ status: "pending", error: undefined, errorDetail: undefined });
            await saveLog(resumedLog).catch(() => undefined);
            onError(errorMessage(error) || "停止失败");
        }
    }, [logsRef, onError, saveLog, setLogs, setResults]);

    return { stopImageTask };
}
