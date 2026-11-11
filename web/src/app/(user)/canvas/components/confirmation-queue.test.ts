import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmationQueue } from "./confirmation-queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("confirmations run one at a time in request order", async () => {
    const enqueue = createConfirmationQueue();
    const order: string[] = [];
    let active = 0;
    const task = (name: string) => async () => {
        active += 1;
        assert.equal(active, 1, "确认任务不能并发执行");
        await tick();
        order.push(name);
        active -= 1;
        return name;
    };
    const results = await Promise.all([enqueue(task("a")), enqueue(task("b")), enqueue(task("c"))]);
    assert.deepEqual(order, ["a", "b", "c"]);
    assert.deepEqual(results, ["a", "b", "c"]);
});

test("a rejected confirmation does not block the queue", async () => {
    const enqueue = createConfirmationQueue();
    const failed = enqueue(async () => {
        throw new Error("cancelled");
    });
    const next = enqueue(async () => "ok");
    await assert.rejects(failed, /cancelled/);
    assert.equal(await next, "ok");
});
