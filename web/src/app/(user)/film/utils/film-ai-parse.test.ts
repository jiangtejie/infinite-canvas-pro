import assert from "node:assert/strict";
import test from "node:test";

import { directorStyleFor } from "@/lib/film/director-styles";

import { filmAiRowsToEpisodes, mergeFilmEpisodes, parseFilmAiShotRows, splitScriptIntoChunks } from "./film-ai-parse";
import type { FilmEpisode } from "@/lib/film/types";

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
    const shot = (shotNo: string) => ({ id: `shot-${shotNo}`, shotNo, shotType: "", cameraMovement: "", duration: 5, description: "画面", dialogue: "", audio: "", prompt: "" });
    const first: FilmEpisode[] = [{ id: "e1", title: "第1集", scenes: [{ id: "s1", name: "1-1 海边", location: "", time: "", mood: "", shots: [shot("01")] }] }];
    const second: FilmEpisode[] = [{ id: "e2", title: "第1集", scenes: [{ id: "s2", name: "1-1 海边", location: "", time: "", mood: "", shots: [shot("02")] }] }];
    mergeFilmEpisodes(first, second);
    assert.equal(first.length, 1);
    assert.equal(first[0].scenes.length, 1);
    assert.equal(first[0].scenes[0].shots.length, 2);
});

test("视觉扩展字段映射与台词回退", () => {
    const episodes = filmAiRowsToEpisodes([
        { episode: "第1集", scene: "1-1 街道", shotNo: "01", description: "画面 A", sound: "环境声", dialogue: "", lens: "35mm 浅景深", composition: "三分法", lighting: "侧光", color: "冷调", transition: "硬切", coverage: "建立", videoPrompt: "缓慢推进", imagePrompt: "生图 prompt A", negativePrompt: "低饱和", performance: { objective: "留住对方", emotion: "克制", intensity: 9 }, soundDesign: { ambience: "雨声", sfx: "" } },
        { episode: "第1集", scene: "1-1 街道", shotNo: "02", description: "画面 B", sound: "环境声", dialogue: "台词 B" },
    ]);
    const shot = episodes[0].scenes[0].shots[0];
    assert.equal(shot.dialogue, "环境声");
    assert.equal(shot.prompt, "生图 prompt A");
    assert.equal(shot.negativePrompt, "低饱和");
    assert.equal(shot.performance?.objective, "留住对方");
    assert.equal(shot.performance?.intensity, 5);
    assert.equal(shot.soundDesign?.ambience, "雨声");
    assert.equal(shot.soundDesign?.music, "");
    assert.equal(shot.videoPrompt, "缓慢推进");
    assert.equal(shot.coverage, "建立");
    assert.equal(shot.composition, "三分法");
    assert.equal(shot.lighting, "侧光");
    assert.equal(shot.colorTone, "冷调");
    assert.equal(shot.lens, "35mm 浅景深");
    assert.equal(shot.transition, "硬切");
    const second = episodes[0].scenes[0].shots[1];
    assert.equal(second.dialogue, "台词 B");
    assert.equal(second.prompt, "画面 B");
});

test("可选字段空字符串不写入，空描述时 prompt 为空", () => {
    const episodes = filmAiRowsToEpisodes([{ description: "", sound: "只有声音", coverage: "", composition: "", lighting: "", color: "", lens: "", transition: "", imagePrompt: "" }]);
    const shot = episodes[0].scenes[0].shots[0];
    assert.equal(shot.prompt, "");
    assert.equal(shot.description, "");
    assert.equal(shot.dialogue, "只有声音");
    assert.equal(shot.coverage, undefined);
    assert.equal(shot.composition, undefined);
    assert.equal(shot.lighting, undefined);
    assert.equal(shot.colorTone, undefined);
    assert.equal(shot.lens, undefined);
    assert.equal(shot.transition, undefined);
});

test("传入导演风格时 prompt 追加风格后缀且已包含时不重复追加", () => {
    const style = directorStyleFor("oriental-grand");
    assert.ok(style);
    const suffix = style.prompts.imageSuffix;
    const episodes = filmAiRowsToEpisodes([
        { description: "画面 C" },
        { description: "已有画面", imagePrompt: `已有画面，${suffix}` },
    ], { directorStyle: style });
    const shots = episodes[0].scenes[0].shots;
    assert.equal(shots[0].prompt, `画面 C，${suffix}`);
    assert.equal(shots[1].prompt, `已有画面，${suffix}`);
    assert.equal(shots[1].prompt.includes(suffix) && shots[1].prompt.split(suffix).length - 1, 1);
});

test("有导演风格但无画面内容时 prompt 保持为空", () => {
    const style = directorStyleFor("oriental-grand");
    assert.ok(style);
    const episodes = filmAiRowsToEpisodes([{ sound: "环境声" }], { directorStyle: style });
    assert.equal(episodes[0].scenes[0].shots[0].prompt, "");
});
