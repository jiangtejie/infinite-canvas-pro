import assert from "node:assert/strict";
import test from "node:test";

import { parseFilmProjectBackup, serializeFilmProject } from "./film-backup";
import type { FilmProject } from "../types";

const sample: FilmProject = {
    id: "film-1",
    title: "灌篮少女",
    visualStyle: "日式 3D",
    aspect: "16:9",
    stage: "storyboard",
    scriptText: "第1集",
    episodes: [{ id: "e1", title: "第 1 集", scenes: [] }],
    characters: [],
    locations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

test("导出后可以原样解析回来", () => {
    const parsed = parseFilmProjectBackup(serializeFilmProject(sample));
    assert.deepEqual(parsed, sample);
});

test("兼容直接传入项目对象", () => {
    const parsed = parseFilmProjectBackup(JSON.stringify(sample));
    assert.equal(parsed.title, "灌篮少女");
    assert.equal(parsed.stage, "storyboard");
});

test("无效文件抛出可读错误", () => {
    assert.throws(() => parseFilmProjectBackup("{\"foo\":1}"), /不是有效的影视项目备份文件/);
});

test("缺失字段回退默认值", () => {
    const parsed = parseFilmProjectBackup(JSON.stringify({ title: "旧项目", episodes: [] }));
    assert.deepEqual(parsed.characters, []);
    assert.deepEqual(parsed.locations, []);
    assert.equal(parsed.stage, "script");
    assert.equal(parsed.aspect, "16:9");
});
