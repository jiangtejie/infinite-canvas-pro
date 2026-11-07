import assert from "node:assert/strict";
import test from "node:test";

import type { FilmShot, FilmShotConnection, FilmShotGroup } from "@/lib/film/types";

import { addShotToFilmGroup, countFilmShotConnections, createFilmShotConnection, createFilmShotGroup, pruneFilmEdges, removeFilmShotConnection, removeFilmShotGroup, removeShotFromFilmGroup } from "./film-shot-groups";

const shot = (id: string): FilmShot => ({ id, shotNo: id, shotType: "", cameraMovement: "", duration: 5, description: "", dialogue: "", audio: "", prompt: "" });
const group = (id: string, shotIds: string[]): FilmShotGroup => ({ id, title: id, shotIds, createdAt: "2026-01-01T00:00:00.000Z" });

test("创建镜头组会去空去重并修剪标题", () => {
    const created = createFilmShotGroup("  回忆组  ", ["a", "", "a", "b"]);
    assert.equal(created.title, "回忆组");
    assert.deepEqual(created.shotIds, ["a", "b"]);
    assert.ok(created.id.length > 0);
});

test("向组内加镜头可重复调用且不变时返回原数组", () => {
    const groups = [group("g1", ["a"])];
    const added = addShotToFilmGroup(groups, "g1", "b");
    assert.deepEqual(added[0].shotIds, ["a", "b"]);
    assert.equal(addShotToFilmGroup(added, "g1", "b"), added);
    assert.deepEqual(removeShotFromFilmGroup(added, "g1", "a")[0].shotIds, ["b"]);
    assert.deepEqual(removeFilmShotGroup(added, "g1"), []);
});

test("连线拒绝自连和重复（含反向）", () => {
    const first = createFilmShotConnection([], "a", "b");
    assert.equal(first.length, 1);
    assert.equal(createFilmShotConnection(first, "a", "b"), first);
    assert.equal(createFilmShotConnection(first, "b", "a"), first);
    assert.equal(createFilmShotConnection(first, "a", "a"), first);
    const second = createFilmShotConnection(first, "b", "c");
    assert.equal(second.length, 2);
    assert.equal(removeFilmShotConnection(second, second[0].id).length, 1);
    assert.equal(countFilmShotConnections(second).get("b"), 2);
});

test("删除镜头后清理失效组引用与连线", () => {
    const groups = [group("g1", ["a", "missing"]), group("g2", ["gone"])];
    const connections: FilmShotConnection[] = [
        { id: "c1", fromShotId: "a", toShotId: "b", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "c2", fromShotId: "a", toShotId: "gone", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const pruned = pruneFilmEdges([shot("a"), shot("b")], groups, connections);
    assert.deepEqual(pruned.groups.map((item) => item.shotIds), [["a"]]);
    assert.deepEqual(pruned.connections.map((item) => item.id), ["c1"]);
    assert.equal(pruneFilmEdges([shot("a"), shot("b")], pruned.groups, pruned.connections).groups, pruned.groups);
});
