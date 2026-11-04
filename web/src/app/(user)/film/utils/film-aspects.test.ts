import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FILM_ASPECT, FILM_ASPECT_OPTIONS, filmAspectLabel, normalizeFilmAspect } from "./film-aspects";

test("画幅选项包含常用的横竖屏", () => {
    const values = FILM_ASPECT_OPTIONS.map((option) => option.value);
    assert.ok(values.includes("9:16"));
    assert.ok(values.includes("16:9"));
    assert.ok(values.includes("2.39:1"));
});

test("非法画幅回退默认值", () => {
    assert.equal(normalizeFilmAspect("bad"), DEFAULT_FILM_ASPECT);
    assert.equal(normalizeFilmAspect(undefined), DEFAULT_FILM_ASPECT);
    assert.equal(normalizeFilmAspect("9:16"), "9:16");
});

test("画幅显示文案", () => {
    assert.equal(filmAspectLabel("9:16"), "9:16 竖屏");
    assert.equal(filmAspectLabel("16:9"), "16:9 横屏");
});
