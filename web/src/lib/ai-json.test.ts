import assert from "node:assert/strict";
import test from "node:test";

import { cleanAiJsonText, extractAiJsonBlock } from "./ai-json";

test("AI JSON text cleanup removes fences and keeps content", () => {
    assert.equal(cleanAiJsonText("```json\n[{\"a\":1}]\n```"), "[{\"a\":1}]");
    assert.equal(cleanAiJsonText("```\n{\"a\":1}\n```"), "{\"a\":1}");
    assert.equal(cleanAiJsonText("  {\"a\":1}  "), "{\"a\":1}");
});

test("AI JSON block extraction handles surrounding prose and missing wrappers", () => {
    assert.equal(extractAiJsonBlock('说明\n[{"a":1}]\n结束', "array"), '[{"a":1}]');
    assert.equal(extractAiJsonBlock('说明\n{"a":{"b":1}}\n结束', "object"), '{"a":{"b":1}}');
    assert.equal(extractAiJsonBlock("没有 JSON", "object"), null);
});
