"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CanvasAudioTask } from "@/services/api/audio";
import type { CanvasImageTask } from "@/services/api/image";
import type { VideoResponse } from "@/services/api/video";

import type { CanvasNodeData } from "../../types";
import { canvasTaskFailed, canvasTaskMediaURL, canvasVideoTaskCompleted } from "../lib/canvas-task-helpers";
import type { CanvasNodeTaskRun } from "./use-canvas-tasks";

type UseCanvasTaskRunnerOptions = {
    nodeTaskRunsRef: MutableRefObject<Map<string, CanvasNodeTaskRun>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
};

/**
 * 任务提交与运行记录：负责创建 AbortController、登记 run、回写后端类型和失败占位任务。
 * 轮询与停止仍由画布页面编排。
 */
export function useCanvasTaskRunner({ nodeTaskRunsRef, setNodes }: UseCanvasTaskRunnerOptions) {
    const rememberNodeTask = useCallback(<T extends CanvasImageTask | CanvasAudioTask | VideoResponse,>(nodeId: string, id: string | undefined, task: T) => {
        const run = nodeTaskRunsRef.current.get(`${nodeId}:${id}`);
        if (!run || run.controller.signal.aborted || (run.task && canvasVideoTaskCompleted(run.task) && !canvasVideoTaskCompleted(task) && !canvasTaskFailed(task.status))) return task;
        const next = run.mediaSize && run.mediaSize.content === canvasTaskMediaURL(task) ? { ...task, mediaSize: run.mediaSize } : task;
        run.task = next;
        return next;
    }, [nodeTaskRunsRef]);

    const submitNodeTask = useCallback(<T extends CanvasImageTask | CanvasAudioTask | VideoResponse,>(nodeId: string, id: string, request: (signal: AbortSignal, onServerTask: (backend?: "account" | "workflow") => void) => Promise<T>, generation?: symbol) => {
        const controller = new AbortController();
        const run: CanvasNodeTaskRun = { id, controller, generation };
        nodeTaskRunsRef.current.set(nodeId, run);
        nodeTaskRunsRef.current.set(`${nodeId}:${id}`, run);
        const submission = request(controller.signal, (backend = "account") => {
            run.backend = backend;
            setNodes((prev) => prev.map((node) => node.id === nodeId && node.metadata?.clientTaskId === id ? { ...node, metadata: { ...node.metadata, taskBackend: backend } } : node));
        }).then((task) => rememberNodeTask(nodeId, id, task), (error) => {
            if (!nodeTaskRunsRef.current.get(`${nodeId}:${id}`)?.task) rememberNodeTask(nodeId, id, { id, source: run.backend === "workflow" ? "workflow" : undefined, status: "failed", error: { message: error instanceof Error ? error.message : "生成失败" } });
            throw error;
        });
        run.submission = submission;
        void submission.finally(() => { delete run.submission; }).catch(() => undefined);
        return submission;
    }, [nodeTaskRunsRef, rememberNodeTask, setNodes]);

    const isNodeTaskActive = useCallback((nodeId: string, id?: string) => {
        const run = nodeTaskRunsRef.current.get(nodeId);
        return !run || (run.id === id && !run.controller.signal.aborted);
    }, [nodeTaskRunsRef]);

    return { rememberNodeTask, submitNodeTask, isNodeTaskActive };
}
