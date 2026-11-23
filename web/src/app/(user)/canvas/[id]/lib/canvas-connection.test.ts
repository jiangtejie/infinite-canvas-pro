import assert from "node:assert/strict";
import test from "node:test";

import { canvasConnection } from "./canvas-connection";

test("attaches a role-aware context edge", () => {
    const edge = canvasConnection("char-1", "shot-1", {
        kind: "context",
        data: {
            role: "character",
            source: "manual",
            stateId: "state-1",
            continuity: { emotion: "压抑", heldProps: ["录音笔"] },
        },
    });

    assert.equal(edge.id, "char-1->shot-1");
    assert.equal(edge.fromNodeId, "char-1");
    assert.equal(edge.toNodeId, "shot-1");
    assert.equal(edge.kind, "context");
    assert.equal(edge.data?.role, "character");
    assert.equal(edge.data?.stateId, "state-1");
    assert.deepEqual(edge.data?.continuity?.heldProps, ["录音笔"]);
});

test("supports each canonical graph connection kind and required role data", () => {
    const composition = canvasConnection("scene", "shot", { kind: "composition" });
    const sequence = canvasConnection("shot-1", "shot-2", { kind: "sequence" });
    const derived = canvasConnection("script", "scene", { kind: "derived", data: { source: "script-analysis" } });
    const beatContext = canvasConnection("beat", "shot", { kind: "context", data: { role: "beat", source: "ai" } });

    assert.equal(composition.kind, "composition");
    assert.equal(sequence.kind, "sequence");
    assert.equal(derived.kind, "derived");
    assert.equal(beatContext.kind, "context");
    assert.equal(beatContext.data.role, "beat");
});

test("keeps general canvas connections kindless", () => {
    const edge = canvasConnection("a", "b");

    assert.equal(edge.kind, undefined);
    assert.equal("data" in edge, false);
});
