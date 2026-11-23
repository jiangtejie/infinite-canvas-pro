import assert from "node:assert/strict";
import test from "node:test";

import type { FilmShot } from "@/lib/film/types";
import { checkFilmStyleScenes } from "./film-style-check";

function makeShot(id: string, patch: Partial<FilmShot> = {}): FilmShot {
    return { id, shotNo: id, shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "", characterBindings: [], propBindings: [], ...patch };
}

function scenes(shots: FilmShot[]) {
    return [{ sceneId: "sc1", sceneName: "1-1 街道", episodeTitle: "第1集", shots }];
}

test("未选择导演风格时返回满分空报告", () => {
    const report = checkFilmStyleScenes(scenes([makeShot("01")]));
    assert.equal(report.style, undefined);
    assert.equal(report.score, 100);
    assert.deepEqual(report.issues, []);
});

test("东方浓烈风格会检查覆盖、特写比例与关键词", () => {
    const shots = [
        makeShot("01", { shotType: "WS", prompt: "红金对称构图，仪式感" }),
        makeShot("02", { shotType: "CU", prompt: "红金特写" }),
    ];
    const report = checkFilmStyleScenes(scenes(shots), "oriental-grand");
    assert.equal(report.style?.id, "oriental-grand");
    assert.ok(report.score > 0 && report.score <= 100);
    assert.ok(report.issues.some((issue) => issue.ruleId === "cu-ratio"));
    assert.ok(!report.issues.some((issue) => issue.ruleId === "coverage"));
    assert.ok(report.metrics.keywordRatio > 0.9);
});

test("缺少建立镜头会产生场级问题", () => {
    const report = checkFilmStyleScenes(scenes([makeShot("01", { shotType: "CU", prompt: "红金" })]), "oriental-grand");
    assert.ok(report.issues.some((issue) => issue.ruleId === "coverage" && issue.sceneId === "sc1"));
});
