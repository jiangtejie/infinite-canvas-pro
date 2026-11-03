"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { nanoid } from "nanoid";

import { createCanvasImageTask, type CanvasImageTask } from "@/services/api/image";
import { submitWorkflowTask } from "@/services/api/workflow-generation";
import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import type { GeneratedImage, GenerationLog, GenerationResult, RequestSnapshot } from "../history";
import { buildLog, createPendingResult, errorDetail, errorMessage, imageLogTaskId, mergePendingLogResults, updateResult, updateResultByLogId } from "../history";

type BatchNotify = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
};

type UseImageBatchGenerationOptions = {
    saveLog: (log: GenerationLog, active?: () => boolean) => Promise<void>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    setPreviewLog: Dispatch<SetStateAction<GenerationLog | null>>;
    setNow: Dispatch<SetStateAction<number>>;
    activeResultCategoryId: string | null;
    runGenerationTask: (resultId: string, snapshot: RequestSnapshot) => Promise<GeneratedImage>;
    usesBackendImageTasks: (config: AiConfig) => boolean;
    notify: BatchNotify;
};

/**
 * 图片批量生成：持久化任务创建、后端任务轮询入口、本地并发生成。
 */
export function useImageBatchGeneration({ saveLog, setResults, setPreviewLog, setNow, activeResultCategoryId, runGenerationTask, usesBackendImageTasks, notify }: UseImageBatchGenerationOptions) {
    const createPersistentImageTask = useCallback(async (pendingLog: GenerationLog, snapshot: RequestSnapshot, index: number, taskCount: number, workflowToken: string) => {
        const active = () => !snapshot.workflowRef || useUserStore.getState().token === workflowToken;
        try {
            let task: CanvasImageTask;
            if (snapshot.workflowRef) {
                if (!workflowToken) throw new Error("工作流生成需要先登录");
                const referenceImages = await Promise.all(snapshot.references.map(imageToDataUrl));
                if (!active()) throw new Error("登录状态已变化");
                const created = await submitWorkflowTask(workflowToken, {
                    ref: snapshot.workflowRef,
                    expectedCapability: "image",
                    prompt: snapshot.text,
                    systemPrompt: snapshot.requestConfig.systemPrompt,
                    referenceImages,
                    size: snapshot.requestConfig.size,
                    quality: snapshot.requestConfig.quality,
                    count: 1,
                    source: "image-workbench",
                    sourceId: pendingLog.id,
                    clientTaskId: imageLogTaskId(pendingLog),
                });
                if (!active()) throw new Error("登录状态已变化");
                task = { id: created.id, status: created.status, progress: created.progress, source: "workflow", source_id: pendingLog.id };
            } else {
                task = await createCanvasImageTask(
                    { ...snapshot.requestConfig, seedIndex: index, seedCount: taskCount, count: "1" },
                    snapshot.text,
                    snapshot.references,
                    { source: "image-workbench", sourceId: pendingLog.id, clientTaskId: imageLogTaskId(pendingLog) },
                );
            }
            const nextLog = { ...pendingLog, task, lastPolledAt: Date.now() };
            await saveLog(nextLog, active);
            if (!active()) throw new Error("登录状态已变化");
            setResults((value) => updateResultByLogId(value, pendingLog.id, { taskLogId: nextLog.id, task, progress: task.progress, lastPolledAt: nextLog.lastPolledAt }));
            return nextLog;
        } catch (error) {
            if (!active()) throw error;
            const nextLog = { ...pendingLog, status: "失败" as const, durationMs: Date.now() - pendingLog.createdAt, failCount: 1, errors: [errorMessage(error)], errorDetails: [errorDetail(error)], lastPolledAt: Date.now() };
            await saveLog(nextLog, active);
            if (!active()) throw error;
            setResults((value) => updateResultByLogId(value, pendingLog.id, { status: "failed", error: nextLog.errors[0], errorDetail: nextLog.errorDetails?.[0], durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
            throw error;
        }
    }, [saveLog, setResults]);

    const submitPersistentGenerationBatch = useCallback(async (snapshot: RequestSnapshot) => {
        const workflowToken = snapshot.workflowRef ? useUserStore.getState().token : "";
        const active = () => !snapshot.workflowRef || useUserStore.getState().token === workflowToken;
        setPreviewLog(null);
        const taskCount = Math.max(1, Number(snapshot.displayConfig.count) || 1);
        const pendingLogs = Array.from({ length: taskCount }, () => {
            const id = nanoid();
            const clientTaskId = `client_image_task_${id}`;
            const task: CanvasImageTask = { id: clientTaskId, status: "queued", progress: 0, createdAt: Date.now().toString(), created_at: Date.now().toString() };
            return buildLog({
                id,
                prompt: snapshot.text,
                model: snapshot.displayConfig.imageModel || snapshot.displayConfig.model,
                config: { ...snapshot.displayConfig, count: "1" },
                references: snapshot.references,
                durationMs: 0,
                successCount: 0,
                failCount: 0,
                status: "生成中",
                images: [],
                errors: [],
                errorDetails: [],
                categoryIds: activeResultCategoryId ? [activeResultCategoryId] : [],
                providerWorkflowRef: snapshot.workflowRef,
                task,
                lastPolledAt: Date.now(),
            });
        });
        setResults((value) => mergePendingLogResults(value, pendingLogs));
        setNow(Date.now());
        const settled = await Promise.allSettled(pendingLogs.map((log, index) => createPersistentImageTask(log, snapshot, index, taskCount, workflowToken)));
        if (!active()) return;
        const createdCount = settled.filter((item) => item.status === "fulfilled").length;
        if (createdCount) notify.success(`已创建 ${createdCount} 个图片任务`);
        if (createdCount < pendingLogs.length) notify.warning(`${pendingLogs.length - createdCount} 个图片任务创建失败`);
    }, [activeResultCategoryId, createPersistentImageTask, notify, setNow, setPreviewLog, setResults]);

    const submitGenerationBatch = useCallback(async (snapshot: RequestSnapshot) => {
        if (snapshot.workflowRef || usesBackendImageTasks(snapshot.requestConfig)) {
            await submitPersistentGenerationBatch(snapshot);
            return;
        }
        setPreviewLog(null);
        const taskCount = Math.max(1, Number(snapshot.displayConfig.count) || 1);
        const taskIds = Array.from({ length: taskCount }, () => nanoid());
        const pendingTasks = taskIds.map((id) => createPendingResult(id, snapshot));
        setResults((value) => [...pendingTasks, ...value]);
        setNow(Date.now());

        await Promise.allSettled(taskIds.map(async (id, index) => {
            const taskStartedAt = performance.now();
            try {
                const image = await runGenerationTask(id, {
                    ...snapshot,
                    requestConfig: { ...snapshot.requestConfig, seedIndex: index, seedCount: taskCount },
                });
                const durableImage = { ...image, storageKey: image.storageKey || "" };
                setResults((value) => updateResult(value, id, { image: durableImage }));
                await saveLog(buildLog({
                    prompt: snapshot.text,
                    model: snapshot.displayConfig.imageModel || snapshot.displayConfig.model,
                    config: { ...snapshot.displayConfig, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - taskStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "成功",
                    images: [durableImage],
                    errors: [],
                    errorDetails: [],
                    categoryIds: activeResultCategoryId ? [activeResultCategoryId] : [],
                }));
                notify.success("图片已生成");
            } catch (error) {
                const nextError = errorMessage(error);
                await saveLog(buildLog({
                    prompt: snapshot.text,
                    model: snapshot.displayConfig.imageModel || snapshot.displayConfig.model,
                    config: { ...snapshot.displayConfig, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - taskStartedAt,
                    successCount: 0,
                    failCount: 1,
                    status: "失败",
                    images: [],
                    errors: [nextError],
                    errorDetails: [errorDetail(error)],
                    categoryIds: activeResultCategoryId ? [activeResultCategoryId] : [],
                }));
                notify.error(nextError || "生成失败");
            } finally {
                setResults((value) => value.filter((item) => item.id !== id));
            }
        }));
    }, [activeResultCategoryId, notify, runGenerationTask, saveLog, setNow, setPreviewLog, setResults, submitPersistentGenerationBatch, usesBackendImageTasks]);

    return { submitGenerationBatch };
}
