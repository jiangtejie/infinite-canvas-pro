"use client";

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
