import assert from "node:assert/strict";
import test from "node:test";

import type { FilmProject, FilmShot } from "@/lib/film/types";
import { checkFilmStyle, checkShotStyle } from "./film-style-check";

function makeShot(id: string, patch: Partial<FilmShot> = {}): FilmShot {
    return { id, shotNo: id, shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "", ...patch };
}

function makeProject(shots: FilmShot[], patch: Partial<FilmProject> = {}): FilmProject {
    return {
        id: "p1",
        title: "测试项目",
        visualStyle: "",
        aspect: "16:9",
        stylePreset: "cinematic",
        stage: "storyboard",
        scriptText: "",
        episodes: [{ id: "e1", title: "第1集", scenes: [{ id: "sc1", name: "1-1 街道", location: "", time: "", mood: "", shots }] }],
        characters: [],
        locations: [],
        createdAt: "",
        updatedAt: "",
        ...patch,
    };
}

test("未选择导演风格时返回满分空报告", () => {
    const report = checkFilmStyle(makeProject([makeShot("01")]));
    assert.equal(report.style, undefined);
    assert.equal(report.score, 100);
    assert.deepEqual(report.issues, []);
});

test("东方浓烈风格会检查覆盖、特写比例与关键词", () => {
    const shots = [
        makeShot("01", { shotType: "WS", prompt: "红金对称构图，仪式感" }),
        makeShot("02", { shotType: "CU", prompt: "红金特写" }),
    ];
    const report = checkFilmStyle(makeProject(shots, { directorStyleId: "oriental-grand" }));
    assert.equal(report.style?.id, "oriental-grand");
    assert.ok(report.score > 0 && report.score <= 100);
    assert.ok(report.issues.some((issue) => issue.ruleId === "cu-ratio"));
    assert.ok(!report.issues.some((issue) => issue.ruleId === "coverage"));
    assert.ok(report.metrics.keywordRatio > 0.9);
});

test("缺少建立镜头会产生场级问题", () => {
    const report = checkFilmStyle(makeProject([makeShot("01", { shotType: "CU", prompt: "红金" })], { directorStyleId: "oriental-grand" }));
    assert.ok(report.issues.some((issue) => issue.ruleId === "coverage" && issue.sceneId === "sc1"));
});

test("镜头级风格提示会指出空 prompt 或缺少关键词", () => {
    const style = checkFilmStyle(makeProject([makeShot("01", { prompt: "" })], { directorStyleId: "oriental-grand" })).style;
    assert.ok(style);
    assert.ok(checkShotStyle(makeShot("01", { prompt: "" }), style).some((issue) => issue.id === "shot-prompt-empty"));
    assert.ok(checkShotStyle(makeShot("01", { prompt: "普通画面" }), style).some((issue) => issue.id === "shot-style-keywords"));
    assert.deepEqual(checkShotStyle(makeShot("01", { prompt: "红金对称" }), style), []);
});
