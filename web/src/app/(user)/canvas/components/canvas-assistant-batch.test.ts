import assert from "node:assert/strict";
import test from "node:test";

import { formatAssistantBatch, mergeAssistantBatch, shouldShowAssistantBatch } from "./canvas-assistant-batch";

const batch = (patch: Partial<{ total: number; succeeded: number; failed: number; rolledBack: boolean; nodeIds: string[] }> = {}) => ({ total: 1, succeeded: 1, failed: 0, rolledBack: false, nodeIds: [] as string[], ...patch });

test("single successful action stays hidden", () => {
    assert.equal(shouldShowAssistantBatch(batch()), false);
    assert.equal(shouldShowAssistantBatch(null), false);
    assert.equal(shouldShowAssistantBatch(undefined), false);
});

test("multi-action or failed batches are shown", () => {
    assert.equal(shouldShowAssistantBatch(batch({ total: 2, succeeded: 2 })), true);
    assert.equal(shouldShowAssistantBatch(batch({ failed: 1, succeeded: 0 })), true);
});

test("batch line summarises success, failure and rollback", () => {
    assert.equal(formatAssistantBatch(batch({ total: 2, succeeded: 2 })), "本批 2 个操作 · 成功 2");
    assert.equal(formatAssistantBatch(batch({ total: 3, succeeded: 2, failed: 1 })), "本批 3 个操作 · 成功 2 · 失败 1");
    assert.equal(formatAssistantBatch(batch({ total: 3, succeeded: 2, failed: 1, rolledBack: true })), "本批 3 个操作 · 成功 2 · 失败 1 · 已回滚");
});
test("batches inside one turn are merged", () => {
    assert.deepEqual(mergeAssistantBatch(null, batch({ total: 1 })), batch({ total: 1 }));
    const merged = mergeAssistantBatch(batch({ total: 2, succeeded: 2 }), batch({ total: 1, succeeded: 0, failed: 1, rolledBack: true }));
    assert.deepEqual(merged, { total: 3, succeeded: 2, failed: 1, rolledBack: true, nodeIds: [] });
});

test("node ids are merged without duplicates", () => {
    const merged = mergeAssistantBatch(batch({ nodeIds: ["a", "b"] }), batch({ nodeIds: ["b", "c"] }));
    assert.deepEqual(merged.nodeIds, ["a", "b", "c"]);
});
