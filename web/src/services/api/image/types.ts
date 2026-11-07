import { type UploadedImage } from "@/services/image-storage";
import { type AiConfig } from "@/stores/use-config-store";
import { formatErrorDetail } from "../ai-request";


/** 同一提示词批量出图时，用于区分第几张的种子参数。 */
export type SeedableImageConfig = AiConfig & { seedIndex?: number; seedCount?: number };

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};

export type ResponsesApiResponse = {
    output?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};

export type ChatImagesApiResponse = {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};

export type GeneratedImage = { id: string; dataUrl: string; seed?: number } & Partial<UploadedImage>;
export type CanvasImageTask = {
    id: string;
    parent_task_id?: string;
    object?: string;
    source?: string;
    source_id?: string;
    node_id?: string;
    channelId?: string;
    userChannelId?: string;
    channelName?: string;
    workflowRef?: string;
    model?: string;
    prompt?: string;
    status: "queued" | "processing" | "completed" | "failed" | string;
    progress?: number;
    url?: string;
    image_url?: string;
    image_urls?: string[];
    imageStorage?: Array<UploadedImage | null>;
    storageKey?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    bytes?: number;
    started_at?: string;
    startedAt?: string;
    created_at?: string;
    createdAt?: string;
    completed_at?: string;
    error?: { message?: string };
    error_detail?: string;
};
export type CanvasImageTaskOptions = { nodeId?: string; source?: "canvas" | "image-workbench" | "workflow"; sourceId?: string; clientTaskId?: string; signal?: AbortSignal; onServerTask?: () => void };

export type ParsedImageResponse = {
    images: GeneratedImage[];
    responseBody: string;
};

export class ImageRequestError extends Error {
    detail?: string;

    constructor(message: string, detail?: unknown) {
        super(message);
        this.name = "ImageRequestError";
        this.detail = formatErrorDetail(detail);
    }
}

export type ImageRequestParams = {
    n: number;
    quality: string;
    size?: string;
    timeoutSeconds: number;
    streamPartialImages: number;
    signal?: AbortSignal;
};
