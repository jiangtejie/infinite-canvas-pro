"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { VideoRequestError, pollVideoGenerationTaskStatus } from "@/services/api/video";
import { comfyOutputStorageKey, getWorkflowTask } from "@/services/api/workflow-generation";
import { downloadRemoteMedia, uploadMediaFile } from "@/services/file-storage";

import type { GenerationLog, GenerationResult, WorkflowPollContext } from "../history";
import { errorDetail, errorMessage, isCompletedVideoTask, isFailedVideoTask, isTransientVideoPollError, updateResultByLogId, videoFromTaskResponse, videoLogTaskId } from "../history";

type UseVideoTaskPollingOptions = {
    pollingLogIdsRef: MutableRefObject<Set<string>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    saveGenerationLog: (log: GenerationLog, active?: () => boolean) => Promise<void>;
    finalizeGenerationLog: (log: GenerationLog, active?: () => boolean) => Promise<void>;
};

/**
 * 单个视频任务轮询：普通接口拉状态，工作流拉结果并按需下载 / 转存视频。
 */
export function useVideoTaskPolling({ pollingLogIdsRef, setResults, saveGenerationLog, finalizeGenerationLog }: UseVideoTaskPollingOptions) {
    const pollPendingLogOnce = useCallback(async (log: GenerationLog, resumeConfig: AiConfig, context: WorkflowPollContext) => {
        const active = () => !context.signal.aborted && (!log.providerWorkflowRef || useUserStore.getState().token === context.token);
        if (!active()) return;
        pollingLogIdsRef.current.add(log.id);
        const startedAt = log.createdAt || Date.now();
        try {
            const workflowTask = log.providerWorkflowRef ? await getWorkflowTask(context.token, videoLogTaskId(log), context.signal) : null;
            if (!active()) return;
            const workflowURL = workflowTask?.urls?.[0] || "";
            const task = workflowTask ? { ...log.task!, status: workflowTask.status, progress: workflowTask.progress, video_url: workflowURL, url: workflowURL, storageKey: comfyOutputStorageKey(workflowURL) || undefined, error: workflowTask.error ? { message: workflowTask.error } : undefined } : await pollVideoGenerationTaskStatus(resumeConfig, log.task!, context.signal);
            if (!active()) return;
            const durationMs = Date.now() - startedAt;
            const baseLog = { ...log, task, durationMs, lastPolledAt: Date.now() };
            if (isFailedVideoTask(task)) {
                const nextLog = { ...baseLog, status: "失败" as const, error: task.error?.message || "视频生成失败", errorDetail: errorDetail(new VideoRequestError(task.error?.message || "视频生成失败", task)) };
                await finalizeGenerationLog(nextLog, active);
                if (!active()) return;
                setResults((value) => updateResultByLogId(value, log.id, { status: "failed", task, error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                return;
            }
            if (isCompletedVideoTask(task)) {
                if (!task.video_url && !task.url) {
                    const nextLog = { ...baseLog, status: "失败" as const, error: "视频生成完成但没有返回视频地址", errorDetail: errorDetail(new VideoRequestError("视频生成完成但没有返回视频地址", task)) };
                    await finalizeGenerationLog(nextLog, active);
                    if (!active()) return;
                    setResults((value) => updateResultByLogId(value, log.id, { status: "failed", task, error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                    return;
                }
                const workflowVideo = workflowTask && !comfyOutputStorageKey(task.video_url || task.url || "") ? await downloadRemoteMedia(task.video_url || task.url || "") : null;
                if (!active()) return;
                const uploaded = workflowVideo ? await uploadMediaFile(workflowVideo, "workflow-video", undefined, context.token) : null;
                if (!active()) return;
                const video = uploaded ? { ...videoFromTaskResponse(task, durationMs), url: uploaded.url, storageKey: uploaded.storageKey, bytes: uploaded.bytes, mimeType: uploaded.mimeType, width: uploaded.width || 1280, height: uploaded.height || 720 } : videoFromTaskResponse(task, durationMs);
                const nextLog = { ...baseLog, status: "成功" as const, video, error: undefined, errorDetail: undefined };
                await finalizeGenerationLog(nextLog, active);
                if (!active()) return;
                setResults((value) => active() ? value.filter((item) => item.taskLogId !== log.id && item.id !== log.id) : value);
                return;
            }
            await saveGenerationLog(baseLog, active);
            if (!active()) return;
            setResults((value) => updateResultByLogId(value, log.id, { task, progress: task.progress, durationMs, lastPolledAt: baseLog.lastPolledAt }));
        } catch (error) {
            if (!active() || error instanceof Error && error.name === "AbortError") return;
            const nextLog = { ...log, durationMs: Date.now() - startedAt, lastPolledAt: Date.now(), error: errorMessage(error), errorDetail: errorDetail(error) };
            if (isTransientVideoPollError(error)) {
                await saveGenerationLog({ ...nextLog, status: "生成中" }, active);
                if (!active()) return;
                setResults((value) => updateResultByLogId(value, log.id, { error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                return;
            }
            await finalizeGenerationLog({ ...nextLog, status: "失败" }, active);
            if (!active()) return;
            setResults((value) => updateResultByLogId(value, log.id, { status: "failed", error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
        } finally {
            pollingLogIdsRef.current.delete(log.id);
        }
    }, [finalizeGenerationLog, pollingLogIdsRef, saveGenerationLog, setResults]);

    return { pollPendingLogOnce };
}
