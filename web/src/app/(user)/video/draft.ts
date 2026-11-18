"use client";

import { accountScopedStore } from "@/lib/account-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import { normalizeVideoCount } from "./history";

export type VideoWorkbenchDraft = {
    prompt: string;
    negativePrompt: string;
    references: ReferenceImage[];
    firstFrame: ReferenceImage | null;
    lastFrame: ReferenceImage | null;
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    taskCount: number;
    updatedAt: number;
};

export type VideoDraftInput = Omit<VideoWorkbenchDraft, "updatedAt">;

const draftStore = accountScopedStore("video_workbench_draft");
const VIDEO_DRAFT_KEY = "current";

function isRemoteUrl(value?: string) {
    return Boolean(value && /^https?:\/\//.test(value));
}

/** 草稿只保留存储键和可重新访问的远程地址，不复制 base64 / blob，避免本地库随参考素材膨胀。 */
export function serializeDraftImage(reference: ReferenceImage): ReferenceImage | null {
    const storageKey = reference.storageKey || "";
    const dataUrl = storageKey ? "" : isRemoteUrl(reference.dataUrl) ? reference.dataUrl : "";
    if (!storageKey && !dataUrl) return null;
    return { ...reference, dataUrl, storageKey };
}

export function serializeDraftMedia<T extends ReferenceVideo | ReferenceAudio>(reference: T): T | null {
    const storageKey = reference.storageKey || "";
    const url = storageKey ? "" : isRemoteUrl(reference.url) ? reference.url : "";
    if (!storageKey && !url) return null;
    return { ...reference, url, storageKey };
}

export function serializeVideoDraft(input: VideoDraftInput): VideoDraftInput {
    return {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt || "",
        references: input.references.map(serializeDraftImage).filter((item): item is ReferenceImage => Boolean(item)),
        firstFrame: input.firstFrame ? serializeDraftImage(input.firstFrame) : null,
        lastFrame: input.lastFrame ? serializeDraftImage(input.lastFrame) : null,
        videoReferences: input.videoReferences.map(serializeDraftMedia).filter((item): item is ReferenceVideo => Boolean(item)),
        audioReferences: input.audioReferences.map(serializeDraftMedia).filter((item): item is ReferenceAudio => Boolean(item)),
        taskCount: normalizeVideoCount(input.taskCount),
    };
}

export function isEmptyVideoDraft(draft: VideoDraftInput) {
    return !draft.prompt.trim() && !draft.negativePrompt.trim() && !draft.references.length && !draft.firstFrame && !draft.lastFrame && !draft.videoReferences.length && !draft.audioReferences.length;
}

async function resolveDraftImage(reference: ReferenceImage): Promise<ReferenceImage | null> {
    if (!reference.storageKey) return reference.dataUrl ? reference : null;
    const url = await resolveImageUrl(reference.storageKey, reference.dataUrl).catch(() => "");
    return url ? { ...reference, dataUrl: url } : null;
}

async function resolveDraftMedia<T extends ReferenceVideo | ReferenceAudio>(reference: T): Promise<T | null> {
    if (!reference.storageKey) return reference.url ? reference : null;
    const url = await resolveMediaUrl(reference.storageKey, reference.url).catch(() => "");
    return url ? { ...reference, url } : null;
}

export async function readVideoDraft(): Promise<VideoDraftInput | null> {
    const draft = await draftStore.getItem<VideoWorkbenchDraft>(VIDEO_DRAFT_KEY);
    if (!draft) return null;
    const [references, firstFrame, lastFrame, videoReferences, audioReferences] = await Promise.all([
        Promise.all((draft.references || []).map(resolveDraftImage)),
        draft.firstFrame ? resolveDraftImage(draft.firstFrame) : null,
        draft.lastFrame ? resolveDraftImage(draft.lastFrame) : null,
        Promise.all((draft.videoReferences || []).map(resolveDraftMedia)),
        Promise.all((draft.audioReferences || []).map(resolveDraftMedia)),
    ]);
    const restored: VideoDraftInput = {
        prompt: draft.prompt || "",
        negativePrompt: draft.negativePrompt || "",
        references: references.filter((item): item is ReferenceImage => Boolean(item)),
        firstFrame,
        lastFrame,
        videoReferences: videoReferences.filter((item): item is ReferenceVideo => Boolean(item)),
        audioReferences: audioReferences.filter((item): item is ReferenceAudio => Boolean(item)),
        taskCount: normalizeVideoCount(draft.taskCount),
    };
    return isEmptyVideoDraft(restored) ? null : restored;
}

export async function saveVideoDraft(input: VideoDraftInput) {
    const serialized = serializeVideoDraft(input);
    if (isEmptyVideoDraft(serialized)) {
        await draftStore.removeItem(VIDEO_DRAFT_KEY);
        return;
    }
    await draftStore.setItem<VideoWorkbenchDraft>(VIDEO_DRAFT_KEY, { ...serialized, updatedAt: Date.now() });
}
