"use client";

import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";

import { accountScopedStore } from "@/lib/account-storage";
import { batchCanvasImageTaskStatus, type CanvasImageTask } from "@/services/api/image";
import { stopCanvasTask } from "@/services/api/canvas-tasks";
import { fetchImageGenerationLogs, saveImageGenerationLogs } from "@/services/api/generation-logs";
import type { AiConfig } from "@/stores/use-config-store";
import { errorMessage } from "@/lib/utils";
import { nowMs } from "@/lib/now";

import { isFailedCanvasImageTask, isFinishedCanvasImageTask, isWorkflowBackedLog, serializeHistoryLog, workflowResultsFromStoredLog, workflowTaskFromStoredLogs, workflowTaskImagesFromCanvasTask, workflowTaskParentId, workflowTaskParentIndex } from "./creative-workflow-model";
import type { ImageHistoryLog, SeriesPromptDraft, TrackedWorkflowTaskState, WorkflowExternalTaskFailure, WorkflowExternalTaskSuccess, WorkflowRunResult, WorkflowTask } from "./creative-workflow-types";

const imageLogStore = accountScopedStore("image_generation_logs");

async function readWorkflowGenerationLogs(): Promise<ImageHistoryLog[]> {
    try {
        const logs: ImageHistoryLog[] = [];
        await imageLogStore.iterate<ImageHistoryLog, void>((value) => {
            if (value?.id) logs.push(value);
        });
        return logs;
    } catch {
        return [];
    }
}

async function mergeRemoteWorkflowLogs(token: string, localLogs: ImageHistoryLog[]) {
    try {
        const remoteLogs = await fetchImageGenerationLogs<ImageHistoryLog>(token);
        const byId = new Map(localLogs.map((log) => [log.id, log]));
        remoteLogs.forEach((log) => {
            if (log?.id && !byId.has(log.id)) byId.set(log.id, log);
        });
        return Array.from(byId.values());
    } catch {
        return localLogs;
    }
}

type Options = {
    token: string;
    effectiveConfig: AiConfig;
    stoppingTaskIds: string[];
    setWorkflowTasks: Dispatch<SetStateAction<WorkflowTask[]>>;
    setRunResults: Dispatch<SetStateAction<WorkflowRunResult[]>>;
    setStoppingTaskIds: Dispatch<SetStateAction<string[]>>;
    updateSeriesDraft: (id: string, patch: Partial<SeriesPromptDraft>) => void;
    onGenerationLogSaved?: () => void;
    onWorkflowTaskSuccess?: (task: WorkflowExternalTaskSuccess) => void;
    onWorkflowTaskFailure?: (task: WorkflowExternalTaskFailure) => void;
};

export function useWorkflowTaskRecovery({ token, effectiveConfig, stoppingTaskIds, setWorkflowTasks, setRunResults, setStoppingTaskIds, updateSeriesDraft, onGenerationLogSaved, onWorkflowTaskSuccess, onWorkflowTaskFailure }: Options) {
    const { message } = App.useApp();
    const recoveredTaskLogIdsRef = useRef(new Set<string>());
    const recoveredTaskMissesRef = useRef(new Map<string, number>());
    const recoveredPollErrorRef = useRef(false);
    const trackedTaskLogRef = useRef(new Map<string, string>());
    const trackedTasksRef = useRef(new Map<string, TrackedWorkflowTaskState>());
    const pollRecoveredWorkflowTasksRef = useRef<() => Promise<void>>(async () => undefined);

    const saveWorkflowTaskLog = async (log: ImageHistoryLog) => {
        await imageLogStore.setItem(log.id, serializeHistoryLog(log));
        if (token) await saveImageGenerationLogs(token, [serializeHistoryLog(log)]).catch(() => undefined);
    };

    const applyRecoveredCanvasTask = async (log: ImageHistoryLog, task: CanvasImageTask, submitted = false) => {
        const finishedAt = nowMs();
        const durationMs = Math.max(0, finishedAt - log.createdAt);
        if (isFailedCanvasImageTask(task)) {
            const errorText = task.error?.message || "工作流运行失败";
            const nextLog: ImageHistoryLog = { ...log, status: "失败", durationMs, failCount: 1, errors: [errorText], task, lastPolledAt: finishedAt };
            await saveWorkflowTaskLog(nextLog);
            if (!submitted) setWorkflowTasks((value) => value.map((item) => item.id === log.id ? { ...item, status: "failed", endedAt: finishedAt, durationMs, error: errorText } : item));
            return { status: "failed" as const, log: nextLog };
        }
        const images = workflowTaskImagesFromCanvasTask(task, durationMs);
        const nextLog: ImageHistoryLog = { ...log, status: "成功", images, thumbnails: images.map((image) => image.dataUrl), imageCount: images.length, successCount: images.length, failCount: 0, durationMs, errors: [], task, lastPolledAt: finishedAt };
        await saveWorkflowTaskLog(nextLog);
        if (!submitted) {
            const results = workflowResultsFromStoredLog(nextLog);
            setWorkflowTasks((value) => value.map((item) => item.id === log.id ? { ...item, status: "success", endedAt: finishedAt, durationMs, images: results } : item));
            setRunResults((value) => [...results, ...value]);
        }
        return { status: "success" as const, log: nextLog };
    };

    const completeTrackedWorkflowTask = (parentTaskId: string, status: "success" | "failed", log: ImageHistoryLog) => {
        const state = trackedTasksRef.current.get(parentTaskId);
        if (!state) return;
        if (status === "success") state.images.push(...workflowResultsFromStoredLog(log));
        else state.errors.push(log.errors?.[0] || "工作流运行失败");
        state.remaining -= 1;
        setWorkflowTasks((value) => value.map((task) => task.id === parentTaskId ? { ...task, images: [...state.images], failedCount: state.errors.length } : task));
        if (state.remaining > 0) return;
        trackedTasksRef.current.delete(parentTaskId);
        trackedTaskLogRef.current.forEach((parentId, logId) => {
            if (parentId !== parentTaskId) return;
            trackedTaskLogRef.current.delete(logId);
            recoveredTaskLogIdsRef.current.delete(logId);
            recoveredTaskMissesRef.current.delete(logId);
        });
        const endedAt = nowMs();
        const durationMs = Math.max(0, endedAt - state.startedAt);
        if (state.images.length) {
            if (state.seriesDraftId) updateSeriesDraft(state.seriesDraftId, { status: "success", resultIds: state.images.map((image) => image.id) });
            setWorkflowTasks((value) => value.map((task) => task.id === parentTaskId ? { ...task, status: "success", endedAt, durationMs, images: state.images, failedCount: state.errors.length, error: state.errors.length ? `${state.errors.length} 张失败：${state.errors.join("；")}` : undefined } : task));
            setRunResults((value) => [...state.images, ...value]);
            onWorkflowTaskSuccess?.({ taskId: parentTaskId, images: state.images, durationMs, endedAt });
            message.success(state.errors.length ? `工作流任务完成 ${state.images.length} 张，${state.errors.length} 张失败` : "工作流任务已完成，结果已写入生图历史");
        } else {
            const errorText = state.errors.length ? state.errors.join("；") : "工作流运行失败";
            if (state.seriesDraftId) updateSeriesDraft(state.seriesDraftId, { status: "failed", error: errorText });
            setWorkflowTasks((value) => value.map((task) => task.id === parentTaskId ? { ...task, status: "failed", endedAt, durationMs, error: errorText, failedCount: state.errors.length } : task));
            onWorkflowTaskFailure?.({ taskId: parentTaskId, error: errorText, durationMs, endedAt });
            message.error(errorText);
        }
        onGenerationLogSaved?.();
    };

    const pollRecoveredWorkflowTasks = async () => {
        const logIds = Array.from(recoveredTaskLogIdsRef.current);
        if (!logIds.length) return;
        const logs = (await Promise.all(logIds.map((id) => imageLogStore.getItem<ImageHistoryLog>(id).catch(() => null)))).filter((log): log is ImageHistoryLog => Boolean(log?.task?.id));
        if (!logs.length) {
            recoveredTaskLogIdsRef.current.clear();
            return;
        }
        let tasks: CanvasImageTask[];
        try {
            tasks = await batchCanvasImageTaskStatus(effectiveConfig, Array.from(new Set(logs.map((log) => log.task!.id))));
            recoveredPollErrorRef.current = false;
        } catch (error) {
            if (!recoveredPollErrorRef.current) {
                recoveredPollErrorRef.current = true;
                message.error(errorMessage(error, "读取工作流任务状态失败"));
            }
            return;
        }
        const taskById = new Map(tasks.map((task) => [task.id, task]));
        let finishedCount = 0;
        let failedCount = 0;
        try {
            for (const log of logs) {
                const task = taskById.get(log.task!.id);
                if (!task) {
                    const misses = (recoveredTaskMissesRef.current.get(log.id) || 0) + 1;
                    recoveredTaskMissesRef.current.set(log.id, misses);
                    if (misses < 3) continue;
                    const errorText = "图片任务不存在或未创建成功";
                    const nextLog: ImageHistoryLog = { ...log, status: "失败", durationMs: Math.max(0, nowMs() - log.createdAt), failCount: 1, errors: [errorText], task: undefined, lastPolledAt: nowMs() };
                    await saveWorkflowTaskLog(nextLog);
                    const parentTaskId = trackedTaskLogRef.current.get(log.id);
                    if (parentTaskId) completeTrackedWorkflowTask(parentTaskId, "failed", nextLog);
                    else {
                        setWorkflowTasks((value) => value.map((item) => item.id === log.id ? { ...item, status: "failed", endedAt: nowMs(), error: errorText } : item));
                        recoveredTaskLogIdsRef.current.delete(log.id);
                        recoveredTaskMissesRef.current.delete(log.id);
                        failedCount += 1;
                    }
                    continue;
                }
                if (!isFinishedCanvasImageTask(task) && !isFailedCanvasImageTask(task)) continue;
                const parentTaskId = trackedTaskLogRef.current.get(log.id);
                const applied = await applyRecoveredCanvasTask(log, task, Boolean(parentTaskId));
                recoveredTaskLogIdsRef.current.delete(log.id);
                recoveredTaskMissesRef.current.delete(log.id);
                if (parentTaskId) completeTrackedWorkflowTask(parentTaskId, applied.status, applied.log);
                else if (applied.status === "failed") failedCount += 1;
                else finishedCount += 1;
            }
        } catch (error) {
            if (!recoveredPollErrorRef.current) {
                recoveredPollErrorRef.current = true;
                message.error(errorMessage(error, "回写工作流任务结果失败"));
            }
            return;
        }
        if (finishedCount) message.success(`工作流任务已完成 ${finishedCount} 个，结果已写入生图历史`);
        if (failedCount) message.warning(`${failedCount} 个工作流任务失败`);
        if (finishedCount || failedCount) onGenerationLogSaved?.();
    };

    useLayoutEffect(() => {
        pollRecoveredWorkflowTasksRef.current = pollRecoveredWorkflowTasks;
    });

    const trackWorkflowTaskLogs = (parentTaskId: string, logs: ImageHistoryLog[], startedAt: number, seriesDraftId?: string, initial?: { images: WorkflowRunResult[]; errors: string[] }) => {
        if (!logs.length) return;
        trackedTasksRef.current.set(parentTaskId, { remaining: logs.length, images: initial?.images ? [...initial.images] : [], errors: initial?.errors ? [...initial.errors] : [], startedAt, seriesDraftId, taskIds: logs.flatMap((log) => log.task?.id ? [log.task.id] : []) });
        logs.forEach((log) => {
            trackedTaskLogRef.current.set(log.id, parentTaskId);
            recoveredTaskLogIdsRef.current.add(log.id);
            recoveredTaskMissesRef.current.delete(log.id);
        });
        void pollRecoveredWorkflowTasks();
    };

    const untrackWorkflowTask = (parentTaskId: string) => {
        trackedTasksRef.current.delete(parentTaskId);
        trackedTaskLogRef.current.forEach((parentId, logId) => {
            if (parentId !== parentTaskId) return;
            trackedTaskLogRef.current.delete(logId);
            recoveredTaskLogIdsRef.current.delete(logId);
            recoveredTaskMissesRef.current.delete(logId);
        });
    };

    const stopWorkflowTask = async (task: WorkflowTask) => {
        if (stoppingTaskIds.includes(task.id)) return;
        setStoppingTaskIds((value) => [...value, task.id]);
        try {
            const submitted = trackedTasksRef.current.get(task.id);
            const logIds = new Set<string>();
            trackedTaskLogRef.current.forEach((parentId, logId) => {
                if (parentId === task.id) logIds.add(logId);
            });
            if (!logIds.size) logIds.add(task.id);
            const logs = (await Promise.all(Array.from(logIds).map((id) => imageLogStore.getItem<ImageHistoryLog>(id).catch(() => null)))).filter((log): log is ImageHistoryLog => Boolean(log?.task?.id));
            const pendingLogs = logs.filter((log) => log.status === "生成中");
            const serverIds = pendingLogs.length ? pendingLogs.map((log) => log.task!.id) : (submitted?.taskIds ?? []);
            if (!serverIds.length) {
                message.warning("没有找到可停止的后端任务，正在同步最新状态");
                await pollRecoveredWorkflowTasksRef.current();
                return;
            }
            const results = await Promise.all(serverIds.map((id) => stopCanvasTask("image", id, false, "workflow")));
            if (!results.every((item) => item.stopped)) {
                message.warning("停止失败：任务可能已经结束，正在同步最新状态");
                await pollRecoveredWorkflowTasksRef.current();
                return;
            }
            const endedAt = nowMs();
            const durationMs = Math.max(0, endedAt - task.startedAt);
            const seriesDraftId = submitted?.seriesDraftId;
            untrackWorkflowTask(task.id);
            await Promise.all(pendingLogs.map((log) => saveWorkflowTaskLog({ ...log, status: "失败", durationMs, failCount: 1, errors: ["任务已停止"], task: { ...log.task!, status: "cancelled" }, lastPolledAt: endedAt })));
            logs.forEach((log) => {
                recoveredTaskLogIdsRef.current.delete(log.id);
                recoveredTaskMissesRef.current.delete(log.id);
            });
            if (seriesDraftId) updateSeriesDraft(seriesDraftId, { status: "failed", error: "任务已停止" });
            setWorkflowTasks((value) => value.map((item) => item.id === task.id ? { ...item, status: "failed", endedAt, durationMs, error: "任务已停止" } : item));
            onGenerationLogSaved?.();
            message.success("工作流任务已停止");
        } catch (error) {
            message.error(errorMessage(error, "停止工作流任务失败"));
            await pollRecoveredWorkflowTasksRef.current().catch(() => undefined);
        } finally {
            setStoppingTaskIds((value) => value.filter((id) => id !== task.id));
        }
    };

    const recoverWorkflowTasks = async () => {
        if (!token) return;
        const localLogs = await readWorkflowGenerationLogs();
        const hasLocalPending = localLogs.some((log) => isWorkflowBackedLog(log) && log.status === "生成中" && log.task?.id);
        const logs = hasLocalPending ? localLogs : await mergeRemoteWorkflowLogs(token, localLogs);
        const pending = logs.filter((log) => isWorkflowBackedLog(log) && log.status === "生成中" && log.task?.id);
        if (!pending.length) return;
        const parentOf = (log: ImageHistoryLog) => workflowTaskParentId(log.task) || log.id;
        const allByParent = new Map<string, ImageHistoryLog[]>();
        logs.forEach((log) => {
            if (!isWorkflowBackedLog(log) || !log.task?.id) return;
            const parentTaskId = parentOf(log);
            const group = allByParent.get(parentTaskId);
            if (group) group.push(log);
            else allByParent.set(parentTaskId, [log]);
        });
        const pendingGroups = new Map<string, ImageHistoryLog[]>();
        pending.forEach((log) => {
            const parentTaskId = parentOf(log);
            const group = pendingGroups.get(parentTaskId);
            if (group) group.push(log);
            else pendingGroups.set(parentTaskId, [log]);
        });
        const sortGroup = (group: ImageHistoryLog[]) => group.sort((a, b) => workflowTaskParentIndex(a.task) - workflowTaskParentIndex(b.task));
        allByParent.forEach(sortGroup);
        pendingGroups.forEach(sortGroup);
        setWorkflowTasks((value) => {
            const existing = new Set(value.map((task) => task.id));
            const restored = Array.from(pendingGroups.entries()).filter(([parentTaskId]) => !existing.has(parentTaskId)).map(([parentTaskId, group]) => workflowTaskFromStoredLogs(parentTaskId, allByParent.get(parentTaskId) || group));
            return restored.length ? [...restored, ...value] : value;
        });
        pendingGroups.forEach((group, parentTaskId) => {
            const all = allByParent.get(parentTaskId) || group;
            const initialImages = all.filter((log) => log.status === "成功").flatMap((log) => workflowResultsFromStoredLog(log));
            const initialErrors = all.filter((log) => log.status === "失败").map((log) => log.errors?.[0] || "工作流运行失败");
            trackWorkflowTaskLogs(parentTaskId, group, Math.min(...all.map((log) => log.createdAt)), undefined, { images: initialImages, errors: initialErrors });
        });
    };

    return { pollRecoveredWorkflowTasks, recoverWorkflowTasks, trackWorkflowTaskLogs, untrackWorkflowTask, completeTrackedWorkflowTask, stopWorkflowTask };
}
