import assert from "node:assert/strict";
import test from "node:test";

import type { FilmProject, FilmShot } from "@/lib/film/types";

import { parseFilmConsistencyReview } from "./film-ai-consistency";

function makeShot(id: string, shotNo: string, patch: Partial<FilmShot> = {}): FilmShot {
    return { id, shotNo, shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "", ...patch };
}

function makeProject(): FilmProject {
    return {
        id: "p1",
        title: "测试项目",
        visualStyle: "",
        aspect: "16:9",
        stylePreset: "cinematic",
        stage: "storyboard",
        scriptText: "第1集",
        episodes: [{
            id: "e1",
            title: "第1集",
            scenes: [{ id: "sc1", name: "1-1 街道", location: "", time: "", mood: "", shots: [makeShot("sh1", "01"), makeShot("sh2", "02")] }],
        }],
        characters: [],
        locations: [],
        createdAt: "",
        updatedAt: "",
    };
}

const reviewJson = JSON.stringify({
    summary: "整体连续，个别景别跳跃",
    issues: [
        { level: "error", category: "style", message: "01 镜从全景直接跳特写", suggestion: "补一个中景过渡", shotNo: " 01 ", scene: "街道" },
        { level: "fatal", category: "misc", message: "第2集时间线冲突" },
        { level: "", message: "   " },
        { message: "缺少建立镜头", scene: "1-1 街道东侧" },
    ],
});

test("解析 JSON 对象并匹配镜头与场次", () => {
    const review = parseFilmConsistencyReview(`\`\`\`json\n${reviewJson}\n\`\`\``, makeProject());
    assert.equal(review.summary, "整体连续，个别景别跳跃");
    assert.equal(review.issues.length, 3);
    const first = review.issues[0];
    assert.equal(first.level, "error");
    assert.equal(first.category, "style");
    assert.equal(first.shotId, "sh1");
    assert.equal(first.sceneId, "sc1");
    assert.equal(first.suggestion, "补一个中景过渡");
    const second = review.issues[1];
    assert.equal(second.level, "warning");
    assert.equal(second.category, "continuity");
    assert.equal(second.shotId, undefined);
    assert.equal(second.sceneId, undefined);
    const third = review.issues[2];
    assert.equal(third.shotId, undefined);
    assert.equal(third.sceneId, "sc1");
    assert.equal(third.suggestion, undefined);
    assert.ok(review.scriptHash.length >= 8);
    assert.ok(review.reviewedAt.length > 0);
});

test("场次名支持双向 includes 模糊匹配", () => {
    const longSceneName = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "场次问题", scene: "街道" }] }), makeProject());
    assert.equal(longSceneName.issues[0].sceneId, "sc1");
    const shortSceneName = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "场次问题", scene: "1-1 街道东侧" }] }), makeProject());
    assert.equal(shortSceneName.issues[0].sceneId, "sc1");
});

test("坏 level/category 归一化，超过 12 条截断", () => {
    const issues = Array.from({ length: 15 }, (_, index) => ({ level: "bad", category: "bad", message: `问题 ${index}` }));
    const review = parseFilmConsistencyReview(JSON.stringify({ summary: "多问题", issues }), makeProject());
    assert.equal(review.issues.length, 12);
    assert.ok(review.issues.every((issue) => issue.level === "warning" && issue.category === "continuity"));
    assert.ok(review.issues.every((issue) => issue.id.length > 0));
    assert.equal(new Set(review.issues.map((issue) => issue.id)).size, 12);
});

test("无 issues 返回空数组 + summary，无效 JSON 抛错", () => {
    const empty = parseFilmConsistencyReview(JSON.stringify({ summary: "整体良好", issues: [] }), makeProject());
    assert.deepEqual(empty.issues, []);
    assert.equal(empty.summary, "整体良好");
    assert.throws(() => parseFilmConsistencyReview("没有 JSON", makeProject()), /不是有效 JSON/);
    assert.throws(() => parseFilmConsistencyReview("{bad json}", makeProject()), /不是有效 JSON/);
});

test("缺少 message 的条目丢弃，summary 缺省为 undefined", () => {
    const review = parseFilmConsistencyReview(JSON.stringify({ issues: [{ message: "  " }, { message: "有效问题" }] }), makeProject());
    assert.equal(review.issues.length, 1);
    assert.equal(review.issues[0].message, "有效问题");
    assert.equal(review.summary, undefined);
});
