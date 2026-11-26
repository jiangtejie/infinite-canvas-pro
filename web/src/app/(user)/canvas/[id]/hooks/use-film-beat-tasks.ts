"use client";

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { nanoid } from "nanoid";

import { stopCanvasTask } from "@/services/api/canvas-tasks";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import type { AiConfig } from "@/stores/use-config-store";
import { errorMessage as toErrorMessage } from "@/lib/utils";
import { FILM_IMAGE_REFERENCE_LIMIT } from "@/app/(user)/film/utils/film-shot-generation";
import { loadFilmShotGenerationReferences } from "@/app/(user)/film/utils/film-references";

import type { CanvasConnection, CanvasNodeData } from "../../types";
import { CanvasNodeType } from "../../types";
import { buildFilmBeatPreviewPrompt, filmBeatFramesComplete, filmBeatHasContent, filmBeatIsBusy, selectFilmBeatContexts, selectFilmBeatPreviewShotId, updateFilmBeatFrames, updateFilmBeatPreview, updateFilmBeatTask } from "../lib/film-beat";
import { requestFilmBeatFrames, runFilmBeatPreviewTask } from "../lib/film-beat-ai";
import { buildFilmShotGenerationFromGraph } from "../lib/film-shot-generation-context";

type Message = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
    info: (content: string) => void;
};

type Options = {
    projectId: string;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    resolveModelConfig: (kind: "text" | "image") => AiConfig | null;
    setStudioView: (view: "board") => void;
    setShotFocusOpen: Dispatch<SetStateAction<boolean>>;
    selectFilmShot: (shotId: string) => void;
    focusNode: (nodeId: string) => void;
    fitNodesToView: (nodes: CanvasNodeData[]) => void;
    stylePresetId?: string;
    directorStyleId?: string;
    message: Message;
};

export function useFilmBeatTasks({ projectId, nodesRef, connectionsRef, setNodes, resolveModelConfig, setStudioView, setShotFocusOpen, selectFilmShot, focusNode, fitNodesToView, stylePresetId, directorStyleId, message }: Options) {
    const filmCostumes = useFilmCastStore((state) => state.costumes);
    const filmBeatPreviewControllersRef = useRef(new Map<string, AbortController>());
    const filmBeatPreviewTaskIdsRef = useRef(new Map<string, string>());
    const filmBeatDecomposeControllersRef = useRef(new Map<string, AbortController>());

    const updateFilmBeat = useCallback((nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? updater(node) : node)));
    }, [setNodes]);

    const decomposeFilmBeat = useCallback(async (beatId: string) => {
        const node = nodesRef.current.find((item) => item.id === beatId && item.type === CanvasNodeType.FilmBeat);
        const beat = node?.metadata?.filmBeat;
        if (!node || !beat) return;
        if (filmBeatIsBusy(node)) return;
        if (!filmBeatHasContent(beat)) {
            message.warning("先填写动作说明或至少一格节拍");
            return;
        }
        const config = resolveModelConfig("text");
        if (!config) return;
        const previous = { status: beat.status === "loading" ? "error" as const : beat.status, progress: beat.progress, errorMessage: beat.errorMessage };
        const controller = new AbortController();
        filmBeatDecomposeControllersRef.current.set(beatId, controller);
        setNodes((prev) => prev.map((item) => (item.id === beatId ? updateFilmBeatTask(item, { status: "loading", progress: 0, errorMessage: undefined }) : item)));
        try {
            const context = selectFilmBeatContexts(nodesRef.current, connectionsRef.current, beatId);
            const frames = await requestFilmBeatFrames(config, beat, context, controller.signal);
            if (controller.signal.aborted || !nodesRef.current.some((item) => item.id === beatId)) return;
            setNodes((prev) => prev.map((item) => (item.id === beatId ? updateFilmBeatTask(updateFilmBeatFrames(item, frames), { status: "success", progress: 100, errorMessage: undefined }) : item)));
            message.success("已拆解九格动作节拍");
        } catch (error) {
            if (controller.signal.aborted || !nodesRef.current.some((item) => item.id === beatId)) return;
            setNodes((prev) => prev.map((item) => (item.id === beatId ? updateFilmBeatTask(item, previous) : item)));
            message.error(toErrorMessage(error, "动作拆解失败"));
        } finally {
            if (filmBeatDecomposeControllersRef.current.get(beatId) === controller) filmBeatDecomposeControllersRef.current.delete(beatId);
        }
    }, [connectionsRef, message, nodesRef, resolveModelConfig, setNodes]);

    const generateFilmBeatPreview = useCallback(async (beatId: string) => {
        const node = nodesRef.current.find((item) => item.id === beatId && item.type === CanvasNodeType.FilmBeat);
        const beat = node?.metadata?.filmBeat;
        if (!node || !beat) return;
        if (filmBeatIsBusy(node)) return;
        if (!filmBeatFramesComplete(beat)) {
            message.warning("先补满 9 格动作节拍，再生成九宫格预览");
            return;
        }
        const config = resolveModelConfig("image");
        if (!config) return;
        const controller = new AbortController();
        filmBeatPreviewControllersRef.current.set(beatId, controller);
        setNodes((prev) => prev.map((item) => (item.id === beatId ? updateFilmBeatTask(item, { status: "loading", progress: 0, errorMessage: undefined }) : item)));
        try {
            const shotId = selectFilmBeatPreviewShotId(nodesRef.current, connectionsRef.current, beatId);
            const shotContext = shotId ? buildFilmShotGenerationFromGraph(nodesRef.current, connectionsRef.current, shotId, {
                medium: "image",
                maxReferences: FILM_IMAGE_REFERENCE_LIMIT,
                costumes: filmCostumes,
                stylePresetId,
                directorStyleId,
            }) : null;
            const references = shotContext ? (await loadFilmShotGenerationReferences(shotContext)).images : [];
            if (filmBeatPreviewControllersRef.current.get(beatId) !== controller) return;
            const result = await runFilmBeatPreviewTask({
                config,
                projectId,
                nodeId: beatId,
                prompt: buildFilmBeatPreviewPrompt(beat),
                references,
                signal: controller.signal,
                onProgress: (progress) => {
                    if (filmBeatPreviewControllersRef.current.get(beatId) !== controller) return;
                    setNodes((prev) => prev.map((item) => (item.id === beatId ? updateFilmBeatTask(item, { status: "loading", progress }) : item)));
                },
                onTaskStarted: (task) => {
                    if (filmBeatPreviewControllersRef.current.get(beatId) === controller) filmBeatPreviewTaskIdsRef.current.set(beatId, task.id);
                },
            });
            if (filmBeatPreviewControllersRef.current.get(beatId) !== controller) return;
            setNodes((prev) => prev.map((item) => (item.id === beatId ? updateFilmBeatPreview(item, {
                id: nanoid(),
                url: result.url,
                storageKey: result.storageKey,
                source: "generated",
                model: result.model,
                prompt: beat.prompt || beat.title,
                createdAt: new Date().toISOString(),
            }) : item)));
            message.success("九宫格预览已生成");
        } catch (error) {
            if (controller.signal.aborted) return;
            const errorMessage = toErrorMessage(error, "九宫格预览生成失败");
            setNodes((prev) => prev.map((item) => (item.id === beatId ? updateFilmBeatTask(item, { status: "error", progress: 0, errorMessage }) : item)));
            message.error(errorMessage);
        } finally {
            if (filmBeatPreviewControllersRef.current.get(beatId) === controller) {
                filmBeatPreviewControllersRef.current.delete(beatId);
                filmBeatPreviewTaskIdsRef.current.delete(beatId);
            }
        }
    }, [connectionsRef, directorStyleId, filmCostumes, message, nodesRef, projectId, resolveModelConfig, setNodes, stylePresetId]);

    const stopFilmBeatTask = useCallback((beatId: string) => {
        filmBeatDecomposeControllersRef.current.get(beatId)?.abort();
        filmBeatDecomposeControllersRef.current.delete(beatId);
        const controller = filmBeatPreviewControllersRef.current.get(beatId);
        filmBeatPreviewControllersRef.current.delete(beatId);
        controller?.abort();
        const taskId = filmBeatPreviewTaskIdsRef.current.get(beatId);
        filmBeatPreviewTaskIdsRef.current.delete(beatId);
        if (taskId) void stopCanvasTask("image", taskId, false).catch(() => undefined);
        setNodes((prev) => prev.map((item) => (item.id === beatId && item.metadata?.filmBeat ? updateFilmBeatTask(item, { status: "stopped", progress: 0, errorMessage: undefined }) : item)));
    }, [setNodes]);

    const locateFilmBeatShots = useCallback((beatId: string) => {
        const shots = selectFilmBeatContexts(nodesRef.current, connectionsRef.current, beatId).shots;
        if (!shots.length) {
            message.info("该动作节拍还没有引用镜头");
            return;
        }
        setStudioView("board");
        setShotFocusOpen(false);
        selectFilmShot(shots[0].shotId);
        const targetNodes = nodesRef.current.filter((node) => shots.some((shot) => shot.shotId === node.id));
        window.setTimeout(() => {
            if (targetNodes.length === 1) focusNode(targetNodes[0].id);
            else fitNodesToView(targetNodes);
        }, 80);
    }, [connectionsRef, fitNodesToView, focusNode, message, nodesRef, selectFilmShot, setShotFocusOpen, setStudioView]);

    useEffect(() => () => {
        filmBeatDecomposeControllersRef.current.forEach((controller) => controller.abort());
        filmBeatDecomposeControllersRef.current.clear();
        filmBeatPreviewControllersRef.current.forEach((controller) => controller.abort());
        filmBeatPreviewControllersRef.current.clear();
        filmBeatPreviewTaskIdsRef.current.clear();
    }, [projectId]);

    return { updateFilmBeat, decomposeFilmBeat, generateFilmBeatPreview, stopFilmBeatTask, locateFilmBeatShots };
}
