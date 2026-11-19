import { nanoid } from "nanoid";

import type { ComicCharacterReference, ComicImageRef, ComicImageSlot, ComicSlotImage } from "../types";

export const COMIC_IMAGE_SLOT_LIMIT = 12;

export function createComicSlotImage(image: ComicImageRef, label?: string): ComicSlotImage {
    return { ...image, id: nanoid(), ...(label ? { label } : {}), createdAt: new Date().toISOString() };
}

export function createComicImageSlot(image?: ComicImageRef): ComicImageSlot {
    if (!image?.url) return { images: [] };
    const item = createComicSlotImage(image);
    return { images: [item], activeImageId: item.id };
}

export function activeComicSlotImage(slot?: ComicImageSlot) {
    if (!slot?.images.length) return undefined;
    return slot.images.find((image) => image.id === slot.activeImageId) || slot.images[slot.images.length - 1];
}

export function appendComicSlotImage(slot: ComicImageSlot, image: ComicImageRef): ComicImageSlot {
    const item = createComicSlotImage(image);
    const images = [...slot.images, item];
    while (images.length > COMIC_IMAGE_SLOT_LIMIT) {
        const index = images.findIndex((current) => current.id !== item.id);
        if (index < 0) break;
        images.splice(index, 1);
    }
    return { ...slot, images, activeImageId: item.id };
}

export function selectComicSlotImage(slot: ComicImageSlot, imageId: string): ComicImageSlot {
    return slot.images.some((image) => image.id === imageId) ? { ...slot, activeImageId: imageId } : slot;
}

export function removeComicSlotImage(slot: ComicImageSlot, imageId: string): ComicImageSlot {
    const images = slot.images.filter((image) => image.id !== imageId);
    return { ...slot, images, activeImageId: slot.activeImageId === imageId ? images[images.length - 1]?.id : slot.activeImageId };
}

export function updateComicSlotImage(slot: ComicImageSlot, imageId: string, patch: Partial<ComicSlotImage>): ComicImageSlot {
    return { ...slot, images: slot.images.map((image) => image.id === imageId ? { ...image, ...patch } : image) };
}

function slotVisualSignature(slot?: ComicImageSlot) {
    return JSON.stringify([slot?.activeImageId || "", slot?.images.map((image) => [image.id, image.url, image.storageKey || ""]) || []]);
}

/** 只有版本池内容或当前版本变化才递增 revision，评分与锁定不影响已生成页格的过期判断。 */
export function applyComicReferenceSlot(reference: ComicCharacterReference | undefined, fallbackId: string, slot: ComicImageSlot): ComicCharacterReference {
    const changed = slotVisualSignature(reference?.slot) !== slotVisualSignature(slot);
    return { id: reference?.id || fallbackId, revision: Math.max(0, (reference?.revision ?? -1) + (changed ? 1 : 0)), slot };
}
