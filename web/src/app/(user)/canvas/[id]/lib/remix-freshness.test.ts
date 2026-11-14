import assert from "node:assert/strict";
import test from "node:test";

import { canReuseRemixFreshness } from "./remix-freshness";

test("freshness cache only reuses the exact approval key", () => {
    const cache = new Map([["run-1", "key-a"]]);
    assert.equal(canReuseRemixFreshness(cache, "run-1", "key-a"), true);
    assert.equal(canReuseRemixFreshness(cache, "run-1", "key-b"), false);
    assert.equal(canReuseRemixFreshness(cache, "run-2", "key-a"), false);
    assert.equal(canReuseRemixFreshness(cache, "run-2", ""), false);
});
