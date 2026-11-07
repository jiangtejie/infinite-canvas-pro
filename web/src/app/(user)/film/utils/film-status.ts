import type { FilmShot, FilmShotStatus } from "@/lib/film/types";

/**
 * 镜头状态只由实际结果派生，避免手动把「未生成」改成「视频已生成」。
 * 有进行中的任务时优先显示生成中；失败只在没有任何图片/视频时生效。
 */
export function deriveFilmShotStatus(shot: FilmShot): FilmShotStatus {
    if (shot.pendingTask) return "generating";
    if (shot.videoUrl || shot.videoStorageKey) return "video_ready";
    if (shot.imageUrl || shot.storageKey) return "image_ready";
    if (shot.errorMessage) return "failed";
    return "idle";
}
