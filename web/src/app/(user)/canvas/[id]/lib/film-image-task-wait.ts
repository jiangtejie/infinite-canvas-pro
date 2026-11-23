import type { CanvasImageTask } from "@/services/api/image";
import { pollCanvasImageTaskStatus } from "@/services/api/image";
import { canvasTaskCompleted, canvasTaskFailed } from "./canvas-task-helpers";

type FilmImageTaskWaitOptions = {
    signal: AbortSignal;
    timeoutMs?: number;
    intervalMs?: number;
    timeoutMessage?: string;
    onProgress?: (progress: number) => void;
    poll?: (id: string, signal: AbortSignal) => Promise<CanvasImageTask>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
};

/** 单次图片任务的统一等待：调用方只负责创建任务与回写结果。 */
export async function waitForCanvasImageTask(task: CanvasImageTask, options: FilmImageTaskWaitOptions): Promise<CanvasImageTask> {
    const {
        signal,
        timeoutMs = 10 * 60 * 1000,
        intervalMs = 1200,
        timeoutMessage = "图片任务超时，请稍后重试",
        onProgress,
        poll = pollCanvasImageTaskStatus,
        sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now = Date.now,
    } = options;
    let current = task;
    const startedAt = now();
    while (!canvasTaskCompleted(current.status) && !canvasTaskFailed(current.status)) {
        if (now() - startedAt > timeoutMs) throw new Error(timeoutMessage);
        await sleep(intervalMs);
        signal.throwIfAborted();
        current = await poll(current.id, signal);
        onProgress?.(Math.max(0, Math.min(100, current.progress ?? 0)));
    }
    return current;
}
