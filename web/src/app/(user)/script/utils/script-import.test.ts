import assert from "node:assert/strict";
import test from "node:test";

import { scriptProjectFromText } from "./script-import";

test("导入剧本生成剧集、场次、角色和正文", () => {
    const project = scriptProjectFromText(`第1集
1-1 内景 咖啡馆 日
阿健推门进来，雨水顺着衣角滴落。
阿健：这么晚还开着？
老板娘（抬头）：等你呢。
1-2 外景 街道 夜
阿健走出咖啡馆，远处警灯闪烁。
`, "导入测试");
    assert.equal(project.title, "导入测试");
    assert.equal(project.episodes.length, 1);
    assert.equal(project.episodes[0].scenes.length, 2);
    assert.equal(project.episodes[0].scenes[0].interiorExterior, "内景");
    assert.equal(project.episodes[0].scenes[0].location, "咖啡馆");
    assert.match(project.episodes[0].scenes[0].content, /阿健：这么晚还开着？/);
    assert.ok(project.characters.some((character) => character.name === "阿健"));
});

test("空文本也会生成兜底剧集和场次", () => {
    const project = scriptProjectFromText("", "空剧本");
    assert.equal(project.characters.length, 0);
    assert.equal(project.episodes[0].scenes.length, 1);
});

test("import keeps three episodes and renumbers scenes inside each episode", () => {
    const project = scriptProjectFromText(`第1集\n第1场 内景 天台 日\n正文一\n\n第2集\n第1场 外景 街道 夜\n正文二\n\n第3集\n第1场 内景 房间 晨\n正文三`, "导入剧本");
    assert.equal(project.episodes.length, 3);
    assert.deepEqual(project.episodes.map((episode) => episode.scenes.length), [1, 1, 1]);
    assert.deepEqual(project.episodes.map((episode) => episode.scenes[0].no), [1, 1, 1]);
});
