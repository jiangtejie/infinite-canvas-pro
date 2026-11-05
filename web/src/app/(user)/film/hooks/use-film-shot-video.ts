"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import { requestVideoGeneration } from "@/services/api/video";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmFrameSource, FilmProject, FilmShot } from "../types";
import { updateFilmShot } from "../utils/film-edits";
import { flattenFilmShots } from "../utils/parse-script";
import { withVideoVersion } from "../utils/film-versions";

import { resolveFilmStyleText } from "../utils/film-styles";
import { collectFilmShotReferences } from "../utils/film-references";
import { compressFilmReference } from "../utils/film-image-compress";
import { composeFilmVideoPrompt, createDefaultSegments, validateSegments } from "../utils/film-video-segments";
import { formatFilmContinuityPrompt } from "../utils/film-continuity-sheet";
import { clampFilmVideoDuration, filmVideoAspect, filmVideoReferenceLimit } from "../utils/film-video-limits";
import { filmShotTypeLabel } from "../utils/film-shot-types";

export type FilmVideoBatchProgress = { done: number; total: number };

function friendlyVideoError(error: unknown) {
    const message = error instanceof Error ? error.message : "分镜视频生成失败";
    if (/unknown video model|video catalogue|not accepted/i.test(message)) {
        return `${message}。请在 AI 配置里使用该渠道「视频模型目录」中的完整模型 ID（通常是带厂商前缀的 ID），不要填简写或显示名。`;
    }
    return message;
}

async function frameToReference(frame: FilmFrameSource | undefined, name: string): Promise<ReferenceImage | null> {
    if (!frame?.url && !frame?.storageKey) return null;
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
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [generatingShotId, setGeneratingShotId] = useState("");
    const [progress, setProgress] = useState(0);
    const [batchProgress, setBatchProgress] = useState<FilmVideoBatchProgress | null>(null);
    const projectRef = useRef(project);
    projectRef.current = project;
    const busy = Boolean(generatingShotId) || Boolean(batchProgress);

    const buildVideoConfig = (current: FilmProject) => {
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.videoModel, "video");
        if (typeof window !== "undefined") {
            console.info("[film-video] 解析视频模型", {
                channelMode: effectiveConfig.channelMode,
                configuredVideoModel: effectiveConfig.videoModel,
                configuredModel: effectiveConfig.model,
                resolvedModel: model,
                videoModels: (effectiveConfig.videoModels || []).slice(0, 10),
                publicChannels: (effectiveConfig.publicChannels || []).map((channel) => ({
                    id: channel.id,
                    modelCount: channel.models?.length || 0,
                    hasResolvedModel: Boolean(model && channel.models?.includes(model)),
                })),
                localChannels: (effectiveConfig.localChannels || []).map((channel) => ({
                    id: channel.id,
                    protocol: channel.protocol,
                    modelCount: channel.models?.length || 0,
                    hasResolvedModel: Boolean(model && channel.models?.includes(model)),
                })),
            });
        }
        const config: AiConfig = { ...effectiveConfig, model, size: filmVideoAspect(current.aspect, model) };
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        return config;
    };

    const runShotVideo = async (current: FilmProject, config: AiConfig, shot: FilmShot) => {
        const shotConfig: AiConfig = { ...config, videoSeconds: String(clampFilmVideoDuration(shot.duration, config.model || config.videoModel || "")) };
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
            mode,
            hasFirstFrame: mode === "frames" && Boolean(shot.firstFrame),
            hints,
        });
        const prompt = continuityText ? `${continuityText}\n\n${composedPrompt}` : composedPrompt;

        setProgress(0);
        const result = await requestVideoGeneration(shotConfig, prompt, input, (value) => setProgress(Math.max(0, Math.min(100, Math.round(value)))));
        const videoUrl = result.url || result.task.video_url || result.task.url || "";
        if (!videoUrl) throw new Error("视频接口没有返回地址");
        return { videoUrl, storageKey: result.task.storageKey || "" };
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
                channelMode: config.channelMode,
                size: config.size,
                videoSeconds: config.videoSeconds,
            });
        }
        setGeneratingShotId(shot.id);
        message.info("已提交视频生成，等待模型返回…");
        try {
            const { videoUrl, storageKey } = await runShotVideo(current, config, shot);
            const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, withVideoVersion(latestShot, videoUrl, storageKey)),
            });
            message.success("分镜视频已生成");
        } catch (error) {
            const reason = friendlyVideoError(error);
            if (typeof window !== "undefined") console.warn("[film-video] 生成失败", { shotId: shot.id, model: config.model, videoModel: config.videoModel, channelMode: config.channelMode, reason });
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, {
                    errorMessage: reason,
                    status: shot.imageUrl ? "image_ready" : "failed",
                }),
            });
            message.error(reason);
        } finally {
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
        let failed = 0;
        setBatchProgress({ done: 0, total: targets.length });
        try {
            for (const [index, shot] of targets.entries()) {
                setGeneratingShotId(shot.id);
                try {
                    const { videoUrl, storageKey } = await runShotVideo(projectRef.current || current, config, shot);
                    const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
                    onUpdate({
                        episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, withVideoVersion(latestShot, videoUrl, storageKey)),
                    });
                } catch (error) {
                    failed += 1;
                    if (typeof window !== "undefined") console.warn("[film-video] 批量生成失败", { shotId: shot.id, model: config.model, videoModel: config.videoModel, channelMode: config.channelMode, reason: friendlyVideoError(error) });
                    onUpdate({
                        episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, {
                            errorMessage: friendlyVideoError(error),
                            status: shot.imageUrl ? "image_ready" : "failed",
                        }),
                    });
                } finally {
                    setBatchProgress({ done: index + 1, total: targets.length });
                }
            }
        } finally {
            setGeneratingShotId("");
            setProgress(0);
            setBatchProgress(null);
        }
        message.success(`批量视频完成：成功 ${targets.length - failed} 个${failed ? `，失败 ${failed} 个` : ""}`);
    };

    return { generatingShotId, videoProgress: progress, batchProgress, generateVideo, generateVideoBatch };
}
