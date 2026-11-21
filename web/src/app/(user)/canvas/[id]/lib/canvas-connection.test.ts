import assert from "node:assert/strict";
import test from "node:test";

import { canvasConnection } from "./canvas-connection";

test("attaches kind and film binding data", () => {
    const edge = canvasConnection("char-1", "shot-1", {
        kind: "binding",
        data: {
            source: "manual",
            stateId: "state-1",
            continuity: { emotion: "压抑", heldProps: ["录音笔"] },
        },
    });

    assert.equal(edge.id, "char-1->shot-1");
    assert.equal(edge.fromNodeId, "char-1");
    assert.equal(edge.toNodeId, "shot-1");
    assert.equal(edge.kind, "binding");
    assert.equal(edge.data?.stateId, "state-1");
    assert.deepEqual(edge.data?.continuity?.heldProps, ["录音笔"]);
});

test("keeps general canvas connections kindless", () => {
    const edge = canvasConnection("a", "b");

    assert.equal(edge.kind, undefined);
    assert.equal("data" in edge, false);
});
