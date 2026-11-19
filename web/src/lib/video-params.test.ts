import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVideoSeconds, normalizeVideoSecondsForModel, normalizeVideoSize } from "./video-params";

test("通用时长保留智能值并夹取范围", () => {
    assert.equal(normalizeVideoSeconds("-1"), "-1");
    assert.equal(normalizeVideoSeconds("0"), "6");
    assert.equal(normalizeVideoSeconds("99"), "30");
    assert.equal(normalizeVideoSeconds("5"), "5");
});

test("智能时长按模型保留或回落", () => {
    assert.equal(normalizeVideoSecondsForModel("seedance-2-5", "-1"), "-1");
    assert.equal(normalizeVideoSecondsForModel("sd2-5", "-1"), "-1");
    assert.equal(normalizeVideoSecondsForModel("wan3", "-1"), "-1");
    assert.equal(normalizeVideoSecondsForModel("grok-imagine-video", "-1"), "6");
    assert.equal(normalizeVideoSecondsForModel("seedance-2-5", "31"), "30");
    assert.equal(normalizeVideoSecondsForModel("seedance-1-0", "16"), "15");
});

test("尺寸配置保留 auto 并归一化比例", () => {
    assert.equal(normalizeVideoSize("auto"), "auto");
    assert.equal(normalizeVideoSize("9:16"), "720x1280");
    assert.equal(normalizeVideoSize("1:1"), "1280x720");
    assert.equal(normalizeVideoSize("1080x1920"), "1080x1920");
});
