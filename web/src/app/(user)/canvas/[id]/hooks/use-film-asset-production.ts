"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { nanoid } from "nanoid";

import type { FilmAsset, FilmAssetTask, FilmImageRef } from "@/lib/film/types";
import { errorMessage } from "@/lib/utils";
import { stopCanvasTask } from "@/services/api/canvas-tasks";
import { useModelConfig } from "@/hooks/use-model-config";
import { ensureCharacterProfile } from "@/app/(user)/film/utils/film-character";
import { appendSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { buildFilmAssetConceptPrompt } from "@/app/(user)/film/utils/film-asset-concept";
import { buildFilmReferenceBoardPrompt } from "@/app/(user)/film/utils/film-reference-board-templates";
import type { CanvasConnection, CanvasFilmAssetQueue, CanvasNodeData } from "../../types";
import { loadFilmAssetReferences, runFilmAssetImageTask } from "../lib/film-asset-image-task";
import { filmContextAsset } from "../lib/film-node-patch";
import {
    EMPTY_FILM_ASSET_PRODUCTION,
    planFilmAssetProduction,
    type FilmAssetProductionItemState,
    type FilmAssetProductionState,
} from "../lib/film-asset-production";

type Message = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
};

type Options = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    projectId: string;
    updateAsset: (nodeId: string, updater: (asset: FilmAsset) => FilmAsset) => void;
    onQueueChange?: (queue: CanvasFilmAssetQueue | null) => void;
    message: Message;
};

export function useFilmAssetProduction({ nodesRef, connectionsRef, projectId, updateAsset, onQueueChange, message }: Options) {
    const resolveModelConfig = useModelConfig();
    const [state, setState] = useState<FilmAssetProductionState>(EMPTY_FILM_ASSET_PRODUCTION);
    const runningRef = useRef(false);
    const stopRequestedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    const activeTaskIdRef = useRef<string | null>(null);
    const runTokenRef = useRef(0);

    useEffect(() => () => {
        runTokenRef.current += 1;
        abortRef.current?.abort();
    }, []);

    const start = useCallback(async (nodeIds: string[], resume?: { id: string; startedAt: number }) => {
        if (runningRef.current) {
            message.warning("已有资产生产在进行中");
            return;
        }
        const config = resolveModelConfig("image");
        if (!config) {
            message.warning("请先配置可用的图片模型");
            return;
        }
        const plan = planFilmAssetProduction(nodesRef.current, connectionsRef.current);
        const selected = new Set(nodeIds);
        const targets = plan.items.filter((item) => selected.has(item.nodeId) && !item.pending && !item.blocked);
        if (!targets.length) {
            onQueueChange?.(null);
            message.warning("所选资产不可执行、已在生成中或不存在");
            return;
        }
        const queueId = resume?.id || nanoid();
        const queueStartedAt = resume?.startedAt || Date.now();
        onQueueChange?.({ id: queueId, startedAt: queueStartedAt, remainingNodeIds: targets.map((item) => item.nodeId) });

        runningRef.current = true;
        stopRequestedRef.current = false;
        runTokenRef.current += 1;
        const runToken = runTokenRef.current;
        const items: FilmAssetProductionItemState[] = targets.map((item) => ({ nodeId: item.nodeId, name: item.name, kind: item.kind, status: "pending" }));
        setState({ running: true, total: targets.length, completed: 0, failed: 0, currentIndex: 0, currentNodeId: "", currentName: "", progress: 0, items });
        let completed = 0;
        let failed = 0;
        let interrupted = false;
        try {
            for (const [index, item] of targets.entries()) {
                if (stopRequestedRef.current || runTokenRef.current !== runToken) {
                    interrupted = true;
                    break;
                }
                onQueueChange?.({ id: queueId, startedAt: queueStartedAt, remainingNodeIds: targets.slice(index).map((target) => target.nodeId) });
                setState((prev) => ({ ...prev, currentIndex: index + 1, currentNodeId: item.nodeId, currentName: item.name, progress: 0, items: markItem(prev.items, item.nodeId, "running") }));
                const controller = new AbortController();
                abortRef.current = controller;
                try {
                    const node = nodesRef.current.find((candidate) => candidate.id === item.nodeId);
                    const asset = node ? filmContextAsset(node) : undefined;
                    if (!node || !asset) throw new Error("上下文节点已不存在");
                    const styleNode = nodesRef.current.find((candidate) => candidate.metadata?.filmStyle);
                    const style = styleNode ? filmContextAsset(styleNode) : undefined;
                    const prompt = item.kind === "character"
                        ? buildFilmReferenceBoardPrompt(asset, item.templateId)
                        : buildFilmAssetConceptPrompt(item.kind, asset, style);
                    const references = await loadFilmAssetReferences(asset, item.kind, style);
                    controller.signal.throwIfAborted();
                    const result = await runFilmAssetImageTask({
                        config,
                        projectId,
                        nodeId: item.nodeId,
                        prompt: prompt.prompt,
                        size: prompt.size,
                        references,
                        signal: controller.signal,
                        onProgress: (progress) => setState((prev) => ({ ...prev, progress })),
                        onTaskStarted: (task) => {
                            activeTaskIdRef.current = task.id;
                            const pendingTask: FilmAssetTask = {
                                kind: "image",
                                id: task.id,
                                startedAt: Date.now(),
                                target: "template" in prompt ? "board" : "concept",
                                label: "template" in prompt ? prompt.template.name : prompt.label,
                                ...("template" in prompt ? { templateId: prompt.template.id, templateVersion: prompt.template.version } : {}),
                                prompt: task.prompt || prompt.prompt,
                                model: task.model,
                            };
                            updateAsset(item.nodeId, (current) => ({ ...current, pendingTask, status: "idle", errorMessage: undefined }));
                        },
                    });
                    const image: FilmImageRef = {
                        id: crypto.randomUUID(),
                        url: result.url,
                        storageKey: result.storageKey,
                        source: "generated",
                        prompt: prompt.prompt,
                        model: result.model,
                        createdAt: new Date().toISOString(),
                        ...("template" in prompt
                            ? { label: prompt.template.name, templateId: prompt.template.id, templateVersion: prompt.template.version }
                            : { label: prompt.label }),
                    };
                    if ("template" in prompt) {
                        updateAsset(item.nodeId, (current) => {
                            const profile = ensureCharacterProfile(current);
                            return { ...current, referenceTemplateId: prompt.template.id, character: { ...profile, board: appendSlotImage(profile.board, image) }, pendingTask: undefined, status: "ready", errorMessage: undefined };
                        });
                    } else {
                        updateAsset(item.nodeId, (current) => ({ ...current, concept: appendSlotImage(current.concept, image), pendingTask: undefined, status: "ready", errorMessage: undefined }));
                    }
                    completed += 1;
                    setState((prev) => ({ ...prev, completed, progress: 100, items: markItem(prev.items, item.nodeId, "success") }));
                } catch (caught) {
                    failed += 1;
                    const stopped = controller.signal.aborted;
                    const detail = stopped ? "已停止" : errorMessage(caught, "资产生成失败");
                    updateAsset(item.nodeId, (current) => ({ ...current, pendingTask: undefined, status: "failed", errorMessage: detail }));
                    setState((prev) => ({ ...prev, failed, items: markItem(prev.items, item.nodeId, "failed", detail) }));
                    if (stopped) {
                        interrupted = true;
                        break;
                    }
                } finally {
                    if (abortRef.current === controller) abortRef.current = null;
                    activeTaskIdRef.current = null;
                }
            }
        } finally {
            if (runTokenRef.current === runToken) {
                runningRef.current = false;
                stopRequestedRef.current = false;
                abortRef.current = null;
                onQueueChange?.(null);
                setState((prev) => ({ ...prev, running: false, currentIndex: 0, currentNodeId: "", currentName: "", progress: 0 }));
                if (interrupted) message.warning(`资产生产已停止，成功 ${completed} 项，失败 ${failed} 项`);
                else if (failed) message.warning(`资产生产完成，成功 ${completed} 项，失败 ${failed} 项`);
                else message.success(`已生成 ${completed} 项资产参考`);
            }
        }
    }, [connectionsRef, message, nodesRef, onQueueChange, projectId, resolveModelConfig, updateAsset]);

    const stop = useCallback(async () => {
        if (!runningRef.current) return;
        const taskId = activeTaskIdRef.current;
        stopRequestedRef.current = true;
        abortRef.current?.abort();
        if (taskId) void stopCanvasTask("image", taskId, false).catch(() => undefined);
    }, []);

    return { state, start, stop };
}

function markItem(items: FilmAssetProductionItemState[], nodeId: string, status: FilmAssetProductionItemState["status"], error?: string) {
    return items.map((item) => item.nodeId === nodeId ? { ...item, status, error } : item);
}
