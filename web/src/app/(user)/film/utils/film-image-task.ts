import { createCanvasImageTask, deleteCanvasImageTask, pollCanvasImageTaskStatus, type CanvasImageTask, type SeedableImageConfig } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

const POLL_INTERVAL = 2000;
const POLL_LIMIT = 150;

export function isFilmImageTaskDone(status?: string) {
    return ["completed", "complete", "done", "succeeded", "success"].includes((status || "").toLowerCase());
}

export function isFilmImageTaskFailed(status?: string) {
    return (status || "").toLowerCase() === "failed";
}

export type FilmImageTaskHandlers = {
    onTask?: (task: CanvasImageTask) => void;
    signal?: AbortSignal;
};

/** 停止时尽力通知服务端取消图片任务（仅账号代理模式生效），其余渠道只停止本地等待。 */
export async function stopFilmImageTask(config: AiConfig | null, taskId: string | undefined): Promise<boolean> {
    if (!config || !taskId) return false;
    try {
        await deleteCanvasImageTask(config, { id: taskId } as CanvasImageTask);
        return true;
    } catch {
        return false;
    }
}

function sleepUnlessAborted(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error("已停止生成"));
            return;
        }
        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(new Error("已停止生成"));
        };
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort);
    });
}

/** 提交图片任务并轮询到结束，供分镜图与角色设定图共用；onTask 用于把任务 id 写回镜头以便刷新后恢复。 */
export async function runImageTask(config: SeedableImageConfig, prompt: string, references: ReferenceImage[], nodeId: string, handlers: FilmImageTaskHandlers = {}) {
    let task: CanvasImageTask = await createCanvasImageTask(config, prompt, references, { source: "canvas", nodeId, signal: handlers.signal });
    handlers.onTask?.(task);
    for (let attempt = 0; !isFilmImageTaskDone(task.status) && !isFilmImageTaskFailed(task.status) && attempt < POLL_LIMIT; attempt++) {
        if (handlers.signal?.aborted) throw new Error("已停止生成");
        await sleepUnlessAborted(POLL_INTERVAL, handlers.signal);
        task = await pollCanvasImageTaskStatus(task.id, handlers.signal);
    }
    if (isFilmImageTaskFailed(task.status)) throw new Error(task.error?.message || task.error_detail || "图片生成失败");
    if (!isFilmImageTaskDone(task.status)) throw new Error("生成超时，稍后重试");
    const imageUrl = task.image_url || task.image_urls?.[0] || task.url || "";
    if (!imageUrl) throw new Error("接口没有返回图片");
    return { imageUrl, storageKey: task.storageKey || "" };
}
