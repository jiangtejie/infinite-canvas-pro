"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import { imageToDataUrl } from "@/services/image-storage";
import type { SeedableImageConfig } from "@/services/api/image";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmProject, FilmShot } from "../types";
import { updateFilmShot } from "../utils/film-edits";
import { flattenFilmShots } from "../utils/parse-script";
import { runImageTask } from "../utils/film-image-task";
import { withImageVersion } from "../utils/film-versions";
import { normalizeFilmAspect } from "../utils/film-aspects";

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
        const { references, hints } = await collectShotReferences(current, shot);
        const prompt = [
            current.visualStyle ? `${promptText}\n\n视觉风格：${current.visualStyle}` : promptText,
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

async function collectShotReferences(project: FilmProject, shot: FilmShot): Promise<{ references: ReferenceImage[]; hints: string }> {
    const characters = project.characters || [];
    const locations = project.locations || [];
    const assets = [
        ...(shot.characterIds || []).map((id) => characters.find((asset) => asset.id === id)),
        shot.locationId ? locations.find((asset) => asset.id === shot.locationId) : undefined,
    ].filter((asset): asset is FilmAsset => Boolean(asset && (asset.imageUrl || asset.storageKey)));
    const references: ReferenceImage[] = [];
    for (const asset of assets) {
        try {
            const dataUrl = await imageToDataUrl({ url: asset.imageUrl, storageKey: asset.storageKey });
            if (dataUrl) references.push({ id: asset.id, name: `${asset.name}.png`, type: "image/png", dataUrl, storageKey: asset.storageKey });
        } catch {
            // 参考图读取失败时继续用纯提示词生成
        }
    }
    const hints = assets.map((asset) => `${asset.name}${asset.description ? `（${asset.description}）` : ""}`).join("；");
    return { references, hints };
}
