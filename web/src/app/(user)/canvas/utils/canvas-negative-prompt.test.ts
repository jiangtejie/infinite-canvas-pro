import assert from "node:assert/strict";
import test from "node:test";

import { inferNegativePrompt, mergeNegativePrompts, resolveImageNegativePrompt } from "./canvas-negative-prompt";

test("人像提示词会带出人物负面词", () => {
    const negative = inferNegativePrompt("portrait of a young swordsman, cinematic light, 8k");
    assert.match(negative, /extra fingers/);
    assert.match(negative, /bad hands/);
    assert.match(negative, /blurry/);
});

test("动漫提示词会带出写实类负面词", () => {
    assert.match(inferNegativePrompt("anime girl in a garden, soft colors"), /photorealistic/);
});

test("正向提示词里已经出现的负面词不会重复加", () => {
    const negative = inferNegativePrompt("a photo with faded text on the wall");
    assert.doesNotMatch(negative, /(^|, )text(,|$)/);
});

test("要求文字的提示词改用排版类负面词", () => {
    const negative = inferNegativePrompt("a poster with large Chinese text, minimal layout");
    assert.match(negative, /garbled text/);
    assert.doesNotMatch(negative, /(^|, )text(,|$)/);
});

test("合并负面词时去重并限制条数", () => {
    assert.equal(mergeNegativePrompts("blurry, watermark", "watermark, bad hands"), "blurry, watermark, bad hands");
    const many = Array.from({ length: 20 }, (_, index) => "term" + index).join(", ");
    assert.equal(mergeNegativePrompts(many).split(", ").length, 12);
});

test("关闭自动推断时只使用手填内容", () => {
    assert.equal(resolveImageNegativePrompt("portrait of a man", "my own negative", false), "my own negative");
    assert.match(resolveImageNegativePrompt("portrait of a man", "my own negative", true), /my own negative.*extra fingers/);
});
