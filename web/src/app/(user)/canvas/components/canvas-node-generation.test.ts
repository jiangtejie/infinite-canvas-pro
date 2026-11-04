import assert from "node:assert/strict";
import test from "node:test";

import { appendImageNegativePrompt } from "./canvas-node-generation";

test("appendImageNegativePrompt 把负向提示词转成 Avoid 句式追加在末尾", () => {
    assert.equal(appendImageNegativePrompt("a swordsman in an alley", "modern clothes, watermark"), "a swordsman in an alley\n\nAvoid: modern clothes, watermark");
});

test("appendImageNegativePrompt 没有负向提示词时保持原样", () => {
    assert.equal(appendImageNegativePrompt("a swordsman", ""), "a swordsman");
    assert.equal(appendImageNegativePrompt("a swordsman", "   "), "a swordsman");
    assert.equal(appendImageNegativePrompt("a swordsman", undefined), "a swordsman");
});
