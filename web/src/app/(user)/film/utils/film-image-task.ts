import { createCanvasImageTask, pollCanvasImageTaskStatus, type CanvasImageTask, type SeedableImageConfig } from "@/services/api/image";
import type { ReferenceImage } from "@/types/image";

const POLL_INTERVAL = 2000;
const POLL_LIMIT = 150;

function isDone(status?: string) {
    return ["completed", "complete", "done", "succeeded", "success"].includes((status || "").toLowerCase());
}

function isFailed(status?: string) {
    return (status || "").toLowerCase() === "failed";
}

/** 提交图片任务并轮询到结束，供分镜图与角色设定图共用。 */
export async function runImageTask(config: SeedableImageConfig, prompt: string, references: ReferenceImage[], nodeId: string) {
    let task: CanvasImageTask = await createCanvasImageTask(config, prompt, references, { source: "canvas", nodeId });
    for (let attempt = 0; !isDone(task.status) && !isFailed(task.status) && attempt < POLL_LIMIT; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        task = await pollCanvasImageTaskStatus(task.id);
    }
    if (isFailed(task.status)) throw new Error(task.error?.message || task.error_detail || "图片生成失败");
    if (!isDone(task.status)) throw new Error("生成超时，稍后重试");
    const imageUrl = task.image_url || task.image_urls?.[0] || task.url || "";
    if (!imageUrl) throw new Error("接口没有返回图片");
    return { imageUrl, storageKey: task.storageKey || "" };
}
