"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { boolConfig } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import { createVideoGenerationTask } from "@/services/api/video";
import type { VideoResponse } from "@/services/api/video";
import { submitWorkflowTask, workflowMediaSource } from "@/services/api/workflow-generation";

import type { GenerationLog, GenerationResult } from "../history";
import { errorDetail, errorMessage, updateResultByLogId } from "../history";
import type { VideoGenerationSnapshot, VideoTaskRun } from "../task-types";

type UseVideoGenerationOptions = {
    videoTaskRunsRef: MutableRefObject<Map<string, VideoTaskRun>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    saveGenerationLog: (log: GenerationLog, active?: () => boolean) => Promise<void>;
    persistVideoLog: (log: GenerationLog) => Promise<void>;
};

/**
 * 提交单个视频任务：工作流渠道走 submitWorkflowTask，普通渠道走 createVideoGenerationTask。
 */
export function useVideoGeneration({ videoTaskRunsRef, setResults, saveGenerationLog, persistVideoLog }: UseVideoGenerationOptions) {
    const runVideoTask = useCallback(async (pendingLog: GenerationLog, snapshot: VideoGenerationSnapshot, workflowToken: string, active: () => boolean) => {
        const run = videoTaskRunsRef.current.get(pendingLog.id)!;
        const signal = run.controller.signal;
        const onServerTask = () => { run.backend = snapshot.workflowRef ? "workflow" : "account"; };
        try {
            signal.throwIfAborted();
            if (snapshot.workflowRef) {
                if (!workflowToken) throw new Error("工作流生成需要先登录");
                const referenceImages = [snapshot.firstFrame, ...snapshot.references, snapshot.lastFrame].filter((item): item is ReferenceImage => Boolean(item));
                const [workflowImages, workflowVideos, workflowAudios] = await Promise.all([
                    Promise.all(referenceImages.map((item) => workflowMediaSource(item.dataUrl))),
                    Promise.all(snapshot.videoReferences.map((item) => workflowMediaSource(item.url, snapshot.workflowRef!))),
                    Promise.all(snapshot.audioReferences.map((item) => workflowMediaSource(item.url))),
                ]);
                if (!active()) throw new Error("登录状态已变化");
                onServerTask();
                const submitted = await submitWorkflowTask(workflowToken, {
                    ref: snapshot.workflowRef,
                    expectedCapability: "video",
                    prompt: snapshot.text,
                    systemPrompt: snapshot.config.systemPrompts.video || snapshot.config.systemPrompt,
                    referenceImages: workflowImages,
                    referenceVideos: workflowVideos,
                    referenceAudios: workflowAudios,
                    size: snapshot.config.size,
                    videoSeconds: snapshot.config.videoSeconds,
                    videoQuality: snapshot.config.vquality,
                    videoGenerateAudio: boolConfig(snapshot.config.videoGenerateAudio, false),
                    videoWatermark: boolConfig(snapshot.config.videoWatermark, false),
                    source: "video-workbench",
                    sourceId: pendingLog.id,
                    clientTaskId: pendingLog.task?.id,
                });
                if (!active()) throw new Error("登录状态已变化");
                const task: VideoResponse = { id: submitted.id, task_id: submitted.id, status: submitted.status, progress: submitted.progress, model: snapshot.model, workflowRef: JSON.stringify(snapshot.workflowRef), size: snapshot.config.size, seconds: snapshot.config.videoSeconds };
                const nextLog = { ...pendingLog, taskBackend: run.backend, task, lastPolledAt: Date.now() };
                await saveGenerationLog(nextLog, active);
                if (!active()) throw new Error("登录状态已变化");
                await persistVideoLog(nextLog);
                if (!active()) throw new Error("登录状态已变化");
                setResults((value) => updateResultByLogId(value, pendingLog.id, { task, progress: task.progress, lastPolledAt: nextLog.lastPolledAt }));
                return nextLog;
            }
            const created = await createVideoGenerationTask(snapshot.config, snapshot.text, { references: snapshot.references, firstFrame: snapshot.firstFrame, lastFrame: snapshot.lastFrame, videoReferences: snapshot.videoReferences, audioReferences: snapshot.audioReferences }, (progress) => {
                if (active()) setResults((value) => active() ? updateResultByLogId(value, pendingLog.id, { progress }) : value);
            }, { signal, onServerTask, clientTaskId: pendingLog.task?.id, source: "video-workbench", sourceId: pendingLog.id });
            if (!active()) throw signal.reason || new Error("登录状态已变化");
            const nextLog = { ...pendingLog, taskBackend: run.backend, task: created.task, lastPolledAt: Date.now() };
            await saveGenerationLog(nextLog, active);
            if (!active()) throw signal.reason || new Error("登录状态已变化");
            setResults((value) => updateResultByLogId(value, pendingLog.id, { progress: created.task.progress, task: created.task, taskLogId: nextLog.id, lastPolledAt: nextLog.lastPolledAt }));
            return nextLog;
        } catch (error) {
            if (!active()) throw error;
            const durationMs = Date.now() - pendingLog.createdAt;
            const nextLog = { ...pendingLog, status: "失败" as const, durationMs, lastPolledAt: Date.now(), error: errorMessage(error), errorDetail: errorDetail(error) };
            await saveGenerationLog(nextLog, active);
            if (!active()) throw error;
            await persistVideoLog(nextLog);
            if (!active()) throw error;
            setResults((value) => updateResultByLogId(value, pendingLog.id, { status: "failed", taskLogId: nextLog.id, error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs }));
            return nextLog;
        }
    }, [persistVideoLog, saveGenerationLog, setResults, videoTaskRunsRef]);

    return { runVideoTask };
}
