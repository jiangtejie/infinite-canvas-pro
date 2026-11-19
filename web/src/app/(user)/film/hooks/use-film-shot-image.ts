"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import type { SeedableImageConfig } from "@/services/api/image";
import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { FilmProject, FilmShot } from "@/lib/film/types";

import { flattenFilmShots } from "../utils/parse-script";
import { runImageTask, stopFilmImageTask } from "../utils/film-image-task";
import { withImageVersion } from "../utils/film-versions";
import { normalizeFilmAspect } from "@/lib/film/film-aspects";
import { latestFilmShotPatch } from "../utils/film-live-project";
import { selectFilmBatchShots } from "../utils/film-batch";
import { previousFilmShot } from "../utils/film-continuity-sheet";
import { buildFilmShotGenerationContext, FILM_IMAGE_REFERENCE_LIMIT } from "../utils/film-shot-generation";
import { loadFilmShotGenerationReferences } from "../utils/film-references";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";

export type FilmImageBatchProgress = { done: number; total: number };

export type FilmImageBatchOptions = {
    /** 本场第一个镜头作为锚点，后续镜头引用它保持色调与画风。 */
    anchorShotId?: string;
    /** 已有分镜图的镜头跳过，适合补齐本场。 */
    skipExisting?: boolean;
};

export function useFilmShotImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const resolveModelConfig = useModelConfig();
    const [generatingShotId, setGeneratingShotId] = useState("");
    const [batchProgress, setBatchProgress] = useState<FilmImageBatchProgress | null>(null);
    const projectRef = useRef(project);
    projectRef.current = project;
    const stopBatchRef = useRef(false);
    const batchControllerRef = useRef<AbortController | null>(null);
    const batchTaskIdRef = useRef("");
    const busy = Boolean(generatingShotId) || Boolean(batchProgress);

    const buildImageConfig = (current: FilmProject) => {
        const config = resolveModelConfig("image");
        return config ? { ...config, count: "1", size: normalizeFilmAspect(current.aspect) } as SeedableImageConfig : null;
    };

    const patchShot = (shotId: string, updater: (shot: FilmShot) => Partial<FilmShot>) => {
        const patch = latestFilmShotPatch(projectRef.current?.id, shotId, updater);
        if (patch) onUpdate(patch);
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
            const context = buildFilmShotGenerationContext(current, shot, {
                medium: "image",
                maxReferences: FILM_IMAGE_REFERENCE_LIMIT,
                previousShot: previousFilmShot(current.episodes || [], shot.id),
            });
            const { images, missingReferenceIds } = await loadFilmShotGenerationReferences(context);
            const generationContext = { ...context, missingReferenceIds };
            const { imageUrl, storageKey } = await runImageTask(config, generationContext.prompt, images, shot.id, {
                onTask: (task) => patchShot(shot.id, () => ({ pendingTask: { kind: "image", id: task.id, startedAt: Date.now(), generationContext } })),
            });
            patchShot(shot.id, (latestShot) => ({ ...withImageVersion(latestShot, imageUrl, storageKey, generationContext), pendingTask: undefined }));
            message.success("分镜图已生成");
        } catch (error) {
            patchShot(shot.id, () => ({ errorMessage: errorMessage(error, "分镜图生成失败"), pendingTask: undefined }));
            message.error(errorMessage(error, "分镜图生成失败"));
        } finally {
            setGeneratingShotId("");
        }
    };

    const generateBatch = async (targets: FilmShot[], options: FilmImageBatchOptions = {}) => {
        const current = projectRef.current;
        if (!current || busy) return;
        const pending = selectFilmBatchShots(targets, options);
        if (!pending.length) {
            message.warning(options.skipExisting ? "本场镜头都已有分镜图，或还没有画面描述" : "选中的镜头还没有画面描述或提示词");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;
        const anchorShotId = options.anchorShotId || pending[0].id;
        stopBatchRef.current = false;
        let failed = 0;
        let succeeded = 0;
        let done = 0;
        let stopped = false;
        setBatchProgress({ done: 0, total: pending.length });
        try {
            for (const shot of pending) {
                if (stopBatchRef.current) {
                    stopped = true;
                    break;
                }
                setGeneratingShotId(shot.id);
                const controller = new AbortController();
                batchControllerRef.current = controller;
                batchTaskIdRef.current = "";
                try {
                    const latestProject = projectRef.current || current;
                    const flat = flattenFilmShots(latestProject.episodes || []);
                    const context = buildFilmShotGenerationContext(latestProject, shot, {
                        medium: "image",
                        maxReferences: FILM_IMAGE_REFERENCE_LIMIT,
                        previousShot: previousFilmShot(latestProject.episodes || [], shot.id),
                        anchorShot: shot.id === anchorShotId ? undefined : flat.find((item) => item.id === anchorShotId),
                    });
                    const { images, missingReferenceIds } = await loadFilmShotGenerationReferences(context);
                    const generationContext = { ...context, missingReferenceIds };
                    const { imageUrl, storageKey } = await runImageTask(config, generationContext.prompt, images, shot.id, {
                        signal: controller.signal,
                        onTask: (task) => {
                            batchTaskIdRef.current = task.id;
                            patchShot(shot.id, () => ({ pendingTask: { kind: "image", id: task.id, startedAt: Date.now(), generationContext } }));
                        },
                    });
                    patchShot(shot.id, (latestShot) => ({ ...withImageVersion(latestShot, imageUrl, storageKey, generationContext), pendingTask: undefined }));
                    succeeded += 1;
                } catch (error) {
                    if (stopBatchRef.current) {
                        stopped = true;
                        patchShot(shot.id, () => ({ pendingTask: undefined }));
                    } else {
                        failed += 1;
                        patchShot(shot.id, () => ({ errorMessage: errorMessage(error, "分镜图生成失败"), pendingTask: undefined }));
                    }
                } finally {
                    batchControllerRef.current = null;
                    batchTaskIdRef.current = "";
                    done += 1;
                    setGeneratingShotId("");
                    setBatchProgress({ done, total: pending.length });
                }
                if (stopped) break;
            }
        } finally {
            batchControllerRef.current = null;
            batchTaskIdRef.current = "";
            setGeneratingShotId("");
            setBatchProgress(null);
        }
        if (stopped) message.info(`已停止批量生成：完成 ${succeeded}/${pending.length} 个`);
        else message.success(`批量生成完成：成功 ${succeeded} 个${failed ? `，失败 ${failed} 个` : ""}`);
    };

    /** 立即停止批量出图：中断当前任务、终止后续队列，已完成的镜头保留结果。 */
    const stopBatch = () => {
        if (!batchProgress) {
            message.info("当前没有正在生成的批量任务");
            return;
        }
        stopBatchRef.current = true;
        batchControllerRef.current?.abort();
        const taskId = batchTaskIdRef.current;
        if (taskId) {
            const model = effectiveConfig.imageModel || effectiveConfig.model;
            void stopFilmImageTask({ ...effectiveConfig, model } as AiConfig, taskId).then((cancelled) => {
                if (!cancelled) message.warning("取消服务端任务失败，模型侧任务可能仍在运行");
            });
        }
        message.info("正在停止生成…");
    };

    return { generatingShotId, batchProgress, generate, generateBatch, stopBatch };
}