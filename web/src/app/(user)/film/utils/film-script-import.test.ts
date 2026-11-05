import assert from "node:assert/strict";
import test from "node:test";

import { filmScriptDocumentToEpisodes, parseFilmScriptDocument, scriptTextFromDocxXml, scriptTextHash } from "./film-script-import";

test("解析中文剧本的集、场、对白和出场角色", () => {
    const doc = parseFilmScriptDocument(`第1集
1-1 内景 咖啡馆 日
阿健推门进来，雨水顺着衣角滴落。
阿健：这么晚还开着？
老板娘（抬头）：等你呢。
她递过一杯热咖啡。

1-2 外景 街道 夜
阿健走出咖啡馆，远处警灯闪烁。
`);
    assert.equal(doc.episodes.length, 1);
    assert.equal(doc.episodes[0].scenes.length, 2);
    const first = doc.episodes[0].scenes[0];
    assert.equal(first.interiorExterior, "内景");
    assert.equal(first.location, "咖啡馆");
    assert.equal(first.timeOfDay, "日");
    assert.deepEqual(first.characters, ["阿健", "老板娘"]);
    assert.equal(first.blocks.filter((block) => block.type === "dialogue").length, 2);
    assert.equal(doc.episodes[0].scenes[1].timeOfDay, "夜");
    assert.equal(doc.parserVersion, "1.0.0");
    assert.ok(doc.scriptHash.length >= 8);
});

test("没有场次标题时自动生成场景", () => {
    const doc = parseFilmScriptDocument("阿健走进房间。\n阿健：有人吗？");
    assert.equal(doc.episodes.length, 1);
    assert.equal(doc.episodes[0].scenes.length, 1);
    assert.equal(doc.episodes[0].scenes[0].blocks.length, 2);
});

test("英文场次标题与时间归一", () => {
    const doc = parseFilmScriptDocument("INT. CAFE - NIGHT\nRain drips from his coat.\nARTHUR：Still open?", "plain");
    const scene = doc.episodes[0].scenes[0];
    assert.equal(scene.interiorExterior, "内景");
    assert.equal(scene.location, "CAFE");
    assert.equal(scene.timeOfDay, "夜");
});

test("规则结果转成剧集/场景/分镜", () => {
    const doc = parseFilmScriptDocument(`1-1 内景 咖啡馆 日
阿健推开门。
阿健：这么晚还开着？
她递过咖啡。
`);
    const episodes = filmScriptDocumentToEpisodes(doc);
    const scene = episodes[0].scenes[0];
    assert.equal(scene.name, "1-1 内景 咖啡馆 日");
    assert.equal(scene.time, "日");
    assert.equal(scene.shots.length, 2);
    assert.match(scene.shots[0].dialogue, /阿健/);
    assert.equal(scene.shots[1].description, "她递过咖啡。");
});

test("docx 正文 XML 提取段落", () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>第1集</w:t></w:r></w:p><w:p><w:r><w:t>1-1 内景 咖啡馆 日</w:t></w:r></w:p></w:body></w:document>';
    assert.equal(scriptTextFromDocxXml(xml), "第1集\n1-1 内景 咖啡馆 日");
});

test("hash 对相同文本稳定", () => {
    assert.equal(scriptTextHash("第一场\n阿健：你好"), scriptTextHash("第一场\r\n阿健：你好"));
});
