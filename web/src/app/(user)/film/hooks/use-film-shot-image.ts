"use client";

import { useRef, useState } from "react";
import { App } from "antd";

import { createCanvasImageTask, pollCanvasImageTaskStatus, type CanvasImageTask, type SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { FilmAsset, FilmProject, FilmShot } from "../types";
import { updateFilmShot } from "../utils/film-edits";

const POLL_INTERVAL = 2000;
const POLL_LIMIT = 150;

function isDone(status?: string) {
    return ["completed", "complete", "done", "succeeded", "success"].includes((status || "").toLowerCase());
}

function isFailed(status?: string) {
    return (status || "").toLowerCase() === "failed";
}

export function useFilmShotImage(project: FilmProject | undefined, onUpdate: (patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [generatingShotId, setGeneratingShotId] = useState("");
    const projectRef = useRef(project);
    projectRef.current = project;

    const generate = async (shot: FilmShot) => {
        const current = projectRef.current;
        if (!current || generatingShotId) return;
        const promptText = (shot.prompt || shot.description).trim();
        if (!promptText) {
            message.warning("先填写画面描述或生成提示词");
            return;
        }
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.imageModel, "image");
        const config = { ...effectiveConfig, model, count: "1" } as SeedableImageConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return;
        }
        const { references, hints } = await collectShotReferences(current, shot);
        const prompt = [
            current.visualStyle ? `${promptText}\n\n视觉风格：${current.visualStyle}` : promptText,
            hints ? `参考角色与场景：${hints}` : "",
        ].filter(Boolean).join("\n\n");
        setGeneratingShotId(shot.id);
        try {
            let task: CanvasImageTask = await createCanvasImageTask(config, prompt, references, { source: "canvas", nodeId: shot.id });
            for (let attempt = 0; !isDone(task.status) && !isFailed(task.status) && attempt < POLL_LIMIT; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
                task = await pollCanvasImageTaskStatus(task.id);
            }
            if (isFailed(task.status)) throw new Error(task.error?.message || task.error_detail || "分镜图生成失败");
            if (!isDone(task.status)) throw new Error("生成超时，可稍后在画布任务里查看结果");
            const imageUrl = task.image_url || task.image_urls?.[0] || task.url || "";
            if (!imageUrl) throw new Error("接口没有返回图片");
            onUpdate({
                episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, {
                    imageUrl,
                    storageKey: task.storageKey || "",
                    status: "image_ready",
                }),
            });
            message.success("分镜图已生成");
        } catch (error) {
            onUpdate({ episodes: updateFilmShot(projectRef.current?.episodes || [], shot.id, { status: "failed" }) });
            message.error(error instanceof Error ? error.message : "分镜图生成失败");
        } finally {
            setGeneratingShotId("");
        }
    };

    return { generatingShotId, generate };
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
