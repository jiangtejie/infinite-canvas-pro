import assert from "node:assert/strict";
import test from "node:test";

import type { FilmProject, FilmShot } from "@/lib/film/types";
import { buildFilmAnimatic, formatAnimaticDuration } from "./film-animatic";

function makeShot(id: string, patch: Partial<FilmShot> = {}): FilmShot {
    return { id, shotNo: id, shotType: "WS", cameraMovement: "固定", duration: 4, description: "画面", dialogue: "", audio: "", prompt: "电影感", ...patch };
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

test("时间线按镜头时长累加，并记录场时长", () => {
    const animatic = buildFilmAnimatic(makeProject([makeShot("01", { duration: 4 }), makeShot("02", { duration: 6 })]));
    assert.equal(animatic.totalDuration, 10);
    assert.equal(animatic.scenes.length, 1);
    assert.equal(animatic.scenes[0].duration, 10);
    assert.equal(animatic.shots[1].start, 4);
    assert.equal(animatic.shots.length, 2);
});

test("目标时长偏差会给出提醒或严重问题", () => {
    const animatic = buildFilmAnimatic(makeProject([makeShot("01", { duration: 4 })], { targetDuration: 10 }));
    assert.ok(animatic.issues.some((issue) => issue.source === "duration" && issue.id === "target-duration"));
});

test("单镜头成场、缺少建立镜头、重复景别会被标出", () => {
    const animatic = buildFilmAnimatic(makeProject([
        makeShot("01", { shotType: "CU", cameraMovement: "固定" }),
        makeShot("02", { shotType: "CU", cameraMovement: "固定" }),
    ]));
    assert.ok(animatic.issues.some((issue) => issue.source === "coverage"));
    assert.ok(animatic.issues.some((issue) => issue.source === "pacing"));
});

test("场记未通过会进入预演问题", () => {
    const animatic = buildFilmAnimatic(makeProject([makeShot("01", { continuityCheck: "不通过：道具位置冲突" })]));
    const issue = animatic.issues.find((item) => item.source === "continuity");
    assert.ok(issue);
    assert.equal(issue?.shotId, "01");
});

test("选择的导演风格问题会合并进预演问题", () => {
    const animatic = buildFilmAnimatic(makeProject([makeShot("01", { shotType: "CU", prompt: "普通画面" })], { directorStyleId: "oriental-grand" }));
    assert.ok(animatic.styleReport.style);
    assert.ok(animatic.issues.some((issue) => issue.source === "style"));
});

test("互动分支目标缺失或跳回自己会提示", () => {
    const animatic = buildFilmAnimatic(makeProject([
        makeShot("01", { branch: { label: "跟上去", condition: "选择跟随", nextShotId: "missing" } }),
        makeShot("02", { branch: { label: "跳回", condition: "", nextShotId: "02" } }),
    ]));
    assert.ok(animatic.issues.some((issue) => issue.source === "branch" && issue.id === "branch-missing-01"));
    assert.ok(animatic.issues.some((issue) => issue.source === "branch" && issue.id === "branch-loop-02"));
});

test("空项目返回空时间线与错误提示", () => {
    const animatic = buildFilmAnimatic(makeProject([]));
    assert.equal(animatic.shots.length, 0);
    assert.equal(animatic.totalDuration, 0);
    assert.ok(animatic.issues.some((issue) => issue.id === "empty"));
});

test("时长格式化", () => {
    assert.equal(formatAnimaticDuration(8), "8s");
    assert.equal(formatAnimaticDuration(65), "1:05");
});
