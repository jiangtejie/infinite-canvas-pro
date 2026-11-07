import { type MatchedTranslation, type TranslationInput, type TranslationResult } from "../channel-parameter-translation";
import { type AiConfig } from "@/stores/use-config-store";
import { formatErrorDetail } from "../ai-request";
import { ReferenceImage } from "@/types/image";
import { ReferenceAudio, ReferenceVideo } from "@/types/media";


export type VideoResponse = { parameter_translation?: boolean; translationSnapshot?: LocalVideoTranslationSnapshot; id: string; task_id?: string; video_id?: string; source_id?: string; sourceId?: string; channelId?: string; userChannelId?: string; channelName?: string; workflowRef?: string; channel_id?: string; user_channel_id?: string; channel_name?: string; status?: string; video_url?: string; url?: string; storageKey?: string; progress?: number; error?: { message?: string }; size?: string; seconds?: string; model?: string; created_at?: string | number; createdAt?: string | number; started_at?: string | number; startedAt?: string | number; request_body?: string };
export type ApiVideoEnvelope = { code: number; data?: VideoResponse | VideoResponse[] | null; msg?: string; message?: string };
export type ApiVideoResponse = VideoResponse | ApiVideoEnvelope;
export type VideoGenerationResult = { id: string; url: string; durationMs: number; width: number; height: number; bytes: number; mimeType: string; task: VideoResponse };
type LocalVideoTranslationSnapshot = { match:MatchedTranslation; input:TranslationInput; baseUrl:string; protocol:AiConfig["localChannels"][number]["protocol"]; taskIds:string[]; completed:Record<string,TranslationResult> };
export type CreatedVideoGenerationTask = { task: VideoResponse; pollId: string; startedAt: number; requestBody: unknown };
export type VideoProgressHandler = (progress: number, task: VideoResponse) => void;
export type VideoTaskCreateOptions = { signal?: AbortSignal; onServerTask?: () => void; clientTaskId?: string; source?: "video-workbench" | "canvas"; sourceId?: string };
export const VIDEO_POLL_INTERVAL_MS = 5000;

export class VideoRequestError extends Error {
    detail?: string;

    constructor(message: string, detail?: unknown) {
        super(message);
        this.name = "VideoRequestError";
        this.detail = formatErrorDetail(detail);
    }
}

export type VideoReferenceInput = {
    references?: ReferenceImage[];
    videoReferences?: ReferenceVideo[];
    audioReferences?: ReferenceAudio[];
    firstFrame?: ReferenceImage | null;
    lastFrame?: ReferenceImage | null;
};
