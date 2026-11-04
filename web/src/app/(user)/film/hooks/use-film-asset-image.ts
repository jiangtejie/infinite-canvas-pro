"use client";

import { useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import type { SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmAssetKind, FilmProject } from "../types";
import { updateFilmAsset } from "../utils/film-edits";
import { runImageTask } from "../utils/film-image-task";
import { normalizeFilmAspect } from "../utils/film-aspects";
import { resolveFilmStyleText } from "../utils/film-styles";
import type { FilmViewPreset } from "../utils/film-view-presets";

export function useFilmAssetImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [generatingAssetId, setGeneratingAssetId] = useState("");
    const projectRef = useRef(project);
    projectRef.current = project;

    const buildImageConfig = (current: FilmProject) => {
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.imageModel, "image");
        const config = { ...effectiveConfig, model, count: "1", size: normalizeFilmAspect(current.aspect) } as SeedableImageConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        return config;
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
        setGeneratingAssetId(asset.id);
        try {
            const { imageUrl, storageKey } = await runImageTask(config, prompt, [], asset.id);
            onUpdate(kind === "character"
                ? { characters: updateFilmAsset(projectRef.current?.characters || [], asset.id, { imageUrl, storageKey, status: "ready", errorMessage: "" }) }
                : { locations: updateFilmAsset(projectRef.current?.locations || [], asset.id, { imageUrl, storageKey, status: "ready", errorMessage: "" }) });
            message.success(kind === "character" ? "角色设定图已生成" : "场景概念图已生成");
        } catch (error) {
            onUpdate(kind === "character"
                ? { characters: updateFilmAsset(projectRef.current?.characters || [], asset.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "生成失败" }) }
                : { locations: updateFilmAsset(projectRef.current?.locations || [], asset.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "生成失败" }) });
            message.error(error instanceof Error ? error.message : "设定图生成失败");
        } finally {
            setGeneratingAssetId("");
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
        setGeneratingAssetId(asset.id);
        try {
            const { imageUrl, storageKey } = await runImageTask(config, prompt, references, asset.id);
            const list = kind === "character" ? (projectRef.current?.characters || []) : (projectRef.current?.locations || []);
            const latest = list.find((item) => item.id === asset.id);
            const views = [...(latest?.views || []), { id: nanoid(), label: preset.label, imageUrl, storageKey }];
            onUpdate(kind === "character"
                ? { characters: updateFilmAsset(projectRef.current?.characters || [], asset.id, { views }) }
                : { locations: updateFilmAsset(projectRef.current?.locations || [], asset.id, { views }) });
            message.success(`${kind === "character" ? "角色" : "场景"}${preset.label}已生成`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : `${preset.label}生成失败`);
        } finally {
            setGeneratingAssetId("");
        }
    };

    return { generatingAssetId, generateAsset, generateView };
}
