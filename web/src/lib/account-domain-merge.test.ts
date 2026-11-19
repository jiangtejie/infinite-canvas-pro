import assert from "node:assert/strict";
import test from "node:test";

import { mergeListedSnapshot, mergeRecordsById, parseTombstones, removedRecordIds } from "./account-domain-merge";

test("按 id 合并账号数据并保留本地独有项", () => {
    const merged = mergeRecordsById(
        [{ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }],
        [{ id: "a", updatedAt: "2026-01-02T00:00:00.000Z" }, { id: "b", updatedAt: "2026-01-01T00:00:00.000Z" }],
    );
    assert.deepEqual(merged.value.map((item) => item.id), ["a", "b"]);
    assert.equal(merged.shouldPush, true);
});

test("远端较新时采用远端且不回传", () => {
    const merged = mergeRecordsById(
        [{ id: "a", updatedAt: "2026-01-03T00:00:00.000Z" }],
        [{ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }],
    );
    assert.equal(merged.value[0].updatedAt, "2026-01-03T00:00:00.000Z");
    assert.equal(merged.shouldPush, false);
});

test("缺少 updatedAt 时回退 createdAt", () => {
    const merged = mergeRecordsById(
        [{ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }],
        [{ id: "a", createdAt: "2026-01-02T00:00:00.000Z" }],
    );
    assert.equal(merged.shouldPush, true);
});

test("删除时间晚于记录更新时间时丢弃记录并保留墓碑", () => {
    const record = { id: "a", updatedAt: "2026-01-01T00:00:00.000Z" };
    const merged = mergeListedSnapshot({ projects: [record] }, { projects: [record] }, ["projects"], {}, { a: Date.parse("2026-01-02T00:00:00.000Z") });
    assert.deepEqual(merged.value.projects, []);
    assert.equal(merged.deleted.a, Date.parse("2026-01-02T00:00:00.000Z"));
    assert.equal(merged.shouldPush, true);
});

test("陈旧本地副本遇到远端墓碑时不再复活", () => {
    const stale = { id: "a", updatedAt: "2026-01-01T00:00:00.000Z" };
    const deletedAt = Date.parse("2026-01-02T00:00:00.000Z");
    const merged = mergeListedSnapshot({ projects: [] }, { projects: [stale] }, ["projects"], { a: deletedAt }, {});
    assert.deepEqual(merged.value.projects, []);
    assert.equal(merged.deleted.a, deletedAt);
    assert.equal(merged.shouldPush, true);
});

test("删除后更新的记录复活并清掉墓碑", () => {
    const record = { id: "a", updatedAt: "2026-01-03T00:00:00.000Z" };
    const merged = mergeListedSnapshot({ projects: [] }, { projects: [record] }, ["projects"], { a: Date.parse("2026-01-02T00:00:00.000Z") }, {});
    assert.deepEqual(merged.value.projects, [record]);
    assert.equal(merged.deleted.a, undefined);
    assert.equal(merged.shouldPush, true);
});

test("墓碑按列表独立过滤，本地新删除会回传", () => {
    const deletedAt = Date.parse("2026-01-02T00:00:00.000Z");
    const merged = mergeListedSnapshot(
        { characters: [{ id: "c", updatedAt: "2026-01-01T00:00:00.000Z" }], locations: [{ id: "l", updatedAt: "2026-01-01T00:00:00.000Z" }] },
        { characters: [], locations: [{ id: "l", updatedAt: "2026-01-01T00:00:00.000Z" }] },
        ["characters", "locations"],
        {},
        { c: deletedAt },
    );
    assert.deepEqual(merged.value.characters, []);
    assert.deepEqual((merged.value.locations as Array<{ id: string }>).map((item) => item.id), ["l"]);
    assert.equal(merged.shouldPush, true);
});

test("墓碑解析过滤非法值", () => {
    assert.deepEqual(parseTombstones({ a: 1, b: "2", c: Number.NaN }), { a: 1 });
});

test("从前后状态中找出被移除的 id", () => {
    assert.deepEqual(
        removedRecordIds(
            { projects: [{ id: "a" }, { id: "b" }], characters: [{ id: "c" }] },
            { projects: [{ id: "b" }], characters: [] },
            ["projects", "characters"],
        ),
        ["a", "c"],
    );
});
