import type { VideoResponse } from "@/services/api/video";
import type { FilmShot } from "@/lib/film/types";
import { withVideoVersion } from "@/app/(user)/film/utils/film-versions";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS } from "./canvas-node-constants";
import { canvasTaskCompleted, canvasTaskFailed } from "./canvas-task-helpers";

export function selectFilmShotVideoTaskTargets(nodes: CanvasNodeData[]) {
    return nodes.filter((node) =>
        node.type === CanvasNodeType.Shot
        && node.metadata?.status === NODE_STATUS_LOADING
        && node.metadata?.filmShot?.pendingTask?.kind === "video");
}

export function applyFilmShotVideoTaskUpdate(nodes: CanvasNodeData[], shotId: string, task: VideoResponse, clientTaskId?: string): CanvasNodeData[] {
    return nodes.map((node) => {
        if (node.id !== shotId) return node;
        const payload = node.metadata?.filmShot;
        const pending = payload?.pendingTask;
        if (!payload || pending?.kind !== "video") return node;
        if (clientTaskId && node.metadata?.clientTaskId !== clientTaskId) return node;
        const url = task.video_url || task.url || "";
        const completed = canvasTaskCompleted(task.status) || Boolean(url) || Boolean(task.storageKey);
        const failed = canvasTaskFailed(task.status);
        const progress = typeof task.progress === "number" ? Math.max(0, Math.min(100, task.progress)) : node.metadata?.progress || 0;
        if (failed) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: task.error?.message || "分镜视频生成失败",
                    clientTaskId: undefined,
                    filmShotTaskKind: undefined,
                    filmShot: { ...payload, errorMessage: task.error?.message || "分镜视频生成失败", lastFailedTaskKind: "video", pendingTask: undefined },
                },
            };
        }
        if (!completed) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_LOADING,
                    progress,
                    videoTaskVideoId: task.video_id || node.metadata?.videoTaskVideoId,
                    filmShot: payload,
                },
            };
        }
        const version = withVideoVersion({
            ...payload,
            id: node.id,
            characterBindings: [],
            propBindings: [],
        } as FilmShot, url, task.storageKey, pending.generationContext);
        const startedAt = node.metadata?.startedAt || pending.startedAt;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: NODE_STATUS_SUCCESS,
                progress: 100,
                errorDetails: undefined,
                clientTaskId: undefined,
                videoTaskVideoId: task.video_id,
                filmShotTaskKind: undefined,
                durationMs: Date.now() - startedAt,
                filmShot: { ...payload, ...version, lastFailedTaskKind: undefined, pendingTask: undefined },
            },
        };
    });
}
