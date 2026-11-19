import type { FilmImageRef, FilmImageSlot } from "@/lib/film/types";

export const FILM_IMAGE_SLOT_LIMIT = 12;

export function createFilmImageSlot(): FilmImageSlot {
    return { images: [], locked: false };
}

/** 唯一取图入口：优先当前选定版本，否则取最新一张。 */
export function activeSlotImage(slot?: FilmImageSlot): FilmImageRef | undefined {
    if (!slot?.images.length) return undefined;
    return slot.images.find((image) => image.id === slot.activeImageId) || slot.images[slot.images.length - 1];
}

/** 追加版本并自动设为当前；超过上限时淘汰最旧的非当前版本。 */
export function appendSlotImage(slot: FilmImageSlot, image: FilmImageRef): FilmImageSlot {
    const images = [...slot.images, image];
    while (images.length > FILM_IMAGE_SLOT_LIMIT) {
        const index = images.findIndex((item) => item.id !== image.id);
        if (index < 0) break;
        images.splice(index, 1);
    }
    return { ...slot, images, activeImageId: image.id };
}

export function selectSlotImage(slot: FilmImageSlot, imageId: string): FilmImageSlot {
    if (!slot.images.some((image) => image.id === imageId)) return slot;
    return { ...slot, activeImageId: imageId };
}

export function updateSlotImage(slot: FilmImageSlot, imageId: string, patch: Partial<FilmImageRef>): FilmImageSlot {
    return { ...slot, images: slot.images.map((image) => image.id === imageId ? { ...image, ...patch } : image) };
}

export function removeSlotImage(slot: FilmImageSlot, imageId: string): FilmImageSlot {
    const images = slot.images.filter((image) => image.id !== imageId);
    return { ...slot, images, activeImageId: slot.activeImageId === imageId ? images[images.length - 1]?.id : slot.activeImageId };
}
