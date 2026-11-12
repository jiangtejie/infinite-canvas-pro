"use client";

import { useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import type { CanvasImageTask, SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmAssetKind, FilmAssetTask, FilmProject } from "@/lib/film/types";
import { updateFilmAsset } from "../utils/film-edits";
import { runImageTask, stopFilmImageTask } from "../utils/film-image-task";
import { normalizeFilmAspect } from "@/lib/film/film-aspects";
import { resolveFilmStyleText } from "@/lib/film/film-styles";
import type { FilmViewPreset } from "../utils/film-view-presets";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";

type AssetTaskTarget = Pick<FilmAssetTask, "target" | "label">;

export function useFilmAssetImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const resolveModelConfig = useModelConfig();
    const [generatingAssetId, setGeneratingAssetId] = useState("");
    const projectRef = useRef(project);
    projectRef.current = project;
    const stopRequestedRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const taskRef = useRef<FilmAssetTask | null>(null);

    const buildImageConfig = (current: FilmProject) => {
        const config = resolveModelConfig("image");
        return config ? { ...config, count: "1", size: normalizeFilmAspect(current.aspect) } as SeedableImageConfig : null;
    };

    const patchAsset = (kind: FilmAssetKind, assetId: string, patch: Partial<FilmAsset>) => {
        onUpdate(kind === "character"
            ? { characters: updateFilmAsset(projectRef.current?.characters || [], assetId, patch) }
            : { locations: updateFilmAsset(projectRef.current?.locations || [], assetId, patch) });
    };

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

    const generateAsset = async (asset: FilmAsset, kind: FilmAssetKind) => {
        const current = projectRef.current;
        if (!current || generatingAssetId) return;
        const config = buildImageConfig(current);
        if (!config) return;
        const name = asset.name.trim() || (kind === "character" ? "未命名角色" : "未命名场景");
        const basePrompt = asset.visualPrompt.trim() || [name, asset.description.trim()].filter(Boolean).join("，");
        const styleText = resolveFilmStyleText(current);
        const style = styleText ? `，视觉风格：${styleText}` : "";
        const prompt = kind === "character" ? `角色设定图：${basePrompt}${style}` : `场景概念图：${basePrompt}${style}`;
        try {
            const { imageUrl, storageKey } = await runTask(kind, asset, config, prompt, [], { target: "image" });
            const stoppedWhileFinishing = stopRequestedRef.current;
            patchAsset(kind, asset.id, { imageUrl, storageKey, status: "ready", errorMessage: "", pendingTask: undefined });
            if (stoppedWhileFinishing) message.info("停止时任务已生成完成，结果已保留");
            else message.success(kind === "character" ? "角色设定图已生成" : "场景概念图已生成");
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

    const generateView = async (asset: FilmAsset, kind: FilmAssetKind, preset: FilmViewPreset) => {
        const current = projectRef.current;
        if (!current || generatingAssetId) return;
        const config = buildImageConfig(current);
        if (!config) return;
        const name = asset.name.trim() || (kind === "character" ? "未命名角色" : "未命名场景");
        const description = asset.description.trim();
        const styleText = resolveFilmStyleText(current);
        const style = styleText ? `，视觉风格：${styleText}` : "";
        const prompt = `${kind === "character" ? "角色设定" : "场景设定"}：${[name, description].filter(Boolean).join("，")}；${preset.prompt}${style}`;
        const references: ReferenceImage[] = [];
        if (asset.imageUrl || asset.storageKey) {
            try {
                const dataUrl = await imageToDataUrl({ url: asset.imageUrl, storageKey: asset.storageKey });
                if (dataUrl) references.push({ id: asset.id, name: `${name}.png`, type: "image/png", dataUrl, storageKey: asset.storageKey });
            } catch {
                // 参考图读取失败时退化为纯提示词生成
            }
        }
        try {
            const { imageUrl, storageKey } = await runTask(kind, asset, config, prompt, references, { target: "view", label: preset.label });
            const stoppedWhileFinishing = stopRequestedRef.current;
            const list = kind === "character" ? (projectRef.current?.characters || []) : (projectRef.current?.locations || []);
            const latest = list.find((item) => item.id === asset.id);
            const views = [...(latest?.views || []), { id: nanoid(), label: preset.label, imageUrl, storageKey }];
            patchAsset(kind, asset.id, { views, pendingTask: undefined, errorMessage: "" });
            if (stoppedWhileFinishing) message.info("停止时任务已生成完成，结果已保留");
            else message.success(`${kind === "character" ? "角色" : "场景"}${preset.label}已生成`);
        } catch (error) {
            if (stopRequestedRef.current) {
                patchAsset(kind, asset.id, { pendingTask: undefined });
                message.info("已停止生成，未完成的任务已取消");
            } else {
                const reason = error instanceof Error ? error.message : `${preset.label}生成失败`;
                patchAsset(kind, asset.id, { errorMessage: reason, pendingTask: undefined });
                message.error(reason);
            }
        }
    };

    /** 停止角色 / 场景设定图生成：中断本地等待并尽力取消账号渠道上的远端任务。 */
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

    return { generatingAssetId, generateAsset, generateView, stopAsset };
}
