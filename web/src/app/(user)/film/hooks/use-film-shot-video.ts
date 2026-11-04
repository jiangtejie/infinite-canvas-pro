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
import { composeFilmVideoPrompt, createDefaultSegments, validateSegments } from "../utils/film-video-segments";
import { clampFilmVideoDuration, filmVideoAspect, filmVideoReferenceLimit } from "../utils/film-video-limits";
import { filmShotTypeLabel } from "../utils/film-shot-types";

export type FilmVideoBatchProgress = { done: number; total: number };

async function frameToReference(frame: FilmFrameSource | undefined, name: string): Promise<ReferenceImage | null> {
    if (!frame?.url && !frame?.storageKey) return null;
    try {
        const dataUrl = await imageToDataUrl({ url: frame.url, storageKey: frame.storageKey });
        if (!dataUrl) return null;
        return { id: name, name: `${name}.png`, type: "image/png", dataUrl, storageKey: frame.storageKey };
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

        const prompt = composeFilmVideoPrompt({
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

        setProgress(0);
        const result = await requestVideoGeneration(shotConfig, prompt, input, (value) => setProgress(Math.max(0, Math.min(100, Math.round(value)))));
        const videoUrl = result.url || result.task.video_url || result.task.url || "";
        if (!videoUrl) throw new Error("视频接口没有返回地址");
        return { videoUrl, storageKey: result.task.storageKey || "" };
    };

    const generateVideo = async (shot: FilmShot) => {
        const current = projectRef.current;
        if (!current || busy) return;
        const config = buildVideoConfig(current);
        if (!config) return;
        setGeneratingShotId(shot.id);
        try {
            const { videoUrl, storageKey } = await runShotVideo(current, config, shot);
            const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, withVideoVersion(latestShot, videoUrl, storageKey)),
            });
            message.success("分镜视频已生成");
        } catch (error) {
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, {
                    errorMessage: error instanceof Error ? error.message : "分镜视频生成失败",
                    status: shot.imageUrl ? "image_ready" : "failed",
                }),
            });
            message.error(error instanceof Error ? error.message : "分镜视频生成失败");
        } finally {
            setGeneratingShotId("");
            setProgress(0);
        }
    };

    const generateVideoBatch = async (targets: FilmShot[]) => {
        const current = projectRef.current;
        if (!current || busy || !targets.length) return;
        const config = buildVideoConfig(current);
        if (!config) return;
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
                    onUpdate({
                        episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, {
                            errorMessage: error instanceof Error ? error.message : "分镜视频生成失败",
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
