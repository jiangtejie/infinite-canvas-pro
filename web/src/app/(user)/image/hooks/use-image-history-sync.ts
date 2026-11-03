"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { listCanvasImageTasks } from "@/services/api/image";
import { fetchImageGenerationLogs, saveImageGenerationLogs } from "@/services/api/generation-logs";
import type { AiConfig } from "@/stores/use-config-store";

import type { GenerationCategory, GenerationLog, GenerationResult } from "../history";
import { imageLogIdentityKeys, imageTaskIdentityKeys, isRecoverableImageTask, logStore, mergeBackendImageTasks, mergeGenerationLogs, mergePendingLogResults, readStoredCategories, readStoredLogs, replaceStoredImageHistory, serializeLog, withWorkflowLogCategories } from "../history";

type UseImageHistorySyncOptions = {
    token: string;
    logsRef: MutableRefObject<GenerationLog[]>;
    accountHistorySyncEnabledRef: MutableRefObject<boolean>;
    imageTaskConfig: () => AiConfig;
    setCategories: Dispatch<SetStateAction<GenerationCategory[]>>;
    setLogs: Dispatch<SetStateAction<GenerationLog[]>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
};

/**
 * 图片历史：账号远端与本地合并，以及后端未完成任务的恢复。
 */
export function useImageHistorySync({ token, logsRef, accountHistorySyncEnabledRef, imageTaskConfig, setCategories, setLogs, setResults }: UseImageHistorySyncOptions) {
    const loadAccountImageHistory = useCallback(async () => {
        try {
            accountHistorySyncEnabledRef.current = true;
            const localLogs = await readStoredLogs();
            const storedCategories = await readStoredCategories();
            const remoteLogs = await fetchImageGenerationLogs<GenerationLog>(token);
            const mergedLogs = await mergeGenerationLogs(remoteLogs, localLogs);
            const categorized = withWorkflowLogCategories(mergedLogs, storedCategories);
            await replaceStoredImageHistory(categorized.logs, categorized.categories);
            setCategories(categorized.categories);
            setLogs(categorized.logs);
            return categorized.logs;
        } catch {
            return undefined;
        }
    }, [accountHistorySyncEnabledRef, setCategories, setLogs, token]);

    const persistImageHistory = useCallback(async (nextLogs: GenerationLog[], _nextCategories: GenerationCategory[]) => {
        if (!token || !accountHistorySyncEnabledRef.current) return;
        await saveImageGenerationLogs(token, nextLogs.map(serializeLog)).catch(() => {
            accountHistorySyncEnabledRef.current = false;
        });
    }, [accountHistorySyncEnabledRef, token]);

    const syncBackendImageTasks = useCallback(async (baseLogs?: GenerationLog[]) => {
        const currentConfig = imageTaskConfig();
        if (!token) return baseLogs || logsRef.current;
        try {
            const tasks = await listCanvasImageTasks(currentConfig, ["image-workbench", "workflow"]);
            const recoverableTasks = tasks.filter(isRecoverableImageTask);
            if (!recoverableTasks.length) return baseLogs || logsRef.current;
            const currentLogs = baseLogs || (await readStoredLogs());
            const mergedLogs = mergeBackendImageTasks(currentLogs, recoverableTasks, currentConfig);
            const taskIds = new Set(recoverableTasks.flatMap(imageTaskIdentityKeys));
            const recoveredLogs = mergedLogs.filter((log) => imageLogIdentityKeys(log).some((key) => taskIds.has(key)));
            await Promise.all(recoveredLogs.map((log) => logStore.setItem(log.id, serializeLog(log))));
            setLogs(mergedLogs);
            setResults((value) => mergePendingLogResults(value, recoveredLogs));
            return mergedLogs;
        } catch {
            return baseLogs || logsRef.current;
        }
    }, [imageTaskConfig, logsRef, setLogs, setResults, token]);

    return { loadAccountImageHistory, persistImageHistory, syncBackendImageTasks };
}
