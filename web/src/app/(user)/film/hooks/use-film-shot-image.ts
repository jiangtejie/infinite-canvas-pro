"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import type { SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmProject, FilmShot } from "@/lib/film/types";
import { updateFilmShot } from "../utils/film-edits";
import { flattenFilmShots } from "../utils/parse-script";
import { runImageTask, stopFilmImageTask } from "../utils/film-image-task";
import { withImageVersion } from "../utils/film-versions";
import { normalizeFilmAspect } from "@/lib/film/film-aspects";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import { collectFilmShotReferences } from "../utils/film-references";
import { selectFilmBatchShots } from "../utils/film-batch";
import { formatFilmContinuityPrompt, previousFilmShot } from "../utils/film-continuity-sheet";
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

    const buildShotPrompt = async (current: FilmProject, shot: FilmShot, extraReferences: ReferenceImage[] = [], anchor?: ReferenceImage | null) => {
        const promptText = (shot.prompt || shot.description).trim();
        const { references, hints } = await collectFilmShotReferences(current, shot);
        const styleText = resolveFilmStyleText(current);
        const continuityText = shot.continuity ? formatFilmContinuityPrompt(shot.continuity) : "";
        const prompt = [
            continuityText,
            styleText ? `${promptText}\n\n视觉风格：${styleText}` : promptText,
            hints ? `参考角色与场景：${hints}` : "",
            extraReferences.length ? "参考图中的上一镜画面用于衔接本镜，保持人物位置、道具状态和环境光线一致。" : "",
            anchor ? "与参考图中的锚点帧保持相同的色调、光线、材质与画风，角色和场景设定不要改变。" : "",
        ].filter(Boolean).join("\n\n");
        const merged = [...references.slice(0, 4), ...extraReferences].slice(0, 5);
        return { prompt, references: anchor ? [...merged, anchor].slice(0, 6) : merged };
    };

    const previousReference = async (current: FilmProject, shot: FilmShot) => {
        const previous = previousFilmShot(current.episodes || [], shot.id);
        if (!previous?.imageUrl) return null;
        return imageReference(previous.imageUrl, previous.storageKey, `prev-${previous.id}`);
    };

    const imageReference = async (imageUrl: string, storageKey: string | undefined, id: string): Promise<ReferenceImage | null> => {
        try {
            const dataUrl = await imageToDataUrl({ url: imageUrl, storageKey });
            return dataUrl ? { id, name: `${id}.png`, type: "image/png", dataUrl, storageKey } : null;
        } catch {
            return null;
        }
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
            const previous = await previousReference(current, shot);
            const { prompt, references } = await buildShotPrompt(current, shot, previous ? [previous] : []);
            const { imageUrl, storageKey } = await runImageTask(config, prompt, references, shot.id, {
                onTask: (task) => onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { pendingTask: { kind: "image", id: task.id, startedAt: Date.now() } }) }),
            });
            const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { ...withImageVersion(latestShot, imageUrl, storageKey), pendingTask: undefined }),
            });
            message.success("分镜图已生成");
        } catch (error) {
            onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { errorMessage: errorMessage(error, "分镜图生成失败"), pendingTask: undefined }) });
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
        const anchorShot = options.anchorShotId ? targets.find((shot) => shot.id === options.anchorShotId) : pending[0];
        let anchorReference = anchorShot?.imageUrl
            ? await imageReference(anchorShot.imageUrl, anchorShot.storageKey, `anchor-${anchorShot.id}`)
            : null;
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
                    const isAnchor = shot.id === anchorShot?.id;
                    const latestProject = projectRef.current || current;
                    const previous = await previousReference(latestProject, shot);
                    const { prompt, references } = await buildShotPrompt(latestProject, shot, previous ? [previous] : [], isAnchor ? null : anchorReference);
                    const { imageUrl, storageKey } = await runImageTask(config, prompt, references, shot.id, {
                        signal: controller.signal,
                        onTask: (task) => {
                            batchTaskIdRef.current = task.id;
                            onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { pendingTask: { kind: "image", id: task.id, startedAt: Date.now() } }) });
                        },
                    });
                    const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
                    onUpdate({
                        episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { ...withImageVersion(latestShot, imageUrl, storageKey), pendingTask: undefined }),
                    });
                    if (isAnchor) anchorReference = await imageReference(imageUrl, storageKey, `anchor-${shot.id}`);
                    succeeded += 1;
                } catch (error) {
                    if (stopBatchRef.current) {
                        stopped = true;
                        onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { pendingTask: undefined }) });
                    } else {
                        failed += 1;
                        onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { errorMessage: errorMessage(error, "分镜图生成失败"), pendingTask: undefined }) });
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

