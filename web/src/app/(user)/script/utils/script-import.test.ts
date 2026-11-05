import assert from "node:assert/strict";
import test from "node:test";

import { scriptProjectFromText } from "./script-import";

test("导入剧本生成场次、角色和正文", () => {
    const project = scriptProjectFromText(`第1集
1-1 内景 咖啡馆 日
阿健推门进来，雨水顺着衣角滴落。
阿健：这么晚还开着？
老板娘（抬头）：等你呢。
1-2 外景 街道 夜
阿健走出咖啡馆，远处警灯闪烁。
`, "导入测试");
    assert.equal(project.title, "导入测试");
    assert.equal(project.scenes.length, 2);
    assert.equal(project.scenes[0].interiorExterior, "内景");
    assert.equal(project.scenes[0].location, "咖啡馆");
    assert.equal(project.scenes[0].timeOfDay, "日");
    assert.match(project.scenes[0].content, /阿健：这么晚还开着？/);
    assert.ok(project.characters.some((character) => character.name === "阿健"));
});

test("空文本也会生成兜底场次", () => {
    const project = scriptProjectFromText("", "空剧本");
    assert.equal(project.characters.length, 0);
    assert.ok(project.scenes.length >= 1);
});
