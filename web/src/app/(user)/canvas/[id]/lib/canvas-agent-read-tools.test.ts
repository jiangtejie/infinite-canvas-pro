import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { agentNodeNeighbors, isAgentMediaNodeType, queryAgentCanvasNodes } from "./canvas-agent-read-tools";

const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "n1",
    type: CanvasNodeType.Text,
    title: "镜头一",
    position: { x: 0, y: 0 },
    width: 340,
    height: 240,
    metadata: { content: "开场画面" },
    ...patch,
});

test("query filters by id, type and keyword with pagination", () => {
    const nodes = [
        node({ id: "a" }),
        node({ id: "b", title: "角色设定", metadata: { content: "主角" } }),
        node({ id: "c", type: CanvasNodeType.Image, metadata: { content: "https://example.com/i.png", prompt: "海边落日" } }),
    ];
    assert.equal(queryAgentCanvasNodes({ nodes }).total, 3);
    assert.deepEqual(queryAgentCanvasNodes({ nodes, nodeId: "b" }).items.map((item) => item.id), ["b"]);
    assert.deepEqual(queryAgentCanvasNodes({ nodes, type: CanvasNodeType.Image }).items.map((item) => item.id), ["c"]);
    assert.deepEqual(queryAgentCanvasNodes({ nodes, keyword: "主角" }).items.map((item) => item.id), ["b"]);
    assert.deepEqual(queryAgentCanvasNodes({ nodes, keyword: "海边" }).items.map((item) => item.id), ["c"]);
    const paged = queryAgentCanvasNodes({ nodes, page: 2, pageSize: 2 });
    assert.equal(paged.page, 2);
    assert.equal(paged.pageSize, 2);
    assert.deepEqual(paged.items.map((item) => item.id), ["c"]);
});

test("query clamps page size and ignores media content for keyword search", () => {
    const nodes = [node({ id: "img", type: CanvasNodeType.Image, metadata: { content: "data:image/png;base64,abc", prompt: "" } })];
    assert.equal(queryAgentCanvasNodes({ nodes, keyword: "base64" }).total, 0);
    assert.equal(queryAgentCanvasNodes({ nodes, pageSize: 500 }).pageSize, 50);
    assert.equal(queryAgentCanvasNodes({ nodes, page: 0, pageSize: 0 }).page, 1);
});

test("neighbors only returns directly connected nodes", () => {
    const nodes = [node({ id: "a" }), node({ id: "b" }), node({ id: "c" })];
    const connections: CanvasConnection[] = [
        { id: "e1", fromNodeId: "a", toNodeId: "b" },
        { id: "e2", fromNodeId: "b", toNodeId: "c" },
    ];
    const { upstream, downstream } = agentNodeNeighbors({ nodes, connections, nodeId: "b" });
    assert.deepEqual(upstream.map((item) => item.id), ["a"]);
    assert.deepEqual(downstream.map((item) => item.id), ["c"]);
});

test("media node type matches every generated media type", () => {
    assert.equal(isAgentMediaNodeType(CanvasNodeType.Image), true);
    assert.equal(isAgentMediaNodeType(CanvasNodeType.Panorama), true);
    assert.equal(isAgentMediaNodeType(CanvasNodeType.Video), true);
    assert.equal(isAgentMediaNodeType(CanvasNodeType.Audio), true);
    assert.equal(isAgentMediaNodeType(CanvasNodeType.Text), false);
    assert.equal(isAgentMediaNodeType(CanvasNodeType.Config), false);
    assert.equal(isAgentMediaNodeType(CanvasNodeType.Group), false);
});
