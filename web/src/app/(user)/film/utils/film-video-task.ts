import type { VideoResponse } from "@/services/api/video";
import type { FilmShotTask } from "@/lib/film/types";

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
