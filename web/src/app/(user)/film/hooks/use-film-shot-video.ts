"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "antd";

import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { VideoReferenceInput } from "@/services/api/video";
import type { FilmGenerationContext, FilmProject, FilmShot, FilmShotTask } from "@/lib/film/types";
import { latestFilmShotPatch } from "../utils/film-live-project";
import { withVideoVersion } from "../utils/film-versions";
import { buildFilmShotGenerationContext } from "../utils/film-shot-generation";
import { loadFilmShotGenerationReferences } from "../utils/film-references";
import { clampFilmVideoDuration, filmVideoAspect, filmVideoReferenceLimit } from "../utils/film-video-limits";
import { previousFilmShot } from "../utils/film-continuity-sheet";
import { FilmVideoStoppedError, startFilmVideoTask, stopFilmVideoTask } from "../utils/film-video-task";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";

export type FilmVideoBatchProgress = { done: number; total: number };

type ShotVideoHandlers = {
    signal?: AbortSignal;
    onTask?: (task: FilmShotTask, generationContext: FilmGenerationContext) => void;
};

function friendlyVideoError(error: unknown) {
    const message = errorMessage(error, "分镜视频生成失败");
    if (/unknown video model|video catalogue|not accepted/i.test(message)) {
        return `${message}。请在 AI 配置里使用该渠道「视频模型目录」中的完整模型 ID（通常是带厂商前缀的 ID），不要填简写或显示名。`;
    }
    return message;
}

export function useFilmShotVideo(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const resolveModelConfig = useModelConfig();
    const [generatingShotId, setGeneratingShotId] = useState("");
    const [progress, setProgress] = useState(0);
    const [batchProgress, setBatchProgress] = useState<FilmVideoBatchProgress | null>(null);
    const projectRef = useRef(project);
    useEffect(() => {
        projectRef.current = project;
    }, [project]);
    const stopRequestedRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const currentTaskRef = useRef<FilmShotTask | null>(null);
    const busy = Boolean(generatingShotId) || Boolean(batchProgress);

    const buildVideoConfig = (current: FilmProject) => {
        const config = resolveModelConfig("video");
        if (!config) return null;
        const model = config.model || "";
        if (typeof window !== "undefined") {
            console.info("[film-video] 解析视频模型", {
                channelMode: effectiveConfig.channelMode,
                configuredVideoModel: effectiveConfig.videoModel,
                configuredModel: effectiveConfig.model,
                resolvedModel: model,
                videoModels: (effectiveConfig.videoModels || []).slice(0, 10),
            });
        }
        return { ...config, size: filmVideoAspect(current.aspect, model) } as AiConfig;
    };

    const runShotVideo = async (current: FilmProject, config: AiConfig, shot: FilmShot, handlers: ShotVideoHandlers = {}) => {
        const model = config.model || config.videoModel || "";
        const mode = shot.videoMode === "frames" ? "frames" : "reference";
        const hasText = (shot.prompt || shot.description).trim() || (shot.videoSegments || []).some((segment) => segment.prompt.trim());
        if (!hasText) throw new Error("先填写画面描述或分段提示词");
        const shotConfig: AiConfig = { ...config, videoSeconds: String(clampFilmVideoDuration(shot.duration, model)), ...(shot.negativePrompt ? { videoNegativePrompt: shot.negativePrompt } : {}) };

        const context = buildFilmShotGenerationContext(current, shot, {
            medium: "video",
            maxReferences: filmVideoReferenceLimit(model),
            videoMode: mode,
            includeStoryboard: mode === "reference",
            previousShot: mode === "reference" ? previousFilmShot(current.episodes || [], shot.id) : undefined,
        });
        const { images, missingReferenceIds } = await loadFilmShotGenerationReferences(context);
        const generationContext = { ...context, missingReferenceIds };

        let input: VideoReferenceInput;
        if (mode === "frames") {
            const firstFrame = images.find((image) => image.id === `${shot.id}-first`) ?? null;
            if (!firstFrame) throw new Error("首尾帧模式需要先选择首帧");
            const lastFrame = images.find((image) => image.id === `${shot.id}-last`) ?? null;
            input = { firstFrame, lastFrame };
        } else {
            input = { references: images };
        }

        setProgress(0);
        const result = await startFilmVideoTask(shotConfig, generationContext.prompt, input, {
            signal: handlers.signal,
            onProgress: (value) => setProgress(Math.max(0, Math.min(100, Math.round(value)))),
            onTask: (task) => handlers.onTask?.(task, generationContext),
        });
        return { ...result, generationContext };
    };

    const patchShot = (shotId: string, updater: (shot: FilmShot) => Partial<FilmShot>) => {
        const patch = latestFilmShotPatch(projectRef.current?.id, shotId, updater);
        if (patch) onUpdate(patch);
    };

    const clearPendingTask = (shotId: string) => {
        patchShot(shotId, () => ({ pendingTask: undefined }));
    };

    const generateVideo = async (shot: FilmShot) => {
        const current = projectRef.current;
        if (!current) return;
        if (busy) {
            message.warning("正在生成其他镜头，请稍候");
            return;
        }
        const config = buildVideoConfig(current);
        if (!config) {
            message.info("请先配置可用的视频模型");
            return;
        }
        if (typeof window !== "undefined") {
            console.info("[film-video] 开始生成分镜视频", {
                shotId: shot.id,
                shotNo: shot.shotNo,
                mode: shot.videoMode === "frames" ? "frames" : "reference",
                duration: shot.duration,
                model: config.model,
                videoModel: config.videoModel,
            });
        }
        stopRequestedRef.current = false;
        const controller = new AbortController();
        controllerRef.current = controller;
        setGeneratingShotId(shot.id);
        message.info("已提交视频生成，等待模型返回…");
        try {
            const { videoUrl, storageKey, generationContext } = await runShotVideo(current, config, shot, {
                signal: controller.signal,
                onTask: (task, context) => {
                    currentTaskRef.current = task;
                    patchShot(shot.id, () => ({ pendingTask: { ...task, generationContext: context } }));
                },
            });
            patchShot(shot.id, (latestShot) => ({ ...withVideoVersion(latestShot, videoUrl, storageKey, generationContext), pendingTask: undefined }));
            message.success("分镜视频已生成");
        } catch (error) {
            if (error instanceof FilmVideoStoppedError || stopRequestedRef.current) {
                clearPendingTask(shot.id);
                message.info("已停止生成，未完成的任务已取消");
            } else {
                const reason = friendlyVideoError(error);
                if (typeof window !== "undefined") console.warn("[film-video] 生成失败", { shotId: shot.id, model: config.model, videoModel: config.videoModel, reason });
                patchShot(shot.id, () => ({ errorMessage: reason, pendingTask: undefined }));
                message.error(reason);
            }
        } finally {
            controllerRef.current = null;
            currentTaskRef.current = null;
            setGeneratingShotId("");
            setProgress(0);
        }
    };

    const generateVideoBatch = async (targets: FilmShot[]) => {
        const current = projectRef.current;
        if (!current || !targets.length) return;
        if (busy) {
            message.warning("正在生成其他镜头，请稍候");
            return;
        }
        const config = buildVideoConfig(current);
        if (!config) {
            message.info("请先配置可用的视频模型");
            return;
        }
        stopRequestedRef.current = false;
        let failed = 0;
        let succeeded = 0;
        let done = 0;
        let stopped = false;
        setBatchProgress({ done: 0, total: targets.length });
        try {
            for (const shot of targets) {
                if (stopRequestedRef.current) {
                    stopped = true;
                    break;
                }
                setGeneratingShotId(shot.id);
                setProgress(0);
                const controller = new AbortController();
                controllerRef.current = controller;
                try {
                    const { videoUrl, storageKey, generationContext } = await runShotVideo(projectRef.current || current, config, shot, {
                        signal: controller.signal,
                        onTask: (task, context) => {
                            currentTaskRef.current = task;
                            patchShot(shot.id, () => ({ pendingTask: { ...task, generationContext: context } }));
                        },
                    });
                    patchShot(shot.id, (latestShot) => ({ ...withVideoVersion(latestShot, videoUrl, storageKey, generationContext), pendingTask: undefined }));
                    succeeded += 1;
                } catch (error) {
                    if (error instanceof FilmVideoStoppedError || stopRequestedRef.current) {
                        stopped = true;
                        clearPendingTask(shot.id);
                    } else {
                        failed += 1;
                        const reason = friendlyVideoError(error);
                        if (typeof window !== "undefined") console.warn("[film-video] 批量生成失败", { shotId: shot.id, model: config.model, videoModel: config.videoModel, reason });
                        patchShot(shot.id, () => ({ errorMessage: reason, pendingTask: undefined }));
                    }
                } finally {
                    controllerRef.current = null;
                    currentTaskRef.current = null;
                    done += 1;
                    setGeneratingShotId("");
                    setProgress(0);
                    setBatchProgress({ done, total: targets.length });
                }
                if (stopped) break;
            }
        } finally {
            setGeneratingShotId("");
            setProgress(0);
            setBatchProgress(null);
        }
        if (stopped) {
            message.info(`已停止批量视频：完成 ${succeeded}/${targets.length} 条`);
        } else {
            message.success(`批量视频完成：成功 ${succeeded} 个${failed ? `，失败 ${failed} 个` : ""}`);
        }
    };

    /** 停止当前单条或批量视频：中断等待，并尽力取消账号渠道上的远端任务。 */
    const stopVideo = () => {
        if (!generatingShotId && !batchProgress) {
            message.info("当前没有正在生成的分镜视频");
            return;
        }
        stopRequestedRef.current = true;
        controllerRef.current?.abort();
        const task = currentTaskRef.current;
        if (task) {
            const stopConfig = { ...effectiveConfig, model: effectiveConfig.videoModel || effectiveConfig.model } as AiConfig;
            void stopFilmVideoTask(stopConfig, task).then((cancelled) => {
                if (!cancelled) message.warning("取消服务端任务失败，模型侧任务可能仍在运行");
            });
        }
        message.info("正在停止生成…");
    };

    return { generatingShotId, videoProgress: progress, batchProgress, generateVideo, generateVideoBatch, stopVideo };
}