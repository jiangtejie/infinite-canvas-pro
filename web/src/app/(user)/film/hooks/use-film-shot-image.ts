"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import type { SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { FilmProject, FilmShot } from "../types";
import { updateFilmShot } from "../utils/film-edits";
import { flattenFilmShots } from "../utils/parse-script";
import { runImageTask } from "../utils/film-image-task";
import { withImageVersion } from "../utils/film-versions";
import { normalizeFilmAspect } from "../utils/film-aspects";
import { resolveFilmStyleText } from "../utils/film-styles";
import { collectFilmShotReferences } from "../utils/film-references";
import { selectFilmBatchShots } from "../utils/film-batch";
import { formatFilmContinuityPrompt, previousFilmShot } from "../utils/film-continuity-sheet";
import { useFilmModelConfig } from "./use-film-model-config";

export type FilmImageBatchProgress = { done: number; total: number };

export type FilmImageBatchOptions = {
    /** 本场第一个镜头作为锚点，后续镜头引用它保持色调与画风。 */
    anchorShotId?: string;
    /** 已有分镜图的镜头跳过，适合补齐本场。 */
    skipExisting?: boolean;
};

export function useFilmShotImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const resolveModelConfig = useFilmModelConfig();
    const [generatingShotId, setGeneratingShotId] = useState("");
    const [batchProgress, setBatchProgress] = useState<FilmImageBatchProgress | null>(null);
    const projectRef = useRef(project);
    projectRef.current = project;
    const stopBatchRef = useRef(false);
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
        let done = 0;
        setBatchProgress({ done: 0, total: pending.length });
        try {
            for (const shot of pending) {
                if (stopBatchRef.current) break;
                setGeneratingShotId(shot.id);
                try {
                    const isAnchor = shot.id === anchorShot?.id;
                    const latestProject = projectRef.current || current;
                    const previous = await previousReference(latestProject, shot);
                    const { prompt, references } = await buildShotPrompt(latestProject, shot, previous ? [previous] : [], isAnchor ? null : anchorReference);
                    const { imageUrl, storageKey } = await runImageTask(config, prompt, references, shot.id);
                    const latestShot = flattenFilmShots(projectRef.current?.episodes || []).find((item) => item.id === shot.id) ?? shot;
                    onUpdate({
                        episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, withImageVersion(latestShot, imageUrl, storageKey)),
                    });
                    if (isAnchor) anchorReference = await imageReference(imageUrl, storageKey, `anchor-${shot.id}`);
                } catch (error) {
                    failed += 1;
                    onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "分镜图生成失败" }) });
                } finally {
                    done += 1;
                    setBatchProgress({ done, total: pending.length });
                }
            }
        } finally {
            setGeneratingShotId("");
            setBatchProgress(null);
        }
        const stopped = stopBatchRef.current;
        message.success(stopped ? `已停止批量生成：完成 ${done}/${pending.length} 个` : `批量生成完成：成功 ${pending.length - failed} 个${failed ? `，失败 ${failed} 个` : ""}`);
    };

    const stopBatch = () => {
        stopBatchRef.current = true;
    };

    return { generatingShotId, batchProgress, generate, generateBatch, stopBatch };
}

