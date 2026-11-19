import assert from "node:assert/strict";
import test from "node:test";

import type { ComicImageSlot } from "../types";
import { COMIC_IMAGE_SLOT_LIMIT, activeComicSlotImage, appendComicSlotImage, applyComicReferenceSlot, removeComicSlotImage, updateComicSlotImage } from "./comic-image-slot";

function image(index: number) {
    return { url: `https://cdn/${index}.png`, storageKey: `server:${index}.png` };
}

test("版本池按上限淘汰旧版本并保持新图为当前版本", () => {
    let slot: ComicImageSlot = { images: [] };
    for (let index = 0; index < COMIC_IMAGE_SLOT_LIMIT + 2; index += 1) slot = appendComicSlotImage(slot, image(index));
    assert.equal(slot.images.length, COMIC_IMAGE_SLOT_LIMIT);
    assert.equal(activeComicSlotImage(slot)?.url, `https://cdn/${COMIC_IMAGE_SLOT_LIMIT + 1}.png`);
    assert.equal(slot.images[0]?.url, "https://cdn/2.png");
});

test("删除当前版本后回落到最后一个版本", () => {
    let slot: ComicImageSlot = { images: [] };
    slot = appendComicSlotImage(slot, image(1));
    slot = appendComicSlotImage(slot, image(2));
    const active = activeComicSlotImage(slot)!;
    const next = removeComicSlotImage(slot, active.id);
    assert.equal(next.images.length, 1);
    assert.equal(activeComicSlotImage(next)?.url, "https://cdn/1.png");
});

test("评分与锁定变化不递增 revision，换版本才递增", () => {
    const reference = applyComicReferenceSlot(undefined, "c1:primary", { images: [] });
    const added = applyComicReferenceSlot(reference, "c1:primary", appendComicSlotImage(reference.slot, image(1)));
    assert.equal(added.revision, 1);
    const active = activeComicSlotImage(added.slot)!;
    const rated = applyComicReferenceSlot(added, "c1:primary", updateComicSlotImage(added.slot, active.id, { rating: 3 }));
    assert.equal(rated.revision, added.revision);
    const locked = applyComicReferenceSlot(rated, "c1:primary", { ...rated.slot, locked: true });
    assert.equal(locked.revision, rated.revision);
    const replaced = applyComicReferenceSlot(locked, "c1:primary", appendComicSlotImage(locked.slot, image(2)));
    assert.equal(replaced.revision, added.revision + 1);
});
