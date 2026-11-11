import assert from "node:assert/strict";
import test from "node:test";

import { modelTestSummary, parseModelTestResult } from "./settings-model-test-result";

const imageData = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD";

test("parses markdown data image and removes base64 from text", () => {
    const parsed = parseModelTestResult("Hello!\n\n![image](" + imageData + ")\nDone");
    assert.deepEqual(parsed.images, [imageData]);
    assert.equal(parsed.text.includes("base64"), false);
    assert.equal(parsed.text.includes("[图片]"), true);
});

test("parses raw data image once", () => {
    const parsed = parseModelTestResult("图片：" + imageData);
    assert.deepEqual(parsed.images, [imageData]);
    assert.equal(parsed.text, "图片： [图片]");
});

test("keeps plain text and summarizes images", () => {
    const text = parseModelTestResult("Hello! How can I help you today?");
    assert.equal(text.images.length, 0);
    assert.equal(modelTestSummary(text), "Hello! How can I help you today?");
    const image = parseModelTestResult("![x](https://cdn.example.com/a.png)");
    assert.equal(modelTestSummary(image), "返回图片内容");
});
