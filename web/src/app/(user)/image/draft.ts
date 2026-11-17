"use client";

import { accountScopedStore } from "@/lib/account-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type DraftReference = ReferenceImage & { source?: string; temporary?: boolean; assetId?: string };

export type ImageWorkbenchDraft = {
    prompt: string;
    references: DraftReference[];
    updatedAt: number;
};

const draftStore = accountScopedStore("image_workbench_draft");
const IMAGE_DRAFT_KEY = "current";

/** 草稿只保留存储键和可重新访问的远程地址，不复制 base64 / blob，避免本地库随参考图膨胀。 */
export function serializeDraftReference(reference: ReferenceImage): DraftReference | null {
    const item = reference as DraftReference;
    const remoteUrl = /^https?:\/\//.test(item.dataUrl) ? item.dataUrl : /^https?:\/\//.test(item.url || "") ? item.url || "" : "";
    if (!item.storageKey && !remoteUrl) return null;
    return { id: item.id, name: item.name, type: item.type, dataUrl: remoteUrl, storageKey: item.storageKey, source: item.source, temporary: item.temporary, assetId: item.assetId };
}

async function resolveDraftReference(reference: DraftReference): Promise<DraftReference | null> {
    if (!reference.storageKey) return reference.dataUrl ? reference : null;
    const url = await resolveImageUrl(reference.storageKey, reference.dataUrl).catch(() => "");
    return url ? { ...reference, dataUrl: url } : null;
}

export async function readWorkbenchDraft(): Promise<ImageWorkbenchDraft | null> {
    const draft = await draftStore.getItem<ImageWorkbenchDraft>(IMAGE_DRAFT_KEY);
    if (!draft) return null;
    const references = (await Promise.all((draft.references || []).map((reference) => resolveDraftReference(reference)))).filter((item): item is DraftReference => Boolean(item));
    return { prompt: draft.prompt || "", references, updatedAt: draft.updatedAt || 0 };
}

export async function saveWorkbenchDraft(prompt: string, references: ReferenceImage[]) {
    const items = references.map(serializeDraftReference).filter((item): item is DraftReference => Boolean(item));
    if (!prompt.trim() && !items.length) {
        await draftStore.removeItem(IMAGE_DRAFT_KEY);
        return;
    }
    await draftStore.setItem<ImageWorkbenchDraft>(IMAGE_DRAFT_KEY, { prompt, references: items, updatedAt: Date.now() });
}
