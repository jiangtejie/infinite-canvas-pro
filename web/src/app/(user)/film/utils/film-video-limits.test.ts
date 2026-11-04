import assert from "node:assert/strict";
import test from "node:test";

import { clampFilmVideoDuration, filmVideoAspect, filmVideoLimits, filmVideoReferenceLimit } from "./film-video-limits";

test("识别 Seedance 2.0 / 2.5 的时长范围", () => {
    assert.deepEqual(filmVideoLimits("doubao-seedance-2-0"), { isSeedance: true, min: 4, max: 15, label: "Seedance 2.0" });
    assert.deepEqual(filmVideoLimits("seedance-2-5-pro"), { isSeedance: true, min: 4, max: 30, label: "Seedance 2.5" });
    assert.equal(filmVideoLimits("grok-imagine-video").isSeedance, false);
});

test("时长按模型范围收敛", () => {
    assert.equal(clampFilmVideoDuration(3, "seedance-2-5"), 4);
    assert.equal(clampFilmVideoDuration(20, "seedance-2-0"), 15);
    assert.equal(clampFilmVideoDuration(5, "grok-imagine-video"), 5);
});

test("2.39:1 在 Seedance 下映射到 21:9", () => {
    assert.equal(filmVideoAspect("2.39:1", "seedance-2-5"), "21:9");
    assert.equal(filmVideoAspect("9:16", "seedance-2-5"), "9:16");
    assert.equal(filmVideoAspect("2.39:1", "grok-imagine-video"), "2.39:1");
});

test("Seedance 参考图数量上限", () => {
    assert.equal(filmVideoReferenceLimit("seedance-2-5"), 10);
    assert.equal(filmVideoReferenceLimit("grok-imagine-video"), 8);
});
