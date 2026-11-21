"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import type { CanvasImageTask, SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmAssetKind, FilmAssetTask, FilmImageRef, FilmLocationVariant, FilmProject } from "@/lib/film/types";
import { activeSlotImage, appendSlotImage } from "../utils/film-image-slot";
import { latestFilmAsset, latestFilmAssetPatch } from "../utils/film-live-project";
import { runImageTask, stopFilmImageTask } from "../utils/film-image-task";
import { normalizeFilmAspect } from "@/lib/film/film-aspects";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import type { FilmViewPreset } from "../utils/film-view-presets";
import { useModelConfig } from "@/hooks/use-model-config";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import { errorMessage } from "@/lib/utils";

type AssetTaskTarget = Pick<FilmAssetTask, "target" | "label" | "variantId">;

function conceptPrompt(kind: FilmAssetKind, asset: FilmAsset, style: string): string {
    const name = asset.name.trim() || `未命名${FILM_ASSET_KIND_LABELS[kind]}`;
    const basePrompt = asset.visualPrompt.trim() || [name, asset.description.trim()].filter(Boolean).join("，");
    const suffix = style ? `，视觉风格：${style}` : "";
    if (kind === "character") return `角色设定图：${basePrompt}${suffix}`;
    if (kind === "location") return `场景概念图：${basePrompt}${suffix}`;
    if (kind === "prop") return `道具设定图：${basePrompt}；多角度展示，白色背景${suffix}`;
    if (kind === "costume") return `服装设计图：${basePrompt}；平铺展示正反面与面料细节，白色背景${suffix}`;
    return `视觉风格板：${basePrompt}；色彩、光影、材质与质感参考拼板${suffix}`;
}

export function useFilmAssetImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const resolveModelConfig = useModelConfig();
    const [generatingAssetId, setGeneratingAssetId] = useState("");
    const projectRef = useRef(project);
    useEffect(() => {
        projectRef.current = project;
    }, [project]);
    const stopRequestedRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const taskRef = useRef<FilmAssetTask | null>(null);

    const buildImageConfig = (current: FilmProject) => {
        const config = resolveModelConfig("image");
        return config ? { ...config, count: "1", size: normalizeFilmAspect(current.aspect) } as SeedableImageConfig : null;
    };

    const patchAsset = (kind: FilmAssetKind, assetId: string, assetPatch: Partial<FilmAsset>) => {
        const patch = latestFilmAssetPatch(projectRef.current?.id, kind, assetId, () => assetPatch);
        if (patch) onUpdate(patch);
    };

    const latestAsset = (kind: FilmAssetKind, assetId: string) => latestFilmAsset(projectRef.current?.id, kind, assetId)?.asset;

    const cancelServerTask = (task: FilmAssetTask | null) => {
        if (!task) return;
        const model = effectiveConfig.imageModel || effectiveConfig.model;
        void stopFilmImageTask({ ...effectiveConfig, model } as AiConfig, task.id).then((cancelled) => {
            if (!cancelled) message.warning("取消服务端任务失败，模型侧任务可能仍在运行");
        });
    };

    const runTask = async (kind: FilmAssetKind, asset: FilmAsset, config: SeedableImageConfig, prompt: string, references: ReferenceImage[], target: AssetTaskTarget) => {
        stopRequestedRef.current = false;
        const controller = new AbortController();
        controllerRef.current = controller;
        setGeneratingAssetId(asset.id);
        try {
            const result = await runImageTask(config, prompt, references, asset.id, {
                signal: controller.signal,
                onTask: (task: CanvasImageTask) => {
                    const pending: FilmAssetTask = { kind: "image", id: task.id, startedAt: Date.now(), ...target };
                    taskRef.current = pending;
                    patchAsset(kind, asset.id, { pendingTask: pending, errorMessage: "" });
                },
            });
            return result;
        } finally {
            controllerRef.current = null;
            taskRef.current = null;
            setGeneratingAssetId("");
        }
    };

    const makeImageRef = (imageUrl: string, storageKey: string, prompt: string, config: SeedableImageConfig): FilmImageRef => ({
        id: nanoid(),
        url: imageUrl,
        storageKey,
        source: "generated",
        prompt,
        model: config.model,
        createdAt: new Date().toISOString(),
    });

    const generateAsset = async (kind: FilmAssetKind, asset: FilmAsset) => {
        const current = projectRef.current;
        if (!current || generatingAssetId) return;
        const source = latestAsset(kind, asset.id) || asset;
        if (source.concept.locked) {
            message.warning("概念图已锁定，先解锁再生成");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;
        const prompt = conceptPrompt(kind, source, resolveFilmStyleText(current));
        try {
            const { imageUrl, storageKey } = await runTask(kind, asset, config, prompt, [], { target: "concept" });
            const stoppedWhileFinishing = stopRequestedRef.current;
            const latest = latestAsset(kind, asset.id) || asset;
            patchAsset(kind, asset.id, {
                concept: appendSlotImage(latest.concept, makeImageRef(imageUrl, storageKey, prompt, config)),
                status: "ready",
                errorMessage: "",
                pendingTask: undefined,
            });
            if (stoppedWhileFinishing) message.info("停止时任务已生成完成，结果已保留");
            else message.success(`${FILM_ASSET_KIND_LABELS[kind]}概念图已生成`);
        } catch (error) {
            if (stopRequestedRef.current) {
                patchAsset(kind, asset.id, { pendingTask: undefined });
                message.info("已停止生成，未完成的任务已取消");
            } else {
                const reason = errorMessage(error, "生成失败");
                patchAsset(kind, asset.id, { status: "failed", errorMessage: reason, pendingTask: undefined });
                message.error(reason);
            }
        }
    };

    const conceptReferences = async (asset: FilmAsset): Promise<ReferenceImage[]> => {
        const active = activeSlotImage(asset.concept);
        if (!active?.url && !active?.storageKey) return [];
        try {
            const dataUrl = await imageToDataUrl({ url: active.url, storageKey: active.storageKey });
            return dataUrl ? [{ id: asset.id, name: `${asset.name || asset.id}.png`, type: "image/png", dataUrl, storageKey: active.storageKey }] : [];
        } catch {
            return [];
        }
    };

    const generateView = async (kind: FilmAssetKind, asset: FilmAsset, preset: FilmViewPreset) => {
        const current = projectRef.current;
        if (!current || generatingAssetId) return;
        const source = latestAsset(kind, asset.id) || asset;
        if (source.views?.locked) {
            message.warning("结构视图已锁定，先解锁再生成");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;
        const name = source.name.trim() || `未命名${FILM_ASSET_KIND_LABELS[kind]}`;
        const description = source.description.trim();
        const style = resolveFilmStyleText(current);
        const prompt = `${FILM_ASSET_KIND_LABELS[kind]}设定：${[name, description].filter(Boolean).join("，")}；${preset.prompt}${style ? `，视觉风格：${style}` : ""}`;
        const references = await conceptReferences(source);
        try {
            const { imageUrl, storageKey } = await runTask(kind, asset, config, prompt, references, { target: "view", label: preset.label });
            const stoppedWhileFinishing = stopRequestedRef.current;
            const latest = latestAsset(kind, asset.id) || asset;
            patchAsset(kind, asset.id, {
                views: appendSlotImage(latest.views || { images: [], locked: false }, { ...makeImageRef(imageUrl, storageKey, prompt, config), label: preset.label }),
                pendingTask: undefined,
                errorMessage: "",
            });
            if (stoppedWhileFinishing) message.info("停止时任务已生成完成，结果已保留");
            else message.success(`${name}${preset.label}已生成`);
        } catch (error) {
            if (stopRequestedRef.current) {
                patchAsset(kind, asset.id, { pendingTask: undefined });
                message.info("已停止生成，未完成的任务已取消");
            } else {
                const reason = errorMessage(error, `${preset.label}生成失败`);
                patchAsset(kind, asset.id, { errorMessage: reason, pendingTask: undefined });
                message.error(reason);
            }
        }
    };

    const generateVariant = async (asset: FilmAsset, variant: FilmLocationVariant) => {
        const current = projectRef.current;
        if (!current || generatingAssetId) return;
        const source = latestAsset("location", asset.id) || asset;
        const latestVariant = source.location?.variants.find((item) => item.id === variant.id) || variant;
        if (latestVariant.concept.locked) {
            message.warning("变体概念图已锁定，先解锁再生成");
            return;
        }
        const config = buildImageConfig(current);
        if (!config) return;
        const style = resolveFilmStyleText(current);
        const traits = [latestVariant.name, latestVariant.timeOfDay, latestVariant.weather, latestVariant.mood, latestVariant.description].filter(Boolean).join("，");
        const prompt = `场景气氛变体：${source.name} · ${traits}；保持场景结构与陈设不变，只改变时间、天气与氛围${style ? `，视觉风格：${style}` : ""}`;
        const references = await conceptReferences(source);
        try {
            const { imageUrl, storageKey } = await runTask("location", asset, config, prompt, references, { target: "variant", label: variant.name, variantId: variant.id });
            const stoppedWhileFinishing = stopRequestedRef.current;
            const latest = latestAsset("location", asset.id) || asset;
            const variants = latest.location?.variants || [];
            patchAsset("location", asset.id, {
                location: {
                    variants: variants.map((item) => item.id === variant.id
                        ? { ...item, concept: appendSlotImage(item.concept, makeImageRef(imageUrl, storageKey, prompt, config)) }
                        : item),
                },
                pendingTask: undefined,
                errorMessage: "",
            });
            if (stoppedWhileFinishing) message.info("停止时任务已生成完成，结果已保留");
            else message.success(`「${variant.name}」变体概念图已生成`);
        } catch (error) {
            if (stopRequestedRef.current) {
                patchAsset("location", asset.id, { pendingTask: undefined });
                message.info("已停止生成，未完成的任务已取消");
            } else {
                const reason = errorMessage(error, "变体生成失败");
                patchAsset("location", asset.id, { errorMessage: reason, pendingTask: undefined });
                message.error(reason);
            }
        }
    };

    /** 停止资产设定图生成：中断本地等待并尽力取消账号渠道上的远端任务。 */
    const stopAsset = () => {
        if (!generatingAssetId) {
            message.info("当前没有正在生成的设定图");
            return;
        }
        stopRequestedRef.current = true;
        controllerRef.current?.abort();
        cancelServerTask(taskRef.current);
        message.info("正在停止生成…");
    };

    return { generatingAssetId, generateAsset, generateView, generateVariant, stopAsset };
}
