import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FILM_STYLE, FILM_STYLE_PRESETS, filmStyleLabel, normalizeFilmStylePreset, resolveFilmStyleText } from "./film-styles";

test("风格预设包含常见画风", () => {
    const labels = FILM_STYLE_PRESETS.map((preset) => preset.label);
    assert.ok(labels.includes("CG 动画"));
    assert.ok(labels.includes("暗黑写实"));
    assert.ok(labels.includes("电影感"));
});

test("非法预设回退自定义", () => {
    assert.equal(normalizeFilmStylePreset("bad"), DEFAULT_FILM_STYLE);
    assert.equal(normalizeFilmStylePreset(undefined), DEFAULT_FILM_STYLE);
    assert.equal(normalizeFilmStylePreset("cg"), "cg");
});

test("风格文本由预设和补充词合成", () => {
    const text = resolveFilmStyleText({ stylePreset: "dark-real", visualStyle: "低饱和" });
    assert.ok(text.includes("暗黑写实风格"));
    assert.ok(text.includes("低饱和"));
    assert.equal(resolveFilmStyleText({ stylePreset: "custom", visualStyle: "" }), "");
});

test("风格显示文案", () => {
    assert.equal(filmStyleLabel("cg"), "CG 动画");
    assert.equal(filmStyleLabel("unknown"), "自定义");
});
