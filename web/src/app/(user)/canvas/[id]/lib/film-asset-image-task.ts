import { nanoid } from "nanoid";

import type { FilmAsset, FilmAssetKind, FilmImageRef } from "@/lib/film/types";
import type { ReferenceImage } from "@/types/image";
import type { AiConfig } from "@/stores/use-config-store";
import { createCanvasImageTask, pollCanvasImageTaskStatus, type CanvasImageTask, type SeedableImageConfig } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { ensureCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { activeSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { compressFilmReference } from "@/app/(user)/film/utils/film-image-compress";
import { canvasImageTaskURLs, canvasTaskCompleted, canvasTaskFailed } from "./canvas-task-helpers";

const POLL_INTERVAL_MS = 1200;
const TIMEOUT_MS = 10 * 60 * 1000;

export type FilmAssetImageTaskResult = {
    url: string;
    storageKey?: string;
    model?: string;
};

const activeAssetTaskIds = new Set<string>();

export function isFilmAssetTaskActive(id: string) {
    return activeAssetTaskIds.has(id);
}

export function filmAssetReferenceImages(asset: FilmAsset, kind: FilmAssetKind, style?: FilmAsset): FilmImageRef[] {
    const candidates = kind === "character"
        ? [activeSlotImage(ensureCharacterProfile(asset).board)]
        : kind === "style"
            ? []
            : [activeSlotImage(style?.concept), activeSlotImage(asset.views), activeSlotImage(asset.concept)]
                .filter((image): image is FilmImageRef => Boolean(image));
    const seen = new Set<string>();
    return candidates.filter((image): image is FilmImageRef => {
        if (!image) return false;
        const key = image.storageKey || image.url;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 2);
}

export async function loadFilmAssetReferences(asset: FilmAsset, kind: FilmAssetKind, style?: FilmAsset): Promise<ReferenceImage[]> {
    const references: ReferenceImage[] = [];
    for (const image of filmAssetReferenceImages(asset, kind, style)) {
        try {
            const dataUrl = await imageToDataUrl({ url: image.url, storageKey: image.storageKey });
            if (!dataUrl) continue;
            const compressed = await compressFilmReference(dataUrl);
            references.push({
                id: image.id,
                name: `${image.label || asset.name || "asset"}.jpg`,
                type: compressed.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png",
                dataUrl: compressed,
                storageKey: image.storageKey,
            });
        } catch {
            // 参考图读取失败不阻断纯文字生成。
        }
    }
    return references;
}

export async function runFilmAssetImageTask(options: {
    config: AiConfig;
    projectId: string;
    nodeId: string;
    prompt: string;
    size: string;
    references: ReferenceImage[];
    signal: AbortSignal;
    onProgress?: (progress: number) => void;
    onTaskStarted?: (task: CanvasImageTask) => void;
}): Promise<FilmAssetImageTaskResult> {
    const imageConfig = { ...options.config, count: "1", size: options.size } as SeedableImageConfig;
    const task = await createCanvasImageTask(imageConfig, options.prompt, options.references, {
        signal: options.signal,
        nodeId: options.nodeId,
        sourceId: options.projectId,
        clientTaskId: `client_film_asset_image_${nanoid()}`,
    });
    activeAssetTaskIds.add(task.id);
    try {
        options.onTaskStarted?.(task);
        let current = task;
        const startedAt = Date.now();
        while (!canvasTaskCompleted(current.status) && !canvasTaskFailed(current.status)) {
            if (Date.now() - startedAt > TIMEOUT_MS) throw new Error("资产参考图生成超时，请稍后重试");
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            options.signal.throwIfAborted();
            current = await pollCanvasImageTaskStatus(current.id, options.signal);
            options.onProgress?.(current.progress ?? 0);
        }
        if (canvasTaskFailed(current.status)) throw new Error(current.error?.message || "资产参考图生成失败");
        const url = canvasImageTaskURLs(current)[0];
        if (!url) throw new Error("接口没有返回资产参考图");
        return {
            url,
            storageKey: current.storageKey,
            model: imageConfig.imageModel || imageConfig.model,
        };
    } finally {
        activeAssetTaskIds.delete(task.id);
    }
}
