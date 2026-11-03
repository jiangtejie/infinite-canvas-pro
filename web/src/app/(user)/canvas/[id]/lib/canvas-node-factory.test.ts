import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";

test("creates a centered image node with an explicit id", () => {
    const node = createCanvasNode(CanvasNodeType.Image, { x: 500, y: 400 }, undefined, "fixed-id");
    assert.equal(node.id, "fixed-id");
    assert.equal(node.type, CanvasNodeType.Image);
    assert.ok(Math.abs(node.position.x + node.width / 2 - 500) < 0.01);
    assert.ok(Math.abs(node.position.y + node.height / 2 - 400) < 0.01);
    assert.ok(node.width > 0 && node.height > 0);
});

test("keeps metadata overrides and uses the type spec", () => {
    const text = createCanvasNode(CanvasNodeType.Text, { x: 100, y: 100 }, { prompt: "hello" });
    assert.equal(text.type, CanvasNodeType.Text);
    assert.equal(text.metadata?.prompt, "hello");
    assert.equal(text.title.length > 0, true);
    assert.ok(text.id.startsWith("text-"));
    const config = createCanvasNode(CanvasNodeType.Config, { x: 0, y: 0 });
    assert.equal(config.type, CanvasNodeType.Config);
    assert.ok(config.width > 0 && config.height > 0);
});
