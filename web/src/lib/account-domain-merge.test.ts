import assert from "node:assert/strict";
import test from "node:test";

import { mergeRecordsById } from "./account-domain-merge";

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
