"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import type { SeedableImageConfig } from "@/services/api/image";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { FilmProject, FilmShot } from "../types";
import { updateFilmShot } from "../utils/film-edits";
import { flattenFilmShots } from "../utils/parse-script";
import { runImageTask } from "../utils/film-image-task";
import { withImageVersion } from "../utils/film-versions";
import { normalizeFilmAspect } from "../utils/film-aspects";
import { resolveFilmStyleText } from "../utils/film-styles";
import { collectFilmShotReferences } from "../utils/film-references";

export type FilmImageBatchProgress = { done: number; total: number };

export function useFilmShotImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [generatingShotId, setGeneratingShotId] = useState("");
    const [batchProgress, setBatchProgress] = useState<FilmImageBatchProgress | null>(null);
    const projectRef = useRef(project);
    projectRef.current = project;
    const busy = Boolean(generatingShotId) || Boolean(batchProgress);

    const buildImageConfig = (current: FilmProject) => {
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.imageModel, "image");
        const config = { ...effectiveConfig, model, count: "1", size: normalizeFilmAspect(current.aspect) } as SeedableImageConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        return config;
    };

    const buildShotPrompt = async (current: FilmProject, shot: FilmShot) => {
        const promptText = (shot.prompt || shot.description).trim();
        const { references, hints } = await collectFilmShotReferences(current, shot);
        const styleText = resolveFilmStyleText(current);
        const prompt = [
            styleText ? `${promptText}\n\n视觉风格：${styleText}` : promptText,
            hints ? `参考角色与场景：${hints}` : "",
        ].filter(Boolean).join("\n\n");
        return { prompt, references };
    };

    const generate = async (shot: FilmShot) => {
        const current = projectRef.current;
        if (!current || busy) return;
        if (!(shot.prompt || shot.description).trim()) {
            message.warning("先填写画面描述或生成提示词");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;
        setGeneratingShotId(shot.id);
        try {
            const { prompt, references } = await buildShotPrompt(current, shot);
            const { imageUrl, storageKey } = await runImageTask(config, prompt, references, shot.id);
            const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, withImageVersion(latestShot, imageUrl, storageKey)),
            });
            message.success("分镜图已生成");
        } catch (error) {
            onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "分镜图生成失败" }) });
            message.error(error instanceof Error ? error.message : "分镜图生成失败");
        } finally {
            setGeneratingShotId("");
        }
    };

    const generateBatch = async (targets: FilmShot[]) => {
        const current = projectRef.current;
        if (!current || busy) return;
        const pending = targets.filter((shot) => (shot.prompt || shot.description).trim());
        if (!pending.length) {
            message.warning("选中的镜头还没有画面描述或提示词");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;
        let failed = 0;
        setBatchProgress({ done: 0, total: pending.length });
        try {
            for (const [index, shot] of pending.entries()) {
                setGeneratingShotId(shot.id);
                try {
                    const { prompt, references } = await buildShotPrompt(projectRef.current || current, shot);
                    const { imageUrl, storageKey } = await runImageTask(config, prompt, references, shot.id);
                    const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
                    onUpdate({
                        episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, withImageVersion(latestShot, imageUrl, storageKey)),
                    });
                } catch (error) {
                    failed += 1;
                    onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "分镜图生成失败" }) });
                } finally {
                    setBatchProgress({ done: index + 1, total: pending.length });
                }
            }
        } finally {
            setGeneratingShotId("");
            setBatchProgress(null);
        }
        message.success(`批量生成完成：成功 ${pending.length - failed} 个${failed ? `，失败 ${failed} 个` : ""}`);
    };

    return { generatingShotId, batchProgress, generate, generateBatch };
}

