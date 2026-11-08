import assert from "node:assert/strict";
import test from "node:test";

import type { FilmProject } from "@/lib/film/types";

import { buildFilmStructureInput, parseFilmStructurePlan, parseFilmStructureScenes, structurePlanPromptContext } from "./film-ai-structure";

function makeProject(patch: Partial<FilmProject> = {}): FilmProject {
    return {
        id: "p1",
        title: "测试项目",
        visualStyle: "",
        aspect: "16:9",
        stylePreset: "cinematic",
        stage: "script",
        scriptText: "",
        episodes: [],
        characters: [],
        locations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...patch,
    };
}

const planJson = JSON.stringify([
    {
        episode: "第1集",
        sceneNo: "2",
        sceneName: " 1-1 街道 ",
        purpose: " 建立人物处境 ",
        beats: [
            { type: "冲突", summary: "两人争执", infoPoint: "她隐瞒了真相", emotion: "紧张" },
            { type: "", summary: "沉默收尾" },
        ],
        coverage: ["建立镜头", " ", "人物反应"],
        characters: ["阿青", " "],
        estimatedDuration: 1,
    },
    {
        episode: "第1集",
        sceneName: "1-2 空场",
        beats: [],
        coverage: [],
        characters: [],
        estimatedDuration: 30,
    },
    { episode: "第1集", beats: [{ summary: "没有场名" }] },
]);

test("单场结构解析不依赖项目对象", () => {
    const scenes = parseFilmStructureScenes('[{"episode":"第2集","scene":"2-1 天台","purpose":"摊牌","beats":[{"summary":"两人摊牌"}],"estimatedDuration":30}]');
    assert.equal(scenes.length, 1);
    assert.equal(scenes[0].sceneName, "2-1 天台");
    assert.equal(scenes[0].beats[0].summary, "两人摊牌");
});

test("结构计划数组会归一化场次/beats/coverage/角色/时长", () => {
    const plan = parseFilmStructurePlan(`\`\`\`json\n${planJson}\n\`\`\``, makeProject());
    assert.equal(plan.scenes.length, 1);
    const scene = plan.scenes[0];
    assert.equal(scene.episodeTitle, "第1集");
    assert.equal(scene.sceneNo, 2);
    assert.equal(scene.sceneName, "1-1 街道");
    assert.equal(scene.purpose, "建立人物处境");
    assert.equal(scene.beats.length, 2);
    assert.equal(scene.beats[0].type, "冲突");
    assert.equal(scene.beats[0].infoPoint, "她隐瞒了真相");
    assert.equal(scene.beats[0].emotion, "紧张");
    assert.equal(scene.beats[1].type, "信息");
    assert.equal(scene.beats[1].infoPoint, undefined);
    assert.deepEqual(scene.coverage, ["建立镜头", "人物反应"]);
    assert.deepEqual(scene.characters, ["阿青"]);
    assert.equal(scene.estimatedDuration, 3);
    assert.ok(plan.createdAt.length > 0);
    assert.ok(plan.scriptHash.length >= 8);
});

test("兼容 Markdown code fence 与外层对象包数组", () => {
    const wrapped = JSON.stringify({ plan: [{ sceneName: "1-1 街道", beats: [{ summary: "开场" }] }] });
    const plan = parseFilmStructurePlan("说明文字\n" + wrapped, makeProject());
    assert.equal(plan.scenes.length, 1);
    assert.equal(plan.scenes[0].episodeTitle, "第 1 集");
    assert.equal(plan.scenes[0].sceneNo, 1);
    assert.equal(plan.scenes[0].estimatedDuration, 3);
});

test("estimatedDuration 超出范围时收敛到 3–900 秒", () => {
    const plan = parseFilmStructurePlan(JSON.stringify([{ sceneName: "1-1 A", beats: [{ summary: "a" }], estimatedDuration: 5000 }]), makeProject());
    assert.equal(plan.scenes[0].estimatedDuration, 900);
    const plan2 = parseFilmStructurePlan(JSON.stringify([{ sceneName: "1-1 B", beats: [{ summary: "b" }], estimatedDuration: "abc" }]), makeProject());
    assert.equal(plan2.scenes[0].estimatedDuration, 3);
});

test("没有 beats 的场次丢弃，空数组与坏 JSON 抛错", () => {
    const noBeats = JSON.stringify([{ sceneName: "1-1 空场", beats: [] }, { beats: [{ summary: "没有场名" }] }]);
    assert.throws(() => parseFilmStructurePlan(noBeats, makeProject()), /没有生成有效的结构计划/);
    assert.throws(() => parseFilmStructurePlan("[]", makeProject()), /没有生成有效的结构计划/);
    assert.throws(() => parseFilmStructurePlan("not json", makeProject()), /不是有效 JSON/);
});

test("scriptHash 稳定且随剧本内容变化", () => {
    const first = parseFilmStructurePlan(planJson, makeProject({ scriptText: "剧本 A" }));
    const second = parseFilmStructurePlan(planJson, makeProject({ scriptText: "剧本 A" }));
    const changed = parseFilmStructurePlan(planJson, makeProject({ scriptText: "剧本 B" }));
    assert.equal(first.scriptHash, second.scriptHash);
    assert.notEqual(first.scriptHash, changed.scriptHash);
});

test("structurePlanPromptContext 输出场名/beats/coverage，无 plan 返回空", () => {
    const plan = parseFilmStructurePlan(planJson, makeProject());
    const context = structurePlanPromptContext(plan);
    assert.ok(context.includes("1-1 街道"));
    assert.ok(context.includes("两人争执"));
    assert.ok(context.includes("建立镜头"));
    const parsed = JSON.parse(context) as Array<Record<string, unknown>>;
    assert.equal(parsed[0].duration, 3);
    assert.equal(structurePlanPromptContext(undefined), "");
    assert.equal(structurePlanPromptContext({ ...plan, scenes: [] }), "");
});

test("buildFilmStructureInput 优先场次摘要，无场次时截取剧本原文", () => {
    const withEpisodes = makeProject({
        targetDuration: 120,
        episodes: [{ id: "e1", title: "第1集", scenes: [{ id: "s1", name: "1-1 街道", location: "街道", time: "夜", mood: "紧张", shots: [{ id: "sh1", shotNo: "01", shotType: "WS", cameraMovement: "", duration: 4, description: "雨中街道", dialogue: "别走", audio: "", prompt: "" }] }] }],
    });
    const parsed = JSON.parse(buildFilmStructureInput(withEpisodes)) as Record<string, unknown>;
    assert.equal(parsed.title, "测试项目");
    assert.equal(parsed.targetDuration, 120);
    assert.ok(Array.isArray(parsed.scenes));
    assert.equal((parsed.scenes as Array<Record<string, unknown>>).length, 1);
    assert.deepEqual((parsed.scenes as Array<Record<string, unknown>>)[0].excerpts, ["雨中街道 / 别走"]);
    assert.equal(parsed.script, undefined);

    const withoutEpisodes = makeProject({ scriptText: "第一场 夜晚 街道\n阿青走上街道。" });
    const parsedScript = JSON.parse(buildFilmStructureInput(withoutEpisodes)) as Record<string, unknown>;
    assert.equal(parsedScript.scenes, undefined);
    assert.equal(parsedScript.script, "第一场 夜晚 街道\n阿青走上街道。");
});
