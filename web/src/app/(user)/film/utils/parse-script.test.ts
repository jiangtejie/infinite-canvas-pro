import assert from "node:assert/strict";
import test from "node:test";

import { countFilmScenes, flattenFilmShots, parseScript } from "./parse-script";

test("解析集、场与镜头", () => {
    const episodes = parseScript([
        "第1集：手办血案",
        "1-1 乡村公路/大巴车",
        "01 MS 一辆破旧的大巴车在山路上剧烈颠簸。",
        "02 CU 沈星晴说话...",
        "1-2 中学操场",
        "03 WS 操场上一个人在练习投篮。",
    ].join("\n"));
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].title, "手办血案");
    assert.equal(episodes[0].scenes.length, 2);
    assert.equal(episodes[0].scenes[0].name, "乡村公路/大巴车");
    assert.equal(flattenFilmShots(episodes).length, 3);
    assert.equal(countFilmScenes(episodes), 2);
    assert.equal(episodes[0].scenes[0].shots[0].shotType, "MS");
    assert.match(episodes[0].scenes[0].shots[0].shotNo, /^1-1-01$/);
});

test("没有集和场标题时回落到默认结构", () => {
    const episodes = parseScript("一个人走进房间。\n窗外下着雨。");
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].scenes.length, 1);
    assert.equal(episodes[0].scenes[0].shots.length, 2);
});

test("解析角色台词", () => {
    const episodes = parseScript("沈星晴：我们走吧。");
    assert.equal(episodes[0].scenes[0].shots[0].dialogue, "沈星晴：我们走吧。");
});

test("空剧本返回空结构", () => {
    assert.deepEqual(parseScript("   "), []);
});
