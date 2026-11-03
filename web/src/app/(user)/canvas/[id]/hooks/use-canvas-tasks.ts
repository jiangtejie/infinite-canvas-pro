"use client";

import { useRef, useState } from "react";

import type { CanvasAudioTask } from "@/services/api/audio";
import type { CanvasImageTask } from "@/services/api/image";
import type { VideoResponse } from "@/services/api/video";

import type { CanvasNodeMetadata } from "../../types";
import type { CanvasTaskMediaSize } from "../lib/canvas-task-updates";

export type CanvasNodeTaskRun = CanvasTaskMediaSize & {
    id: string;
    controller: AbortController;
    submission?: Promise<CanvasImageTask | CanvasAudioTask | VideoResponse>;
    task?: (CanvasImageTask | CanvasAudioTask | VideoResponse) & CanvasTaskMediaSize;
    backend?: CanvasNodeMetadata["taskBackend"];
    stopping?: boolean;
    preparing?: symbol;
    generation?: symbol;
};

/**
 * 画布任务注册表：先收运行状态与 ref，轮询 / 停止 / 重试逐步迁入。
 */
export function useCanvasTasks() {
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const runningRequestRef = useRef<symbol | null>(null);
    const nodeTaskRunsRef = useRef(new Map<string, CanvasNodeTaskRun>());

    return { runningNodeId, setRunningNodeId, runningRequestRef, nodeTaskRunsRef };
}
