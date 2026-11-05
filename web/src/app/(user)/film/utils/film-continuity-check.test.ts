import assert from "node:assert/strict";
import test from "node:test";

import { formatFilmContinuityCheck, parseFilmContinuityCheck } from "./film-continuity-check";

test("解析带 Markdown 的校验结果", () => {
    const result = parseFilmContinuityCheck(`\`\`\`json
{"passed":false,"issues":["鱼回到了水里","光线变成了夜晚"],"summary":"道具与时间不符"}
\`\`\``);
    assert.equal(result.passed, false);
    assert.deepEqual(result.issues, ["鱼回到了水里", "光线变成了夜晚"]);
    assert.equal(result.summary, "道具与时间不符");
});

test("通过时 issues 允许为空", () => {
    const result = parseFilmContinuityCheck('{"passed":true,"issues":[],"summary":"一致"}');
    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
});

test("校验文本带通过/不通过前缀", () => {
    assert.match(formatFilmContinuityCheck({ passed: true, issues: [], summary: "一致" }), /^通过/);
    assert.match(formatFilmContinuityCheck({ passed: false, issues: ["鱼回水里"], summary: "" }), /^不通过/);
});
