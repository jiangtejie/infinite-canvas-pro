import assert from "node:assert/strict";
import test from "node:test";

import { parseComicBreakdown, parseComicConcept } from "./comic-ai";

test("concept parser accepts fenced JSON and bounds target pages", () => {
    const concept = parseComicConcept("```json\n{\"genre\":\"都市\",\"audience\":\"大学生\",\"logline\":\"主角获得分镜能力\",\"synopsis\":\"一段完整梗概\",\"styleGuide\":\"黑白网点\",\"targetPages\":5000}\n```");
    assert.equal(concept.genre, "都市");
    assert.equal(concept.targetPages, undefined);
    assert.throws(() => parseComicConcept("{\"genre\":\"都市\"}"), /logline/);
});

test("breakdown parser builds pages and panels with stable field bounds", () => {
    const pages = parseComicBreakdown(JSON.stringify({
        pages: [
            { title: "第 1 页", summary: "开场", panels: [{ description: "广角校园", dialogue: "早上好", caption: "", sfx: "叮" }, { description: "特写", dialogue: "", caption: "心里一紧", sfx: "" }] },
            { summary: "转折", panels: [{ description: "人物转身", dialogue: "等一下", caption: "", sfx: "" }] },
        ],
    }));
    assert.equal(pages.length, 2);
    assert.equal(pages[0]?.title, "第 1 页");
    assert.equal(pages[0]?.panels.length, 2);
    assert.equal(pages[1]?.title, "第 2 页");
    assert.throws(() => parseComicBreakdown("{\"pages\":[]}"), /格式不正确/);
    assert.throws(() => parseComicBreakdown("{\"pages\":[{\"panels\":[]}]}"), /缺少页格/);
});
