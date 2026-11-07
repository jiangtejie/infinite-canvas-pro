"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import { requestEdit, requestGeneration } from "@/services/api/image";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";

import type { GeneratedImage, GenerationResult, RequestSnapshot } from "../history";
import { errorDetail, errorMessage, updateResult } from "../history";

/**
 * 单张图片生成任务：调用图片 / 编辑接口、读取图片元信息，并把结果或错误回填到结果列表。
 * signal 用于本地直连任务的停止；后端持久化任务不传。
 */
export function useImageGeneration({ setResults }: { setResults: Dispatch<SetStateAction<GenerationResult[]>> }) {
    const runGenerationTask = useCallback(async (resultId: string, snapshot: RequestSnapshot, signal?: AbortSignal) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length
                ? await requestEdit(snapshot.requestConfig, snapshot.text, snapshot.references, signal)
                : await requestGeneration(snapshot.requestConfig, snapshot.text, signal);
            // 请求已完成但用户已点停止：视为已停止，不回调成功。
            signal?.throwIfAborted();
            const image = result[0];
            if (!image) throw new Error("接口没有返回图片");
            const meta = image.width && image.height && image.mimeType ? { width: image.width, height: image.height, mimeType: image.mimeType } : await readImageMeta(image.dataUrl);
            const nextImage: GeneratedImage = { ...image, durationMs: performance.now() - itemStartedAt, width: meta.width, height: meta.height, bytes: image.bytes || getDataUrlByteSize(image.dataUrl), mimeType: image.mimeType || meta.mimeType };
            setResults((value) => updateResult(value, resultId, { status: "success", image: nextImage, durationMs: nextImage.durationMs }));
            return nextImage;
        } catch (error) {
            // 停止导致的 abort 交给批量层落「已停止」，不要标失败。
            if (signal?.aborted) throw error;
            setResults((value) => updateResult(value, resultId, { status: "failed", error: errorMessage(error), errorDetail: errorDetail(error), durationMs: performance.now() - itemStartedAt }));
            throw error;
        }
    }, [setResults]);

    return { runGenerationTask };
}
