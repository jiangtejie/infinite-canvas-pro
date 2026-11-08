import assert from "node:assert/strict";
import test from "node:test";

import type { FilmProject, FilmShot } from "@/lib/film/types";
import { branchTargetIndex, buildFilmBranchGraph, buildFilmBranchPaths, collectFilmBranches, findUnreachableShots } from "./film-branch";

function makeShot(id: string, patch: Partial<FilmShot> = {}): FilmShot {
    return { id, shotNo: id, shotType: "WS", cameraMovement: "固定", duration: 4, description: "", dialogue: "", audio: "", prompt: "", ...patch };
}

function makeProject(shots: FilmShot[]): FilmProject {
    return {
        id: "p1", title: "t", visualStyle: "", aspect: "16:9", stylePreset: "cinematic", stage: "storyboard", scriptText: "",
        episodes: [{ id: "e1", title: "第1集", scenes: [{ id: "sc1", name: "1-1 街道", location: "", time: "", mood: "", shots }] }],
        characters: [], locations: [], createdAt: "", updatedAt: "",
    };
}

test("收集分支点与目标镜头", () => {
    const project = makeProject([
        makeShot("01", { branch: { label: "跟上去", condition: "选择跟随", nextShotId: "02" } }),
        makeShot("02"),
    ]);
    const edges = collectFilmBranches(project);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].label, "跟上去");
    assert.equal(edges[0].targetShotNo, "02");
    assert.equal(edges[0].missing, false);
    assert.equal(edges[0].selfLoop, false);
});

test("缺失目标与跳回自己会被标记", () => {
    const project = makeProject([
        makeShot("01", { branch: { label: "未知", condition: "", nextShotId: "missing" } }),
        makeShot("02", { branch: { label: "跳回", condition: "", nextShotId: "02" } }),
    ]);
    const edges = collectFilmBranches(project);
    assert.equal(edges.find((edge) => edge.shotId === "01")?.missing, true);
    assert.equal(edges.find((edge) => edge.shotId === "02")?.selfLoop, true);
});

test("多个分支选项会展开多条结局路径并标记不可达镜头", () => {
    const project = makeProject([
        makeShot("01", { branches: [
            { label: "跟上去", condition: "选择跟随", nextShotId: "03" },
            { label: "留下", condition: "选择留下", nextShotId: "04" },
        ] }),
        makeShot("02"),
        makeShot("03"),
        makeShot("04"),
    ]);
    const edges = collectFilmBranches(project);
    assert.equal(edges.length, 2);
    assert.deepEqual(edges.map((edge) => edge.label), ["跟上去", "留下"]);
    const paths = buildFilmBranchPaths(project);
    assert.equal(paths.length, 2);
    assert.deepEqual(paths.map((path) => path.shots.map((shot) => shot.shotNo)), [["01", "03", "04"], ["01", "04"]]);
    assert.ok(paths[0].label.includes("跟上去"));
    const unreachable = findUnreachableShots(project);
    assert.deepEqual(unreachable.map((shot) => shot.shotNo), ["02"]);
});

test("分支图包含线性边与分支边，并标记不可达节点", () => {
    const project = makeProject([
        makeShot("01", { branches: [{ label: "跟上去", condition: "选择跟随", nextShotId: "03" }] }),
        makeShot("02"),
        makeShot("03"),
    ]);
    const graph = buildFilmBranchGraph(project);
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.filter((edge) => edge.kind === "linear").length, 2);
    assert.equal(graph.edges.filter((edge) => edge.kind === "branch").length, 1);
    assert.equal(graph.edges.find((edge) => edge.kind === "branch")?.label, "跟上去");
    assert.equal(graph.nodes.find((node) => node.shotNo === "02")?.unreachable, true);
});

test("全是条件分支时，条件不满足会保留线性路径且不误标不可达", () => {
    const project = makeProject([
        makeShot("01", { branches: [{ label: "跟上去", condition: "", nextShotId: "03", conditions: [{ variableId: "v1", operator: "truthy" }] }] }),
        makeShot("02"),
        makeShot("03"),
    ]);
    const paths = buildFilmBranchPaths(project);
    assert.equal(paths.length, 2);
    assert.deepEqual(paths.map((path) => path.shots.map((shot) => shot.shotNo)), [["01", "03"], ["01", "02", "03"]]);
    assert.equal(paths[1].shots[1].viaBranch, "默认");
    assert.deepEqual(findUnreachableShots(project), []);
});

test("没有分支时返回一条线性路径", () => {
    const project = makeProject([makeShot("01"), makeShot("02")]);
    const paths = buildFilmBranchPaths(project);
    assert.equal(paths.length, 1);
    assert.deepEqual(paths[0].shots.map((shot) => shot.shotNo), ["01", "02"]);
    assert.deepEqual(findUnreachableShots(project), []);
});

test("分支目标解析为播放索引", () => {
    const shots = [makeShot("01"), makeShot("02"), makeShot("03")].map((shot) => ({ shot }));
    assert.equal(branchTargetIndex(shots, "03"), 2);
    assert.equal(branchTargetIndex(shots, "missing"), -1);
    assert.equal(branchTargetIndex(shots, undefined), -1);
});
