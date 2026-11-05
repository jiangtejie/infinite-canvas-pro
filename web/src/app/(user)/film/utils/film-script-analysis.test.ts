import assert from "node:assert/strict";
import test from "node:test";

import { collectReusableScenePayloads, mergeFilmSceneSemantics, parseSceneSemanticPayload, validateFilmScriptAnalysis } from "./film-script-analysis";
import { parseFilmScriptDocument } from "./film-script-import";
import type { FilmSceneSemanticEntry } from "./film-script-analysis";

const document = parseFilmScriptDocument(`1-1 内景 咖啡馆 日
阿健：这么晚还开着？
阿琳：等你呢。
1-2 外景 街道 夜
阿健：我们得走了。
`);

const entry = (sceneIndex: number, payload: FilmSceneSemanticEntry["payload"]): FilmSceneSemanticEntry => ({
    sceneIndex,
    episode: "第1集",
    heading: `场次 ${sceneIndex + 1}`,
    payload,
});

test("解析场次语义 JSON（兼容 Markdown）", () => {
    const payload = parseSceneSemanticPayload(`\`\`\`json
{"summary":"两人见面","mood":"暧昧","props":["咖啡"],"productionNotes":["咖啡馆实景"],"characters":[{"name":"阿健","aliases":["健哥"],"role":"主角","description":"冷淡"}],"relationships":[{"from":"阿健","to":"阿琳","type":"旧识","direction":"bilateral","strength":4,"event":"重逢"}],"beats":[{"type":"信息","summary":"关系揭示"}]}
\`\`\``);
    assert.equal(payload.summary, "两人见面");
    assert.equal(payload.characters[0]?.aliases?.[0], "健哥");
    assert.equal(payload.relationships[0].strength, 4);
});

test("合并多场语义：角色去重、关系时间区间与演变", () => {
    const analysis = mergeFilmSceneSemantics(document, [
        entry(0, {
            summary: "重逢", mood: "暧昧", props: ["咖啡"], productionNotes: [],
            characters: [{ name: "阿健", aliases: ["健哥"], role: "主角", description: "冷淡" }, { name: "阿琳", role: "女主", description: "" }],
            relationships: [{ from: "阿健", to: "阿琳", type: "旧识", direction: "bilateral", strength: 4, note: "", event: "重逢" }],
            beats: [{ type: "信息", summary: "关系揭示" }],
        }),
        entry(1, {
            summary: "离开", mood: "紧张", props: [], productionNotes: ["夜戏"],
            characters: [{ name: "阿健", role: "", description: "冷淡" }],
            relationships: [{ from: "阿健", to: "阿琳", type: "旧识", direction: "bilateral", strength: 5, note: "", event: "分歧" }],
            beats: [{ type: "冲突", summary: "争吵" }],
        }),
    ]);
    assert.equal(analysis.characters.find((character) => character.name === "阿健")?.aliases[0], "健哥");
    const relationship = analysis.relationships[0];
    assert.deepEqual(relationship.sceneRange, { start: 0, end: 1 });
    assert.equal(relationship.strength, 5);
    assert.equal(relationship.evolution.length, 2);
    assert.equal(analysis.scenes.length, 2);
    assert.deepEqual(analysis.scenes[0].characters.sort(), ["阿健", "阿琳"]);
    assert.equal(analysis.scenes[0].sourceHash, document.episodes[0].scenes[0].hash);
});

test("按场次 hash 复用未变化场次", () => {
    const original = parseFilmScriptDocument(`1-1 内景 咖啡馆 日
阿健：你好。
1-2 外景 街道 夜
阿健：走吧。
`);
    const previous = mergeFilmSceneSemantics(original, [
        entry(0, {
            summary: "重逢", mood: "", props: [], productionNotes: [],
            characters: [{ name: "阿健", aliases: ["健哥"], role: "主角", description: "" }],
            relationships: [{ from: "阿健", to: "阿琳", type: "旧识", direction: "bilateral", strength: 3, note: "", event: "" }],
            beats: [],
        }),
        entry(1, {
            summary: "离开", mood: "", props: [], productionNotes: [],
            characters: [{ name: "阿健", role: "", description: "" }],
            relationships: [],
            beats: [],
        }),
    ]);
    const updated = parseFilmScriptDocument(`1-1 内景 咖啡馆 日
阿健：你好。
1-2 外景 街道 夜
阿健：快走吧！
`);
    const reusable = collectReusableScenePayloads(updated, previous);
    assert.deepEqual([...reusable.keys()], [0]);
    assert.equal(reusable.get(0)?.characters[0]?.aliases?.[0], "健哥");
});

test("校验未知关系端点和重复别名", () => {
    const analysis = mergeFilmSceneSemantics(document, [
        entry(0, {
            summary: "重逢", mood: "", props: [], productionNotes: [],
            characters: [{ name: "阿健", aliases: ["小琳"], role: "", description: "" }, { name: "阿琳", aliases: ["小琳"], role: "", description: "" }],
            relationships: [{ from: "阿健", to: "阿琳", type: "旧识", direction: "bilateral", strength: 3, note: "", event: "" }],
            beats: [],
        }),
    ]);
    const issues = validateFilmScriptAnalysis(analysis);
    assert.ok(issues.some((issue) => issue.message.includes("同时属于")));
});
