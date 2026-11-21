import type { CanvasImageTask } from "@/services/api/image";
import type { FilmShot } from "@/lib/film/types";
import { withImageVersion } from "@/app/(user)/film/utils/film-versions";
import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS } from "./canvas-node-constants";
import { canvasImageTaskURLs, canvasTaskCompleted, canvasTaskFailed } from "./canvas-task-helpers";

export function selectFilmShotImageTaskTargets(nodes: CanvasNodeData[]) {
    return nodes.filter((node) =>
        node.type === CanvasNodeType.Shot
        && node.metadata?.status === NODE_STATUS_LOADING
        && node.metadata?.imageTaskId
        && node.metadata?.filmShot?.pendingTask?.kind === "image");
}

export function applyFilmShotImageTaskUpdate(nodes: CanvasNodeData[], shotId: string, task: CanvasImageTask, clientTaskId?: string): CanvasNodeData[] {
    return nodes.map((node) => {
        if (node.id !== shotId) return node;
        const payload = node.metadata?.filmShot;
        const pending = payload?.pendingTask;
        if (!payload || pending?.kind !== "image") return node;
        if (clientTaskId && node.metadata?.clientTaskId !== clientTaskId) return node;
        const url = canvasImageTaskURLs(task)[0] || "";
        const completed = canvasTaskCompleted(task.status) || Boolean(url);
        const failed = canvasTaskFailed(task.status) || (completed && !url);
        const progress = typeof task.progress === "number" ? Math.max(0, Math.min(100, task.progress)) : node.metadata?.progress || 0;
        if (failed) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: task.error?.message || "分镜图生成失败",
                    imageTaskId: undefined,
                    clientTaskId: undefined,
                    filmShotTaskKind: undefined,
                    filmShot: { ...payload, errorMessage: task.error?.message || "分镜图生成失败", lastFailedTaskKind: "image", pendingTask: undefined },
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
                    imageTaskId: task.id || node.metadata?.imageTaskId,
                    filmShot: payload,
                },
            };
        }
        const version = withImageVersion({
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
                imageTaskId: undefined,
                imageTaskResultId: task.id,
                clientTaskId: undefined,
                filmShotTaskKind: undefined,
                durationMs: Date.now() - startedAt,
                filmShot: { ...payload, ...version, lastFailedTaskKind: undefined, pendingTask: undefined },
            },
        };
    });
}
