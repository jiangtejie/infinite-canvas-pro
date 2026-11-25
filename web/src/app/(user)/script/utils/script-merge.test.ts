import assert from "node:assert/strict";
import test from "node:test";

import { fixtureDocument } from "@/test/script-fixtures";

import type { ScriptHeader, ScriptProjectDocument } from "../types";
import { createSyncBaseline, mergeScriptDocuments } from "./script-merge";

function scene(document: ScriptProjectDocument, id: string) {
    return document.episodes.flatMap((episode) => episode.scenes).find((item) => item.id === id)!;
}

test("不同场次修改合并，同场冲突默认保留远端且可选择本地", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes[0].content = "本地改第一场";
    remote.episodes[0].scenes[1].content = "远端改第二场";
    const baseline = createSyncBaseline(base, 1);

    let result = mergeScriptDocuments(baseline, local, remote);
    assert.equal(result.conflicts.length, 0);
    assert.equal(scene(result.document, "scene-1").content, "本地改第一场");
    assert.equal(scene(result.document, "scene-2").content, "远端改第二场");

    remote.episodes[0].scenes[0].content = "远端也改第一场";
    result = mergeScriptDocuments(baseline, local, remote);
    assert.deepEqual(result.conflicts.map((item) => [item.scope, item.id]), [["scene", "scene-1"]]);
    assert.equal(scene(result.document, "scene-1").content, "远端也改第一场");

    result = mergeScriptDocuments(baseline, local, remote, [{ scope: "scene", id: "scene-1", choice: "local" }]);
    assert.deepEqual(result.conflicts, []);
    assert.equal(scene(result.document, "scene-1").content, "本地改第一场");
});

test("相同场次内容忽略 revision 差异并取较大 revision", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes[0].content = "相同修改";
    local.episodes[0].scenes[0].revision = 2;
    remote.episodes[0].scenes[0].content = "相同修改";
    remote.episodes[0].scenes[0].revision = 3;

    const result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts, []);
    assert.equal(scene(result.document, "scene-1").revision, 3);
});

test("删除与修改冲突返回 null，本地选择可恢复场次", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes[0].content = "本地修改";
    remote.episodes[0].scenes = remote.episodes[0].scenes.filter((item) => item.id !== "scene-1");
    remote.episodes[0].scenes[0].no = 1;
    const baseline = createSyncBaseline(base, 1);

    const result = mergeScriptDocuments(baseline, local, remote);
    assert.equal(result.conflicts[0].remote, null);
    assert.equal(scene(result.document, "scene-1"), undefined);

    const resolved = mergeScriptDocuments(baseline, local, remote, [{ scope: "scene", id: "scene-1", choice: "local" }]);
    assert.equal(scene(resolved.document, "scene-1")?.content, "本地修改");
});

test("一端未修改时接受另一端删除，并发新增场次仍合并但产生 header 冲突", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes = local.episodes[0].scenes.filter((item) => item.id !== "scene-2");

    let result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts, []);
    assert.equal(scene(result.document, "scene-2"), undefined);

    local.episodes[1].scenes.push({ ...scene(base, "scene-3"), id: "scene-local-new", no: 2, content: "本地新增" });
    remote.episodes[1].scenes.push({ ...scene(base, "scene-3"), id: "scene-remote-new", no: 2, content: "远端新增" });
    result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts.map((item) => [item.scope, item.id]), [["header", undefined]]);
    assert.equal(scene(result.document, "scene-remote-new").content, "远端新增");
    assert.equal(scene(result.document, "scene-local-new").content, "本地新增");
});

test("header 单侧修改直接接受，双侧冲突默认本地且可选择远端", () => {
    const base = fixtureDocument();
    let local = structuredClone(base);
    let remote = structuredClone(base);
    local.title = "本地标题";
    let result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.document.title, "本地标题");

    local = structuredClone(base);
    remote.episodes[0].title = "远端集名";
    result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.document.episodes[0].title, "远端集名");

    local.title = "本地标题";
    result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].scope, "header");
    assert.equal(result.document.title, "本地标题");
    assert.equal(result.document.episodes[0].title, "照片");

    result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote, [{ scope: "header", choice: "remote" }]);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.document.title, "测试剧本");
    assert.equal(result.document.episodes[0].title, "远端集名");
});

test("resolution 只作用于本次重新计算的对应冲突", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.episodes[0].scenes[0].content = "本地第一场";
    remote.episodes[0].scenes[0].content = "远端第一场";

    const result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote, [
        { scope: "scene", id: "scene-2", choice: "local" },
    ]);
    assert.deepEqual(result.conflicts.map((item) => [item.scope, item.id]), [["scene", "scene-1"]]);
    assert.equal(scene(result.document, "scene-1").content, "远端第一场");
});

test("未被选中 header 引用的已合并场次按原所属剧集挂回", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.title = "本地标题";
    local.episodes[0].scenes = local.episodes[0].scenes.filter((item) => item.id !== "scene-1");
    remote.title = "远端标题";
    remote.episodes[0].scenes[0].content = "远端修改第一场";
    remote.episodes = [remote.episodes[0]];
    remote.episodes[0].scenes.push({ ...scene(base, "scene-3"), id: "orphan-scene", no: 3, content: "孤儿场次" });
    const baseline = createSyncBaseline(base, 1);

    const result = mergeScriptDocuments(baseline, local, remote, [{ scope: "header", choice: "local" }]);
    assert.equal(scene(result.document, "scene-1")?.content, "远端修改第一场");
    assert.equal(result.document.episodes.find((episode) => episode.scenes.some((item) => item.id === "scene-1"))?.id, "episode-1");
    assert.equal(scene(result.document, "orphan-scene").content, "孤儿场次");
});

test("合并保留远端身份与时间且不修改输入文档", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.title = "本地标题";
    remote.updatedAt = "2026-11-26T00:00:00.000Z";
    const before = structuredClone({ base, local, remote });

    const result = mergeScriptDocuments(createSyncBaseline(base, 7), local, remote);
    assert.equal(result.document.id, remote.id);
    assert.equal(result.document.createdAt, remote.createdAt);
    assert.equal(result.document.updatedAt, remote.updatedAt);
    assert.deepEqual({ base, local, remote }, before);
});

test("基线记录场次归属，header 不包含场次正文", () => {
    const document = fixtureDocument();
    const baseline = createSyncBaseline(document, 4);
    assert.equal(baseline.revision, 4);
    assert.equal(baseline.scenes["scene-1"].episodeId, "episode-1");
    assert.equal(baseline.scenes["scene-3"].episodeId, "episode-2");
    assert.equal(baseline.scenes["scene-1"].hash.length, 8);

    const local = structuredClone(document);
    const remote = structuredClone(document);
    local.episodes[0].scenes[0].content = "仅正文变化";
    remote.episodes[0].title = "仅剧集外壳变化";
    const result = mergeScriptDocuments(baseline, local, remote);
    assert.deepEqual(result.conflicts, []);
    assert.equal(scene(result.document, "scene-1").content, "仅正文变化");
    assert.equal(result.document.episodes[0].title, "仅剧集外壳变化");
});

test("header 冲突对象只包含固定 header 结构", () => {
    const base = fixtureDocument();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.title = "本地";
    remote.title = "远端";
    const result = mergeScriptDocuments(createSyncBaseline(base, 1), local, remote);
    const header = result.conflicts[0].local as ScriptHeader;
    assert.deepEqual(Object.keys(header).sort(), [
        "actOne", "actThree", "actTwo", "characters", "episodes", "format", "genre",
        "lockedVersionHash", "lockedVersionId", "logline", "publications", "synopsis", "theme", "title",
    ].sort());
    assert.deepEqual(Object.keys(header.episodes[0]).sort(), ["id", "lockedVersionHash", "lockedVersionId", "no", "sceneIds", "title"].sort());
});
