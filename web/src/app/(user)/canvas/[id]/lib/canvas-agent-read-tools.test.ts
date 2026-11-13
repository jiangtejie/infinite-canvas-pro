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

test("source keyword search uses the shared source text including title and normalized tags", () => {
    const source = node({ id: "src", type: CanvasNodeType.Source, title: "素材源", metadata: { sourceTitle: "租房党的幸福感家居好物", sourceText: "正文", sourceTags: ["#租房", "好物", ""] } });
    assert.deepEqual(queryAgentCanvasNodes({ nodes: [source], keyword: "租房党" }).items.map((item) => item.id), ["src"]);
    assert.deepEqual(queryAgentCanvasNodes({ nodes: [source], keyword: "#租房" }).items.map((item) => item.id), ["src"]);
    assert.deepEqual(queryAgentCanvasNodes({ nodes: [source], keyword: "好物" }).items.map((item) => item.id), ["src"]);
});

test("publish keyword search uses the shared draft text including tags", () => {
    const publish = node({ id: "pub", type: CanvasNodeType.Publish, title: "发布", metadata: { publishDraft: { title: "租房好物", body: "正文", tags: ["#租房"], imageNodeIds: [] } } });
    assert.deepEqual(queryAgentCanvasNodes({ nodes: [publish], keyword: "#租房" }).items.map((item) => item.id), ["pub"]);
    assert.deepEqual(queryAgentCanvasNodes({ nodes: [publish], keyword: "租房好物" }).items.map((item) => item.id), ["pub"]);
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
