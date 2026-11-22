"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FilmAsset, FilmAssetTask, FilmImageRef } from "@/lib/film/types";
import { errorMessage } from "@/lib/utils";
import { stopCanvasTask } from "@/services/api/canvas-tasks";
import { useModelConfig } from "@/hooks/use-model-config";
import { buildFilmReferenceBoardPrompt } from "@/app/(user)/film/utils/film-reference-board-templates";
import { loadFilmAssetReferences, runFilmAssetImageTask } from "../lib/film-asset-image-task";

type Options = {
    asset: FilmAsset;
    nodeId: string;
    projectId: string;
    onGenerated: (image: FilmImageRef, templateId: string) => void;
    onPendingTask?: (task: FilmAssetTask | null) => void;
};

export function useFilmReferenceBoardGeneration({ asset, nodeId, projectId, onGenerated, onPendingTask }: Options) {
    const resolveModelConfig = useModelConfig();
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const activeTaskIdRef = useRef<string | null>(null);

    useEffect(() => () => {
        abortRef.current?.abort();
    }, []);

    const generate = useCallback(async (templateId: string) => {
        if (generating) return false;
        const config = resolveModelConfig("image");
        if (!config) return false;
        const prompt = buildFilmReferenceBoardPrompt(asset, templateId);
        const controller = new AbortController();
        abortRef.current = controller;
        setGenerating(true);
        setProgress(0);
        setError(null);
        try {
            const references = await loadFilmAssetReferences(asset, "character");
            const result = await runFilmAssetImageTask({
                config,
                projectId,
                nodeId,
                prompt: prompt.prompt,
                size: prompt.size,
                references,
                signal: controller.signal,
                onProgress: setProgress,
                onTaskStarted: (task) => {
                    activeTaskIdRef.current = task.id;
                    onPendingTask?.({
                        kind: "image",
                        id: task.id,
                        startedAt: Date.now(),
                        target: "board",
                        label: prompt.template.name,
                        templateId: prompt.template.id,
                        templateVersion: prompt.template.version,
                        prompt: task.prompt || prompt.prompt,
                        model: task.model,
                    });
                },
            });
            const image: FilmImageRef = {
                id: crypto.randomUUID(),
                url: result.url,
                storageKey: result.storageKey,
                source: "generated",
                prompt: prompt.prompt,
                model: result.model,
                label: prompt.template.name,
                templateId: prompt.template.id,
                templateVersion: prompt.template.version,
                createdAt: new Date().toISOString(),
            };
            onGenerated(image, prompt.template.id);
            onPendingTask?.(null);
            return true;
        } catch (caught) {
            onPendingTask?.(null);
            setError(controller.signal.aborted ? "已停止参考板生成" : errorMessage(caught, "参考板生成失败"));
            return false;
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            activeTaskIdRef.current = null;
            setGenerating(false);
        }
    }, [asset, generating, nodeId, onGenerated, onPendingTask, projectId, resolveModelConfig]);

    const stop = useCallback(() => {
        const taskId = activeTaskIdRef.current;
        abortRef.current?.abort();
        if (taskId) void stopCanvasTask("image", taskId, false).catch(() => undefined);
    }, []);

    return { generating, progress, error, generate, stop };
}
