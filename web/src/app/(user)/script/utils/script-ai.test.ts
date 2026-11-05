import assert from "node:assert/strict";
import test from "node:test";

import { cleanScriptRewriteText, parseScriptSceneDiagnosis } from "./script-ai";

test("解析 AI 场景诊断 JSON，兼容 Markdown 和异常 severity", () => {
    const result = parseScriptSceneDiagnosis(`\`\`\`json
{"score":78,"summary":"目标清楚，但转折偏弱","issues":[{"severity":"high","title":"转折不够","detail":"阿健只是接受了照片","suggestion":"让阿健主动藏起照片"},{"severity":"unknown","title":"对白解释","detail":"","suggestion":"用动作替代"}]}
\`\`\``);
    assert.equal(result.score, 78);
    assert.match(result.summary, /目标清楚/);
    assert.equal(result.issues.length, 2);
    assert.equal(result.issues[0].severity, "high");
    assert.equal(result.issues[1].severity, "medium");
    assert.equal(result.issues[1].title, "对白解释");
});

test("非法诊断返回可读错误", () => {
    assert.throws(() => parseScriptSceneDiagnosis("not json"), /不是有效 JSON/);
});

test("清理改写建议的代码块和首尾引号", () => {
    assert.equal(cleanScriptRewriteText("\`\`\`text\n阿健：快走。\n\`\`\`"), "阿健：快走。");
    assert.equal(cleanScriptRewriteText("“阿健：快走。”"), "阿健：快走。");
});
