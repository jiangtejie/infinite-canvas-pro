import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import { requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import { createCanvasImageTask, type CanvasImageTask, type SeedableImageConfig } from "@/services/api/image";
import type { ReferenceImage } from "@/types/image";
import type { FilmBeatNodeData } from "../../types";
import { canvasImageTaskURLs, canvasTaskFailed } from "./canvas-task-helpers";
import { buildFilmBeatDecompositionPrompt, filmBeatFrameCount, parseFilmBeatFrames, type FilmBeatContextSummary } from "./film-beat";
import { waitForCanvasImageTask } from "./film-image-task-wait";

/** 一次文本请求把动作拆成九格；失败由调用方恢复原状，不新增任务轮询。 */
export async function requestFilmBeatFrames(config: AiConfig, beat: FilmBeatNodeData, context?: FilmBeatContextSummary, signal?: AbortSignal): Promise<string[]> {
    const turn = await requestCanvasAgentTurn({
        config,
        systemPrompt: buildFilmBeatDecompositionPrompt(beat, context),
        messages: [{ role: "user", content: `请把「${beat.title || "动作节拍"}」拆成 3x3 九宫格连续动作，只输出 JSON 数组。` }],
        tools: [],
        toolMode: "prompt-json",
        signal,
    });
    const frames = parseFilmBeatFrames(turn.content, filmBeatFrameCount(beat.mode));
    if (!frames.some(Boolean)) throw new Error("AI 没有拆出有效的动作节拍");
    return frames;
}

/** 复用现有画布图片任务：提交九宫格提示词并轮询到完成，返回单张预览图。 */
export async function runFilmBeatPreviewTask(options: {
    config: AiConfig;
    projectId: string;
    nodeId: string;
    prompt: string;
    references?: ReferenceImage[];
    signal: AbortSignal;
    onProgress?: (progress: number) => void;
    onTaskStarted?: (task: CanvasImageTask) => void;
}): Promise<{ url: string; storageKey?: string; model?: string }> {
    const imageConfig = { ...options.config, count: "1", size: "1:1" } as SeedableImageConfig;
    const started = await createCanvasImageTask(imageConfig, options.prompt, options.references ?? [], {
        signal: options.signal,
        nodeId: options.nodeId,
        sourceId: options.projectId,
        clientTaskId: `client_film_beat_preview_${nanoid()}`,
    });
    options.onTaskStarted?.(started);
    const current = await waitForCanvasImageTask(started, {
        signal: options.signal,
        timeoutMessage: "九宫格预览生成超时，请稍后重试",
        onProgress: options.onProgress,
    });
    if (canvasTaskFailed(current.status)) throw new Error(current.error?.message || "九宫格预览生成失败");
    const url = canvasImageTaskURLs(current)[0];
    if (!url) throw new Error("接口没有返回九宫格预览");
    return { url, storageKey: current.storageKey, model: imageConfig.imageModel || imageConfig.model };
}
