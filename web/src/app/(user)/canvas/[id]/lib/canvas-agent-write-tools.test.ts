import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { AGENT_PRIMARY_SCRIPT_NODE_SIZE, planArrangeNodes, planCreateConnection, planCreateTextNode, planUpdateNodeTitle, planUpdateTextNode } from "./canvas-agent-write-tools";

const node = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "n1",
    type: CanvasNodeType.Text,
    title: "镜头一",
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    metadata: { content: "旧正文", status: "success" },
    ...patch,
});

test("create text node appends the node and one connection per source", () => {
    const source = node({ id: "src" });
    const plan = planCreateTextNode({
        actionName: "create_text_node",
        nodes: [source],
        connections: [] as CanvasConnection[],
        center: { x: 300, y: 200 },
        title: "",
        content: "分镜脚本正文",
        sourceNodeIds: ["src"],
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.nodes.length, 2);
    assert.equal(plan.connections.length, 1);
    assert.equal(plan.connections[0].fromNodeId, "src");
    assert.equal(plan.connections[0].toNodeId, plan.node.id);
    assert.equal(plan.createdConnectionIds.length, 1);
    assert.equal(plan.node.title, "分镜脚本正文");
    assert.deepEqual(plan.node.position, { x: 300 - 170, y: 200 - 120 });
});

test("primary script node uses the fixed script size", () => {
    const plan = planCreateTextNode({
        actionName: "create_primary_script_node",
        nodes: [],
        connections: [],
        center: { x: 100, y: 100 },
        title: "主剧本",
        content: "正文",
        sourceNodeIds: [],
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.node.width, AGENT_PRIMARY_SCRIPT_NODE_SIZE.width);
    assert.equal(plan.node.height, AGENT_PRIMARY_SCRIPT_NODE_SIZE.height);
    assert.deepEqual(plan.node.position, { x: 100 - 275, y: 100 - 300 });
    assert.equal(plan.node.title, "主剧本");
});

test("create text node rejects unknown sources", () => {
    const plan = planCreateTextNode({ actionName: "create_text_node", nodes: [], connections: [], center: { x: 0, y: 0 }, title: "", content: "x", sourceNodeIds: ["missing"] });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "node_not_found");
});

test("update text node rewrites content and title", () => {
    const plan = planUpdateTextNode({ nodes: [node()], nodeId: "n1", title: "新标题", content: "新正文" });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.node.title, "新标题");
    assert.equal(plan.node.metadata?.content, "新正文");
    assert.equal(plan.node.metadata?.prompt, "新正文");
    assert.equal(plan.node.metadata?.errorDetails, undefined);
});

test("update text node rejects media nodes and unknown ids", () => {
    const invalid = planUpdateTextNode({ nodes: [node({ type: CanvasNodeType.Image })], nodeId: "n1", title: "", content: "x" });
    assert.equal(invalid.ok, false);
    if (invalid.ok) return;
    assert.equal(invalid.code, "invalid_node_type");
    const missing = planUpdateNodeTitle({ nodes: [], nodeId: "n1", title: "t" });
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.code, "node_not_found");
});

test("create connection reuses existing edges and blocks invalid pairs", () => {
    const nodes = [node({ id: "a" }), node({ id: "b" }), node({ id: "c1", type: CanvasNodeType.Config }), node({ id: "c2", type: CanvasNodeType.Config })];
    const duplicate = planCreateConnection({ nodes, connections: [{ id: "e1", fromNodeId: "a", toNodeId: "b" }], fromNodeId: "a", toNodeId: "b" });
    assert.equal(duplicate.ok, true);
    if (!duplicate.ok) return;
    assert.equal(duplicate.alreadyExists, true);
    assert.equal(duplicate.connections.length, 1);

    const created = planCreateConnection({ nodes, connections: [], fromNodeId: "a", toNodeId: "b" });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.connections.length, 1);

    const self = planCreateConnection({ nodes, connections: [], fromNodeId: "a", toNodeId: "a" });
    assert.equal(self.ok, false);
    if (self.ok) return;
    assert.equal(self.code, "self_connection");

    const config = planCreateConnection({ nodes, connections: [], fromNodeId: "c1", toNodeId: "c2" });
    assert.equal(config.ok, false);
    if (config.ok) return;
    assert.equal(config.code, "invalid_connection");
});

test("arrange nodes lays out four per row", () => {
    const nodes = ["a", "b", "c", "d", "e"].map((id) => node({ id }));
    const plan = planArrangeNodes({ nodes, nodeIds: ["a", "b", "c", "d", "e"] });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const position = (id: string) => plan.positions.find((item) => item.id === id)!.position;
    assert.deepEqual(position("a"), { x: 0, y: 0 });
    assert.deepEqual(position("d"), { x: 516, y: 0 });
    assert.deepEqual(position("e"), { x: 0, y: 122 });
    assert.equal(plan.arrangedNodeIds.length, 5);
});

test("arrange nodes moves grouped children with their group", () => {
    const group = node({ id: "g", type: CanvasNodeType.Group, width: 200, height: 100 });
    const child = node({ id: "ch", position: { x: 10, y: 10 }, metadata: { groupId: "g" } });
    const other = node({ id: "u" });
    const plan = planArrangeNodes({ nodes: [group, child, other], nodeIds: ["u", "g"] });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const position = (id: string) => plan.positions.find((item) => item.id === id)!.position;
    assert.deepEqual(position("u"), { x: 0, y: 0 });
    assert.deepEqual(position("g"), { x: 172, y: 0 });
    assert.deepEqual(position("ch"), { x: 182, y: 10 });
});

test("arrange nodes without ids only targets top-level nodes", () => {
    const plan = planArrangeNodes({ nodes: [node({ id: "a" }), node({ id: "child", metadata: { groupId: "g" } })], nodeIds: [] });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual(plan.arrangedNodeIds, ["a"]);
});
