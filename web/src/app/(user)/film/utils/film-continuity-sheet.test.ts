import assert from "node:assert/strict";
import test from "node:test";

import { applyFilmContinuity, applyFilmContinuityChecks, formatFilmContinuityPrompt, parseFilmContinuitySheets, previousFilmShot } from "./film-continuity-sheet";
import type { FilmContinuitySheet, FilmEpisode } from "../types";

const sheet = (shotNo: string, overrides: Partial<FilmContinuitySheet> = {}): FilmContinuitySheet => ({
    shotNo,
    version: "v1",
    prevFrameSummary: "",
    nextFrameRequirement: "",
    characterState: "",
    propState: "",
    environment: "",
    cameraParams: "",
    audioState: "",
    emotionNarrative: "",
    risks: "",
    forbidden: "",
    referenceAssets: "",
    ...overrides,
});

const episode = (): FilmEpisode => ({
    id: "e1",
    title: "第 1 集",
    scenes: [
        {
            id: "sc1",
            name: "河岸",
            location: "",
            time: "白天",
            mood: "",
            shots: [
                { id: "s1", shotNo: "01", shotType: "MS", cameraMovement: "", duration: 4, description: "钓鱼", dialogue: "", audio: "", prompt: "", status: "idle" },
                { id: "s2", shotNo: "02", shotType: "CU", cameraMovement: "", duration: 3, description: "鱼的近景", dialogue: "", audio: "", prompt: "", status: "idle" },
            ],
        },
    ],
});

test("解析带 Markdown 的场记 JSON", () => {
    const sheets = parseFilmContinuitySheets(`\`\`json
[{"shotNo":"01","version":"v1","prevFrameSummary":"无","nextFrameRequirement":"鱼在岸上","propState":"鱼被握在手中","forbidden":"鱼不能回到水里"}]
\`\`\``);
    assert.equal(sheets.length, 1);
    assert.equal(sheets[0].shotNo, "01");
    assert.equal(sheets[0].propState, "鱼被握在手中");
});

test("按镜号写回交接单", () => {
    const updated = applyFilmContinuity(episode(), [sheet("02", { propState: "鱼在岸上" })]);
    assert.equal(updated.scenes[0].shots[0].continuity, undefined);
    assert.equal(updated.scenes[0].shots[1].continuity?.propState, "鱼在岸上");
    assert.equal(updated.scenes[0].shots[1].continuityCheck, "");
});

test("提示词包含承接、道具与禁项", () => {
    const prompt = formatFilmContinuityPrompt(sheet("02", { prevFrameSummary: "上一镜鱼被钓起", propState: "鱼在岸上", forbidden: "鱼不能回到水里" }));
    assert.match(prompt, /场记交接·02/);
    assert.match(prompt, /上一镜末帧/);
    assert.match(prompt, /道具状态/);
    assert.match(prompt, /禁项/);
});

test("兼容 01 与 1 两种镜号写法", () => {
    const input = episode();
    input.scenes[0].shots[1].shotNo = "1";
    const updated = applyFilmContinuity(input, [sheet("01", { propState: "鱼在岸上" })]);
    assert.equal(updated.scenes[0].shots[0].continuity?.propState, "鱼在岸上");
  });

test("镜号完全对不上时按顺序兜底", () => {
    const updated = applyFilmContinuity(episode(), [sheet("甲", { propState: "第一镜" }), sheet("乙", { propState: "第二镜" })]);
    assert.equal(updated.scenes[0].shots[0].continuity?.propState, "第一镜");
    assert.equal(updated.scenes[0].shots[1].continuity?.propState, "第二镜");
});

test("批量校验写入镜头，不再补空壳交接单", () => {
    const updated = applyFilmContinuityChecks(episode(), { s2: "不通过：鱼回到了水里" });
    assert.equal(updated.scenes[0].shots[0].continuityCheck, undefined);
    assert.equal(updated.scenes[0].shots[1].continuity, undefined);
    assert.equal(updated.scenes[0].shots[1].continuityCheck, "不通过：鱼回到了水里");
});

test("上一镜按同集顺序查找", () => {
    const result = previousFilmShot([episode()], "s2");
    assert.equal(result?.shotNo, "01");
    assert.equal(previousFilmShot([episode()], "s1"), undefined);
});
