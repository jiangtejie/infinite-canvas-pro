import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { nextAgentNodeCenter } from "./canvas-agent-layout";

const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "n1",
    type: CanvasNodeType.Image,
    title: "节点",
    position: { x: 0, y: 0 },
    width: 420,
    height: 236,
    ...patch,
});

test("agent node center falls back to canvas center on an empty canvas", () => {
    assert.deepEqual(nextAgentNodeCenter({ nodes: [], type: CanvasNodeType.Image, canvasCenter: { x: 100, y: 80 } }), { x: 100, y: 80 });
});

test("agent node center is placed to the right of the direct source node", () => {
    const center = nextAgentNodeCenter({ nodes: [node()], type: CanvasNodeType.Image, sourceNodes: [node()], canvasCenter: { x: 0, y: 0 } });
    assert.equal(center.x, 420 + 96 + 210);
    assert.equal(center.y, 118);
});

test("agent node center skips colliding slots", () => {
    const blocker = node({ id: "n2", position: { x: 516, y: 0 } });
    const center = nextAgentNodeCenter({ nodes: [node(), blocker], type: CanvasNodeType.Image, sourceNodes: [node()], canvasCenter: { x: 0, y: 0 } });
    assert.equal(center.x, 420 + 96 + 210 + 492);
    assert.equal(center.y, 118);
});

test("agent node center ignores groups, config nodes and grouped nodes when picking a fallback source", () => {
    const nodes = [
        node({ id: "g1", type: CanvasNodeType.Group, position: { x: 2000, y: 0 }, width: 760, height: 480 }),
        node({ id: "c1", type: CanvasNodeType.Config, position: { x: 3000, y: 0 }, width: 440, height: 240 }),
        node({ id: "s1", type: CanvasNodeType.Text, position: { x: 0, y: 0 }, width: 340, height: 240 }),
    ];
    const center = nextAgentNodeCenter({ nodes, type: CanvasNodeType.Text, canvasCenter: { x: 0, y: 0 } });
    assert.equal(center.x, 0 + 340 + 96 + 170);
    assert.equal(center.y, 120);
});

test("agent node center honors a size override", () => {
    const center = nextAgentNodeCenter({ nodes: [], type: CanvasNodeType.Text, canvasCenter: { x: 0, y: 0 }, sizeOverride: { width: 550, height: 600 } });
    assert.deepEqual(center, { x: 0, y: 0 });
    const offset = nextAgentNodeCenter({ nodes: [node({ width: 550, height: 600 })], type: CanvasNodeType.Text, sourceNodes: [node({ width: 550, height: 600 })], canvasCenter: { x: 0, y: 0 }, sizeOverride: { width: 550, height: 600 } });
    assert.equal(offset.x, 550 + 96 + 275);
    assert.equal(offset.y, 300);
});
