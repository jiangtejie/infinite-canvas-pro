"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { fetchVideoGenerationLogs } from "@/services/api/generation-logs";
import { listVideoGenerationTasks } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";

import type { GenerationLog, GenerationResult } from "../history";
import { dedupeVideoLogs, isRecoverableBackendVideoTask, mergeBackendVideoTasks, mergePendingLogResults, mergeVideoLogs, persistStoredVideoLogs, readStoredLogs, replaceStoredVideoHistory, videoLogIdentityKeys, videoTaskIdentityKeys } from "../history";

type UseVideoHistorySyncOptions = {
    token: string;
    effectiveConfigRef: MutableRefObject<AiConfig>;
    logsRef: MutableRefObject<GenerationLog[]>;
    setLogs: Dispatch<SetStateAction<GenerationLog[]>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    usesBackendVideoTasks: (config: AiConfig) => boolean;
};

/**
 * 视频历史：账号远端与本地合并，以及后端未完成任务恢复。
 */
export function useVideoHistorySync({ token, effectiveConfigRef, logsRef, setLogs, setResults, usesBackendVideoTasks }: UseVideoHistorySyncOptions) {
    const syncBackendVideoTasks = useCallback(async (baseLogs?: GenerationLog[]) => {
        const config = effectiveConfigRef.current;
        if (!token || !usesBackendVideoTasks(config)) return baseLogs || logsRef.current;
        try {
            const tasks = await listVideoGenerationTasks(config);
            const recoverableTasks = tasks.filter(isRecoverableBackendVideoTask);
            if (!recoverableTasks.length) return baseLogs || logsRef.current;
            const currentLogs = baseLogs || (await readStoredLogs());
            const mergedLogs = mergeBackendVideoTasks(currentLogs, recoverableTasks, config);
            const taskKeys = new Set(recoverableTasks.flatMap(videoTaskIdentityKeys));
            const recoveredLogs = mergedLogs.filter((log) => videoLogIdentityKeys(log).some((key) => taskKeys.has(key)));
            await persistStoredVideoLogs(recoveredLogs);
            setLogs((value) => dedupeVideoLogs([...mergedLogs, ...value.filter((log) => log.status === "停止中" || log.status === "已停止")]));
            setResults((value) => mergePendingLogResults(value, mergedLogs.filter((log) => log.status === "生成中" && log.task && !log.video)));
            return mergedLogs;
        } catch {
            return baseLogs || logsRef.current;
        }
    }, [effectiveConfigRef, logsRef, setLogs, setResults, token, usesBackendVideoTasks]);

    const loadAccountVideoHistory = useCallback(async () => {
        try {
            const localLogs = await readStoredLogs();
            const remoteLogs = await fetchVideoGenerationLogs<GenerationLog>(token);
            const mergedLogs = await mergeVideoLogs(remoteLogs, localLogs);
            await replaceStoredVideoHistory(mergedLogs);
            setLogs((value) => dedupeVideoLogs([...mergedLogs, ...value.filter((log) => log.status === "停止中" || log.status === "已停止")]));
            return mergedLogs;
        } catch {
            return undefined;
        }
    }, [setLogs, token]);

    return { loadAccountVideoHistory, syncBackendVideoTasks };
}
