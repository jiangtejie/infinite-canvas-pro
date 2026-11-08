import assert from "node:assert/strict";
import test from "node:test";

import type { FilmProject, FilmShot } from "@/lib/film/types";
import { applyFilmBranchEffects, collectFilmVariableUsage, evaluateFilmBranchConditions, findFilmVariableIssues, initialFilmVariables } from "./film-interactive";

function makeProject(shots: FilmShot[], variables: FilmProject["interactiveVariables"] = []): FilmProject {
    return {
        id: "p1", title: "t", visualStyle: "", aspect: "16:9", stylePreset: "cinematic", stage: "storyboard", scriptText: "",
        episodes: [{ id: "e1", title: "第1集", scenes: [{ id: "sc1", name: "1-1 街道", location: "", time: "", mood: "", shots }] }],
        characters: [], locations: [], interactiveVariables: variables, createdAt: "", updatedAt: "",
    };
}

function shot(id: string, branch?: FilmShot["branch"]): FilmShot {
    return { id, shotNo: id, shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "", branch };
}

const variables = [
    { id: "v-affection", name: "好感", type: "number" as const, initialValue: "1" },
    { id: "v-trust", name: "信任", type: "boolean" as const, initialValue: "false" },
];

test("初始化变量取初始值", () => {
    assert.deepEqual(initialFilmVariables(makeProject([], variables)), { "v-affection": "1", "v-trust": "false" });
});

test("条件求值支持比较、真假与 all/any", () => {
    const values = { "v-affection": "4", "v-trust": "true" };
    assert.equal(evaluateFilmBranchConditions({ label: "a", condition: "", conditions: [{ variableId: "v-affection", operator: "gt", value: "3" }] }, values), true);
    assert.equal(evaluateFilmBranchConditions({ label: "a", condition: "", conditions: [{ variableId: "v-affection", operator: "lt", value: "3" }] }, values), false);
    assert.equal(evaluateFilmBranchConditions({ label: "a", condition: "", conditions: [{ variableId: "v-trust", operator: "truthy" }] }, values), true);
    assert.equal(evaluateFilmBranchConditions({ label: "a", condition: "", conditions: [{ variableId: "v-affection", operator: "gt", value: "3" }, { variableId: "v-trust", operator: "falsy" }], conditionLogic: "all" }, values), false);
    assert.equal(evaluateFilmBranchConditions({ label: "a", condition: "", conditions: [{ variableId: "v-affection", operator: "gt", value: "3" }, { variableId: "v-trust", operator: "falsy" }], conditionLogic: "any" }, values), true);
});

test("没有条件的分支总是显示", () => {
    assert.equal(evaluateFilmBranchConditions({ label: "a", condition: "" }, {}), true);
});

test("选择效果支持设为与数值累加", () => {
    const next = applyFilmBranchEffects({ label: "a", condition: "", effects: [{ variableId: "v-affection", operation: "add", value: "2" }, { variableId: "v-trust", operation: "set", value: "true" }] }, { "v-affection": "1", "v-trust": "false" });
    assert.deepEqual(next, { "v-affection": "3", "v-trust": "true" });
});

test("变量引用缺失或类型不匹配会报问题", () => {
    const project = makeProject([
        shot("01", { label: "a", condition: "", conditions: [{ variableId: "missing", operator: "eq", value: "1" }] }),
        shot("02", { label: "b", condition: "", conditions: [{ variableId: "v-trust", operator: "gt", value: "1" }] }),
        shot("03", { label: "c", condition: "", effects: [{ variableId: "v-trust", operation: "add", value: "1" }] }),
    ], variables);
    const issues = findFilmVariableIssues(project);
    assert.ok(issues.some((issue) => issue.message.includes("不存在的变量")));
    assert.ok(issues.some((issue) => issue.message.includes("数值比较")));
    assert.ok(issues.some((issue) => issue.message.includes("+值")));
});

test("统计变量被哪些分支引用", () => {
    const project = makeProject([
        shot("01", {
            label: "a", condition: "",
            conditions: [{ variableId: "v-affection", operator: "gte", value: "2" }],
            effects: [{ variableId: "v-trust", operation: "set", value: "true" }],
        }),
        shot("02", { label: "b", condition: "", conditions: [{ variableId: "v-affection", operator: "lt", value: "5" }] }),
    ], variables);
    const usage = collectFilmVariableUsage(project);
    const affection = usage.find((item) => item.variable.id === "v-affection");
    assert.equal(affection?.conditionCount, 2);
    assert.equal(affection?.effectCount, 0);
    assert.deepEqual(affection?.shots.map((shot) => shot.shotNo), ["01", "02"]);
    const trust = usage.find((item) => item.variable.id === "v-trust");
    assert.equal(trust?.effectCount, 1);
});

test("合法引用没有变量问题", () => {
    const project = makeProject([
        shot("01", { label: "a", condition: "", conditions: [{ variableId: "v-affection", operator: "gte", value: "2" }], effects: [{ variableId: "v-trust", operation: "set", value: "true" }] }),
    ], variables);
    assert.deepEqual(findFilmVariableIssues(project), []);
});
