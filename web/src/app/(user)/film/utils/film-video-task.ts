import {
    VIDEO_POLL_INTERVAL_MS,
    createVideoGenerationTask,
    deleteVideoGenerationTask,
    pollVideoGenerationTaskStatus,
    type VideoReferenceInput,
    type VideoResponse,
} from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmShotTask } from "@/lib/film/types";

const DONE_STATUS = ["completed", "complete", "done", "succeeded", "success"];
const FAILED_STATUS = ["failed", "fail", "error", "cancelled", "canceled"];

export class FilmVideoStoppedError extends Error {
    constructor() {
        super("已停止生成视频");
        this.name = "FilmVideoStoppedError";
    }
}

export type FilmVideoTaskHandlers = {
    onProgress?: (progress: number) => void;
    onTask?: (task: FilmShotTask, raw: VideoResponse) => void;
    signal?: AbortSignal;
};

/** 把接口返回的视频任务转成可持久化的任务标识，刷新后可据此恢复轮询。 */
export function filmVideoTaskRef(task: VideoResponse): FilmShotTask {
    return {
        kind: "video",
        id: task.id || task.task_id || task.video_id || "",
        taskId: task.task_id,
        videoId: task.video_id,
        startedAt: Date.now(),
    };
}

/** 提交视频任务并轮询到结束；支持中途 abort（「停止」）。 */
export async function startFilmVideoTask(
    config: AiConfig,
    prompt: string,
    input: VideoReferenceInput,
    handlers: FilmVideoTaskHandlers = {},
): Promise<{ videoUrl: string; storageKey: string }> {
    const created = await createVideoGenerationTask(config, prompt, input, (progress) => handlers.onProgress?.(progress), {
        signal: handlers.signal,
        source: "canvas",
    });
    handlers.onTask?.(filmVideoTaskRef(created.task), created.task);
    return pollFilmVideoTask(config, created.task, handlers);
}

/** 从已保存的任务标识恢复轮询，刷新 / 重进项目后继续拿结果。 */
export async function pollFilmVideoTask(
    config: AiConfig,
    taskOrRef: VideoResponse | FilmShotTask,
    handlers: FilmVideoTaskHandlers = {},
): Promise<{ videoUrl: string; storageKey: string }> {
    let task: VideoResponse = "kind" in taskOrRef
        ? ({ id: taskOrRef.id, task_id: taskOrRef.taskId, video_id: taskOrRef.videoId } as VideoResponse)
        : taskOrRef;
    for (;;) {
        if (handlers.signal?.aborted) throw new FilmVideoStoppedError();
        task = await pollVideoGenerationTaskStatus(config, task, handlers.signal);
        if (typeof task.progress === "number") handlers.onProgress?.(Math.max(0, Math.min(100, Math.round(task.progress))));
        const status = (task.status || "").toLowerCase();
        if (FAILED_STATUS.includes(status)) throw new Error(task.error?.message || "视频生成失败");
        const videoUrl = task.video_url || task.url || "";
        if (videoUrl || task.storageKey) return { videoUrl, storageKey: task.storageKey || "" };
        if (DONE_STATUS.includes(status)) throw new Error("视频生成完成但没有返回视频地址");
        await sleep(VIDEO_POLL_INTERVAL_MS, handlers.signal);
    }
}

/** 停止时尽力通知服务端取消任务（仅账号代理模式生效），其余渠道只停止本地等待。 */
export async function stopFilmVideoTask(config: AiConfig | null, task: FilmShotTask | null): Promise<boolean> {
    if (!config || !task) return false;
    try {
        await deleteVideoGenerationTask(config, { id: task.id, task_id: task.taskId, video_id: task.videoId } as VideoResponse);
        return true;
    } catch {
        return false;
    }
}

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new FilmVideoStoppedError());
            return;
        }
        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(new FilmVideoStoppedError());
        };
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort);
    });
}
