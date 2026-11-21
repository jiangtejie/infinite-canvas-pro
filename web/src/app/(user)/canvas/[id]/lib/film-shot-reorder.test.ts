import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasConnection } from "../../types";
import { moveFilmShot, reorderFilmShotSequence } from "./film-shot-reorder";

test("moves a shot before or after a target", () => {
    assert.deepEqual(moveFilmShot(["a", "b", "c", "d"], "a", "c", true), ["b", "c", "a", "d"]);
    assert.deepEqual(moveFilmShot(["a", "b", "c", "d"], "d", "a", false), ["d", "a", "b", "c"]);
    assert.deepEqual(moveFilmShot(["a", "b", "c"], "b", "c", false), ["a", "b", "c"]);
    assert.equal(moveFilmShot(["a", "b"], "a", "a", true), null);
    assert.equal(moveFilmShot(["a", "b"], "a", "missing", true), null);
});

test("rebuilds the sequence chain and preserves other edges", () => {
    const connections: CanvasConnection[] = [
        { id: "a->b", fromNodeId: "a", toNodeId: "b", kind: "sequence" },
        { id: "b->c", fromNodeId: "b", toNodeId: "c", kind: "sequence" },
        { id: "c->x", fromNodeId: "c", toNodeId: "x", kind: "sequence" },
        { id: "scene->a", fromNodeId: "scene", toNodeId: "a", kind: "composition" },
    ];
    const next = reorderFilmShotSequence(["c", "a", "b"], connections);
    assert.deepEqual(
        next.map((edge) => `${edge.fromNodeId}->${edge.toNodeId}:${edge.kind}`).sort(),
        ["a->b:sequence", "c->a:sequence", "c->x:sequence", "scene->a:composition"],
    );
});

test("single shot adds no chain and keeps cross-scene edges", () => {
    const connections: CanvasConnection[] = [
        { id: "a->b", fromNodeId: "a", toNodeId: "b", kind: "sequence" },
        { id: "c->a", fromNodeId: "c", toNodeId: "a", kind: "sequence" },
    ];
    assert.deepEqual(reorderFilmShotSequence(["a"], connections), connections);
});
