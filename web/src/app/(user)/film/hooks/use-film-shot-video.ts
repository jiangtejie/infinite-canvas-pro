"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import { requestVideoGeneration } from "@/services/api/video";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmProject, FilmShot } from "../types";
import { updateFilmShot } from "../utils/film-edits";
import { flattenFilmShots } from "../utils/parse-script";
import { withVideoVersion } from "../utils/film-versions";
import { normalizeFilmAspect } from "../utils/film-aspects";
import { resolveFilmStyleText } from "../utils/film-styles";

export type FilmVideoBatchProgress = { done: number; total: number };

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
        const config: AiConfig = { ...effectiveConfig, model, size: normalizeFilmAspect(current.aspect) };
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        return config;
    };

    const runShotVideo = async (current: FilmProject, config: AiConfig, shot: FilmShot) => {
        const promptText = (shot.prompt || shot.description).trim();
        if (!promptText) throw new Error("先填写画面描述或生成提示词");
        const styleText = resolveFilmStyleText(current);
        const prompt = styleText ? `${promptText}\n\n视觉风格：${styleText}` : promptText;
        let firstFrame: ReferenceImage | null = null;
        if (shot.imageUrl || shot.storageKey) {
            try {
                const dataUrl = await imageToDataUrl({ url: shot.imageUrl, storageKey: shot.storageKey });
                if (dataUrl) firstFrame = { id: shot.id, name: `shot-${shot.shotNo}.png`, type: "image/png", dataUrl, storageKey: shot.storageKey };
            } catch {
                firstFrame = null;
            }
        }
        setProgress(0);
        const result = await requestVideoGeneration(config, prompt, { firstFrame }, (value) => setProgress(Math.max(0, Math.min(100, Math.round(value)))));
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
        if (!current || busy) return;
        const pending = targets.filter((shot) => (shot.prompt || shot.description).trim());
        if (!pending.length) {
            message.warning("选中的镜头还没有画面描述或提示词");
            return;
        }
        const config = buildVideoConfig(current);
        if (!config) return;
        let failed = 0;
        setBatchProgress({ done: 0, total: pending.length });
        try {
            for (const [index, shot] of pending.entries()) {
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
                    setBatchProgress({ done: index + 1, total: pending.length });
                }
            }
        } finally {
            setGeneratingShotId("");
            setProgress(0);
            setBatchProgress(null);
        }
        message.success(`批量视频完成：成功 ${pending.length - failed} 个${failed ? `，失败 ${failed} 个` : ""}`);
    };

    return { generatingShotId, videoProgress: progress, batchProgress, generateVideo, generateVideoBatch };
}
