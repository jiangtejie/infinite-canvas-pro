import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    FILM_IMAGE_SLOT_LIMIT,
    activeSlotImage,
    appendSlotImage,
    createFilmImageSlot,
    removeSlotImage,
    selectSlotImage,
    updateSlotImage,
} from "./film-image-slot";

function image(id: string) {
    return { id, url: `${id}.png` };
}

describe("film-image-slot", () => {
    it("追加版本后自动设为当前", () => {
        let slot = createFilmImageSlot();
        slot = appendSlotImage(slot, image("a"));
        slot = appendSlotImage(slot, image("b"));
        assert.equal(slot.activeImageId, "b");
        assert.equal(activeSlotImage(slot)?.id, "b");
    });

    it("selectSlotImage 只接受池内版本并保留其他字段", () => {
        let slot = appendSlotImage(appendSlotImage(createFilmImageSlot(), image("a")), image("b"));
        slot = selectSlotImage(slot, "a");
        assert.equal(activeSlotImage(slot)?.id, "a");
        assert.equal(selectSlotImage(slot, "missing").activeImageId, "a");
    });

    it("activeImageId 失效时回退最新一张", () => {
        const slot = { ...appendSlotImage(createFilmImageSlot(), image("a")), activeImageId: "gone" };
        assert.equal(activeSlotImage(slot)?.id, "a");
        assert.equal(activeSlotImage(createFilmImageSlot()), undefined);
    });

    it("超过上限时淘汰最旧的非当前版本，当前版本不淘汰", () => {
        let slot = createFilmImageSlot();
        for (let index = 0; index < FILM_IMAGE_SLOT_LIMIT + 2; index += 1) slot = appendSlotImage(slot, image(`v${index}`));
        assert.equal(slot.images.length, FILM_IMAGE_SLOT_LIMIT);
        assert.equal(slot.images[0].id, "v2");
        assert.equal(slot.images[slot.images.length - 1].id, `v${FILM_IMAGE_SLOT_LIMIT + 1}`);
        assert.equal(activeSlotImage(slot)?.id, `v${FILM_IMAGE_SLOT_LIMIT + 1}`);
    });

    it("评分与锁定不改变当前版本", () => {
        let slot = appendSlotImage(appendSlotImage(createFilmImageSlot(), image("a")), image("b"));
        slot = selectSlotImage(slot, "a");
        slot = updateSlotImage(slot, "a", { rating: 2, notes: "可用" });
        slot = { ...slot, locked: true };
        assert.deepEqual(slot.images[0], { id: "a", url: "a.png", rating: 2, notes: "可用" });
        assert.equal(activeSlotImage(slot)?.id, "a");
        assert.equal(slot.locked, true);
    });

    it("删除当前版本后回退到剩余最新一张", () => {
        let slot = appendSlotImage(appendSlotImage(createFilmImageSlot(), image("a")), image("b"));
        slot = removeSlotImage(slot, "b");
        assert.equal(slot.images.length, 1);
        assert.equal(activeSlotImage(slot)?.id, "a");
    });
});
