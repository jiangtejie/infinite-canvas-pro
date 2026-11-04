"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import { requestVideoGeneration } from "@/services/api/video";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmProject, FilmShot } from "../types";
import { updateFilmShot } from "../utils/film-edits";

export function useFilmShotVideo(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [generatingShotId, setGeneratingShotId] = useState("");
    const [progress, setProgress] = useState(0);
    const projectRef = useRef(project);
    projectRef.current = project;

    const generateVideo = async (shot: FilmShot) => {
        const current = projectRef.current;
        if (!current || generatingShotId) return;
        const promptText = (shot.prompt || shot.description).trim();
        if (!promptText) {
            message.warning("先填写画面描述或生成提示词");
            return;
        }
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.videoModel, "video");
        const config = { ...effectiveConfig, model };
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return;
        }
        const prompt = current.visualStyle ? `${promptText}\n\n视觉风格：${current.visualStyle}` : promptText;
        let firstFrame: ReferenceImage | null = null;
        if (shot.imageUrl || shot.storageKey) {
            try {
                const dataUrl = await imageToDataUrl({ url: shot.imageUrl, storageKey: shot.storageKey });
                if (dataUrl) firstFrame = { id: shot.id, name: `shot-${shot.shotNo}.png`, type: "image/png", dataUrl, storageKey: shot.storageKey };
            } catch {
                firstFrame = null;
            }
        }
        setGeneratingShotId(shot.id);
        setProgress(0);
        try {
            const result = await requestVideoGeneration(config, prompt, { firstFrame }, (value) => setProgress(Math.max(0, Math.min(100, Math.round(value)))));
            const videoUrl = result.url || result.task.video_url || result.task.url || "";
            if (!videoUrl) throw new Error("视频接口没有返回地址");
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, {
                    videoUrl,
                    videoStorageKey: result.task.storageKey || "",
                    status: "video_ready",
                    errorMessage: "",
                }),
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

    return { generatingShotId, videoProgress: progress, generateVideo };
}
