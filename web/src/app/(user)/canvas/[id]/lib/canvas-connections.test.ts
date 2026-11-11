import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { getConnectionTargetAnchor, normalizeConnection } from "./canvas-connections";

const node = (id: string, type: CanvasNodeType, patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: {},
    ...patch,
});

const nodes = [
    node("image", CanvasNodeType.Image),
    node("director", CanvasNodeType.Director),
    node("config", CanvasNodeType.Config),
    node("group", CanvasNodeType.Group),
    node("text", CanvasNodeType.Text),
    node("publish", CanvasNodeType.Publish),
];

test("connection anchor follows the handle side and vertical center", () => {
    const image = node("image", CanvasNodeType.Image, { position: { x: 100, y: 100 } });
    assert.deepEqual(getConnectionTargetAnchor(image, { nodeId: "image", handleType: "source" }), { x: 100, y: 150 });
    assert.deepEqual(getConnectionTargetAnchor(image, { nodeId: "image", handleType: "target" }), { x: 300, y: 150 });
});

test("connection normalization rejects invalid endpoints", () => {
    assert.equal(normalizeConnection("missing", "image", nodes, "source"), null);
    assert.equal(normalizeConnection("image", "image", nodes, "source"), null);
    assert.equal(normalizeConnection("group", "image", nodes, "source"), null);
    assert.equal(normalizeConnection("text", "group", nodes, "source"), null);
});

test("director connections only accept images and respect the handle side", () => {
    assert.deepEqual(normalizeConnection("image", "director", nodes, "source"), { fromNodeId: "image", toNodeId: "director" });
    assert.deepEqual(normalizeConnection("image", "director", nodes, "target"), { fromNodeId: "director", toNodeId: "image" });
    assert.deepEqual(normalizeConnection("director", "image", nodes, "source"), { fromNodeId: "director", toNodeId: "image" });
    assert.deepEqual(normalizeConnection("director", "image", nodes, "target"), { fromNodeId: "image", toNodeId: "director" });
    assert.equal(normalizeConnection("text", "director", nodes, "source"), null);
});

test("publish connections only accept text/image upstream and never act as source", () => {
    assert.deepEqual(normalizeConnection("image", "publish", nodes, "source"), { fromNodeId: "image", toNodeId: "publish" });
    assert.deepEqual(normalizeConnection("publish", "text", nodes, "target"), { fromNodeId: "text", toNodeId: "publish" });
    assert.equal(normalizeConnection("publish", "image", nodes, "source"), null);
    assert.equal(normalizeConnection("publish", "text", nodes, "source"), null);
    assert.equal(normalizeConnection("image", "publish", nodes, "target"), null);
    assert.equal(normalizeConnection("director", "publish", nodes, "source"), null);
    assert.equal(normalizeConnection("publish", "group", nodes, "target"), null);
});

test("config connections choose the correct direction", () => {
    assert.equal(normalizeConnection("config", "config", nodes, "source"), null);
    assert.deepEqual(normalizeConnection("image", "config", nodes, "source"), { fromNodeId: "image", toNodeId: "config" });
    assert.deepEqual(normalizeConnection("config", "image", nodes, "source"), { fromNodeId: "config", toNodeId: "image" });
    assert.deepEqual(normalizeConnection("config", "image", nodes, "target"), { fromNodeId: "image", toNodeId: "config" });
});

test("default normalization keeps the drag direction", () => {
    assert.deepEqual(normalizeConnection("text", "image", nodes, "source"), { fromNodeId: "text", toNodeId: "image" });
    assert.deepEqual(normalizeConnection("text", "image", nodes, "target"), { fromNodeId: "text", toNodeId: "image" });
});