import assert from "node:assert/strict";
import test from "node:test";

import { filmAiRowsToEpisodes, mergeFilmEpisodes, parseFilmAiShotRows, splitScriptIntoChunks } from "./film-ai-parse";
import type { FilmEpisode } from "../types";

test("解析 AI 返回的分镜 JSON", () => {
    const rows = parseFilmAiShotRows("```json\n[{\"episode\":\"第1集\",\"scene\":\"1-1 海边\",\"shotNo\":\"01\",\"shotType\":\"大远景\",\"cameraMovement\":\"缓慢横移\",\"description\":\"海面泛起荧光绿\",\"sound\":\"海浪声\",\"duration\":5}]\n```");
    assert.equal(rows.length, 1);
    const episodes = filmAiRowsToEpisodes(rows);
    const shot = episodes[0].scenes[0].shots[0];
    assert.equal(episodes[0].title, "第1集");
    assert.equal(episodes[0].scenes[0].name, "1-1 海边");
    assert.equal(shot.shotType, "ELS");
    assert.equal(shot.cameraMovement, "缓慢横移");
    assert.equal(shot.dialogue, "海浪声");
    assert.equal(shot.duration, 5);
});

test("兼容外层对象包数组", () => {
    const rows = parseFilmAiShotRows("{\"shots\":[{\"description\":\"一个人走进房间\"}]}");
    assert.equal(rows.length, 1);
});

test("没有分镜数组时报错", () => {
    assert.throws(() => parseFilmAiShotRows("{\"foo\":1}"), /AI 没有返回分镜数组/);
});


test("长剧本按集/场标题切块", () => {
    const script = Array.from({ length: 40 }, (_, index) => `第${index + 1}场\n${"夜色下的东京湾，海面泛起荧光绿。".repeat(4)}`).join("\n");
    const chunks = splitScriptIntoChunks(script, 400);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 400));
    assert.ok(chunks.join("\n").includes("第1场"));
});

test("分块结果按集和场合并", () => {
    const shot = (shotNo: string) => ({ id: `shot-${shotNo}`, shotNo, shotType: "", cameraMovement: "", duration: 5, description: "画面", dialogue: "", audio: "", prompt: "", status: "idle" as const });
    const first: FilmEpisode[] = [{ id: "e1", title: "第1集", scenes: [{ id: "s1", name: "1-1 海边", location: "", time: "", mood: "", shots: [shot("01")] }] }];
    const second: FilmEpisode[] = [{ id: "e2", title: "第1集", scenes: [{ id: "s2", name: "1-1 海边", location: "", time: "", mood: "", shots: [shot("02")] }] }];
    mergeFilmEpisodes(first, second);
    assert.equal(first.length, 1);
    assert.equal(first[0].scenes.length, 1);
    assert.equal(first[0].scenes[0].shots.length, 2);
});
