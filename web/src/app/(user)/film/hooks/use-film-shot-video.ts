"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import { imageToDataUrl } from "@/services/image-storage";
import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmFrameSource, FilmProject, FilmShot, FilmShotTask } from "@/lib/film/types";
import { updateFilmShot } from "../utils/film-edits";
import { flattenFilmShots } from "../utils/parse-script";
import { withVideoVersion } from "../utils/film-versions";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { collectFilmShotReferences } from "../utils/film-references";
import { compressFilmReference } from "../utils/film-image-compress";
import { composeFilmVideoPrompt, createDefaultSegments, validateSegments } from "../utils/film-video-segments";
import { formatFilmContinuityPrompt } from "../utils/film-continuity-sheet";
import { clampFilmVideoDuration, filmVideoAspect, filmVideoReferenceLimit } from "../utils/film-video-limits";
import { filmShotTypeLabel } from "../utils/film-shot-types";
import { FilmVideoStoppedError, startFilmVideoTask, stopFilmVideoTask } from "../utils/film-video-task";
import { useModelConfig } from "@/hooks/use-model-config";

export type FilmVideoBatchProgress = { done: number; total: number };

type ShotVideoHandlers = {
    signal?: AbortSignal;
    onTask?: (task: FilmShotTask) => void;
};

function friendlyVideoError(error: unknown) {
    const message = error instanceof Error ? error.message : "分镜视频生成失败";
    if (/unknown video model|video catalogue|not accepted/i.test(message)) {
        return `${message}。请在 AI 配置里使用该渠道「视频模型目录」中的完整模型 ID（通常是带厂商前缀的 ID），不要填简写或显示名。`;
    }
    return message;
}

async function frameToReference(frame: FilmFrameSource | undefined, name: string): Promise<ReferenceImage | null> {
    if (!frame || (!frame.url && !frame.storageKey)) return null;
    try {
        const dataUrl = await imageToDataUrl({ url: frame.url, storageKey: frame.storageKey });
        if (!dataUrl) return null;
        const compressed = await compressFilmReference(dataUrl);
        return { id: name, name: `${name}.jpg`, type: compressed.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png", dataUrl: compressed, storageKey: frame.storageKey };
    } catch {
        return null;
    }
}

export function useFilmShotVideo(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const resolveModelConfig = useModelConfig();
    const [generatingShotId, setGeneratingShotId] = useState("");
    const [progress, setProgress] = useState(0);
    const [batchProgress, setBatchProgress] = useState<FilmVideoBatchProgress | null>(null);
    const projectRef = useRef(project);
    projectRef.current = project;
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
        const shotConfig: AiConfig = { ...config, videoSeconds: String(clampFilmVideoDuration(shot.duration, config.model || config.videoModel || "")), ...(shot.negativePrompt ? { videoNegativePrompt: shot.negativePrompt } : {}) };
        const model = config.model || config.videoModel || "";
        const mode = shot.videoMode === "frames" ? "frames" : "reference";
        const segments = shot.videoSegments?.length ? shot.videoSegments : createDefaultSegments(shot.duration);
        const validation = validateSegments(segments, shot.duration);
        if (validation) throw new Error(validation);
        if (!(shot.prompt || shot.description).trim() && !segments.some((segment) => segment.prompt.trim())) {
            throw new Error("先填写画面描述或分段提示词");
        }

        let input: { references?: ReferenceImage[]; firstFrame?: ReferenceImage | null; lastFrame?: ReferenceImage | null } = {};
        let hints = "";
        if (mode === "frames") {
            const firstFrame = await frameToReference(shot.firstFrame, `${shot.id}-first`);
            if (!firstFrame) throw new Error("首尾帧模式需要先选择首帧");
            const lastFrame = await frameToReference(shot.lastFrame, `${shot.id}-last`);
            input = { firstFrame, lastFrame };
        } else {
            const collected = await collectFilmShotReferences(current, shot, { includeStoryboard: true });
            input = { references: collected.references.slice(0, filmVideoReferenceLimit(model)) };
            hints = collected.hints;
        }

        const continuityText = shot.continuity ? formatFilmContinuityPrompt(shot.continuity) : "";
        const composedPrompt = composeFilmVideoPrompt({
            segments,
            shotTypeLabel: filmShotTypeLabel(shot.shotType),
            cameraMovement: shot.cameraMovement || "",
            description: shot.description || "",
            videoPrompt: shot.videoPrompt || "",
            styleText: resolveFilmStyleText(current),
            performance: shot.performance,
            soundDesign: shot.soundDesign,
            mode,
            hasFirstFrame: mode === "frames" && Boolean(shot.firstFrame),
            hints,
        });
        const prompt = continuityText ? `${continuityText}\n\n${composedPrompt}` : composedPrompt;

        setProgress(0);
        const result = await startFilmVideoTask(shotConfig, prompt, input, {
            signal: handlers.signal,
            onProgress: (value) => setProgress(Math.max(0, Math.min(100, Math.round(value)))),
            onTask: (task) => handlers.onTask?.(task),
        });
        return result;
    };

    const clearPendingTask = (shotId: string) => {
        onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shotId, { pendingTask: undefined }) });
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
            const { videoUrl, storageKey } = await runShotVideo(current, config, shot, {
                signal: controller.signal,
                onTask: (task) => {
                    currentTaskRef.current = task;
                    onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { pendingTask: task }) });
                },
            });
            const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { ...withVideoVersion(latestShot, videoUrl, storageKey), pendingTask: undefined }),
            });
            message.success("分镜视频已生成");
        } catch (error) {
            if (error instanceof FilmVideoStoppedError || stopRequestedRef.current) {
                clearPendingTask(shot.id);
                message.info("已停止生成，未完成的任务已取消");
            } else {
                const reason = friendlyVideoError(error);
                if (typeof window !== "undefined") console.warn("[film-video] 生成失败", { shotId: shot.id, model: config.model, videoModel: config.videoModel, reason });
                onUpdate({
                    episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { errorMessage: reason, pendingTask: undefined }),
                });
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
                    const { videoUrl, storageKey } = await runShotVideo(projectRef.current || current, config, shot, {
                        signal: controller.signal,
                        onTask: (task) => {
                            currentTaskRef.current = task;
                            onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { pendingTask: task }) });
                        },
                    });
                    const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
                    onUpdate({
                        episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { ...withVideoVersion(latestShot, videoUrl, storageKey), pendingTask: undefined }),
                    });
                    succeeded += 1;
                } catch (error) {
                    if (error instanceof FilmVideoStoppedError || stopRequestedRef.current) {
                        stopped = true;
                        clearPendingTask(shot.id);
                    } else {
                        failed += 1;
                        const reason = friendlyVideoError(error);
                        if (typeof window !== "undefined") console.warn("[film-video] 批量生成失败", { shotId: shot.id, model: config.model, videoModel: config.videoModel, reason });
                        onUpdate({
                            episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { errorMessage: reason, pendingTask: undefined }),
                        });
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
