"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CanvasImageTask } from "@/services/api/image";
import { batchCanvasImageTaskStatus } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import { comfyOutputStorageKey, getWorkflowTask, isRetryableWorkflowError } from "@/services/api/workflow-generation";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import type { GenerationLog, GenerationResult, WorkflowPollContext } from "../history";
import { imageLogFromTask, imageLogsFromTask, imageLogTaskId, imageResultMatchesLog, updateResultByLogId } from "../history";
import { errorMessage } from "@/lib/utils";

type UseImageTaskPollingOptions = {
    pollingLogIdsRef: MutableRefObject<Set<string>>;
    imageTaskConfig: () => AiConfig;
    saveLog: (log: GenerationLog, active?: () => boolean) => Promise<void>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    onError: (message: string) => void;
};

/**
 * 图片任务轮询：普通渠道批量查询状态，工作流渠道逐个查询并回传产物。
 */
export function useImageTaskPolling({ pollingLogIdsRef, imageTaskConfig, saveLog, setResults, onError }: UseImageTaskPollingOptions) {
    const pollImageTaskLogsOnce = useCallback(async (pendingLogs: GenerationLog[], context: WorkflowPollContext) => {
        const active = () => !context.signal.aborted && useUserStore.getState().token === context.token;
        const ids = pendingLogs.map(imageLogTaskId).filter(Boolean);
        if (!ids.length) return;
        pendingLogs.forEach((log) => pollingLogIdsRef.current.add(log.id));
        try {
            const normalLogs = pendingLogs.filter((log) => !log.providerWorkflowRef);
            const normalTasks = normalLogs.length ? await batchCanvasImageTaskStatus(imageTaskConfig(), normalLogs.map(imageLogTaskId)) : [];
            const workflowTasks = await Promise.all(pendingLogs.filter((log) => log.providerWorkflowRef).map(async (log): Promise<CanvasImageTask | null> => {
                if (!context.token) return { ...log.task!, status: "running" };
                if (!active()) return null;
                try {
                    const current = await getWorkflowTask(context.token, imageLogTaskId(log), context.signal);
                    if (!active()) return null;
                    if (current.status === "succeeded") {
                        if (!current.urls?.length) return { ...log.task!, id: current.id, status: "failed", progress: 100, error: { message: "工作流完成但没有返回图片" } };
                        const stored = await Promise.all(current.urls.map(async (url): Promise<{ url: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string }> => {
                            const storageKey = comfyOutputStorageKey(url);
                            return storageKey
                                ? Promise.resolve({ url, storageKey, width: 0, height: 0, bytes: 0, mimeType: "image/png" })
                                : uploadImage(url, { token: context.token });
                        }));
                        if (!active()) return null;
                        return { ...log.task!, id: current.id, status: "completed", progress: 100, url: stored[0].url, image_url: stored[0].url, image_urls: stored.map((item) => item.url), imageStorage: stored, storageKey: stored[0].storageKey };
                    }
                    return { ...log.task!, id: current.id, status: current.status, progress: current.progress, error: current.error ? { message: current.error } : undefined };
                } catch (error) {
                    if (!active() || error instanceof Error && error.name === "AbortError") return null;
                    onError(errorMessage(error, "查询工作流任务失败"));
                    return { ...log.task!, status: isRetryableWorkflowError(error) ? "running" : "failed", error: { message: errorMessage(error, "查询工作流任务失败") } };
                }
            }));
            const tasks = [...normalTasks, ...workflowTasks.filter((task): task is CanvasImageTask => task !== null)];
            const taskById = new Map(tasks.map((task) => [task.id, task]));
            await Promise.all(
                pendingLogs.map(async (log) => {
                    const logActive = () => !log.providerWorkflowRef || active();
                    if (!logActive()) return;
                    const task = taskById.get(imageLogTaskId(log));
                    if (!task) {
                        const nextLog = { ...log, status: "失败" as const, durationMs: Date.now() - log.createdAt, failCount: 1, errors: ["图片任务不存在或未创建成功"], errorDetails: ["后端没有找到对应的图片任务"], lastPolledAt: Date.now() };
                        await saveLog(nextLog, logActive);
                        if (!logActive()) return;
                        setResults((value) => updateResultByLogId(value, log.id, { status: "failed", error: nextLog.errors[0], errorDetail: nextLog.errorDetails?.[0], durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                        return;
                    }
                    if ((task.image_urls?.length || 0) > 1) {
                        const nextLogs = imageLogsFromTask(log, task);
                        await Promise.all(nextLogs.map((nextLog) => saveLog(nextLog, logActive)));
                        if (!logActive()) return;
                        setResults((value) => value.filter((item) => !imageResultMatchesLog(item, nextLogs[0])));
                        return;
                    }

                    const nextLog = imageLogFromTask(log, task);
                    await saveLog(nextLog, logActive);
                    if (!logActive()) return;
                    if (nextLog.status === "生成中") {
                        setResults((value) => updateResultByLogId(value, log.id, { task, progress: task.progress, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                    } else {
                        setResults((value) => value.filter((item) => !imageResultMatchesLog(item, nextLog)));
                    }
                }),
            );
        } finally {
            pendingLogs.forEach((log) => pollingLogIdsRef.current.delete(log.id));
        }
    }, [imageTaskConfig, onError, pollingLogIdsRef, saveLog, setResults]);

    return { pollImageTaskLogsOnce };
}
