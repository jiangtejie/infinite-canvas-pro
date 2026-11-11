import { nanoid } from "nanoid";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";
import { NODE_STATUS_SUCCESS } from "./canvas-node-constants";

export const AGENT_PRIMARY_SCRIPT_NODE_SIZE = { width: 550, height: 600 };

export type AgentWriteFailure = { ok: false; code: string; message: string };

const missingNode = (nodeId: string): AgentWriteFailure => ({ ok: false, code: "node_not_found", message: "找不到节点 " + nodeId });

/** create_primary_script_node / create_text_node：创建文本节点并在真实来源之间补连线。 */
export function planCreateTextNode(input: {
    actionName: "create_primary_script_node" | "create_text_node";
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    center: Position;
    title: string;
    content: string;
    sourceNodeIds: string[];
}) {
    const missingNodeId = input.sourceNodeIds.find((nodeId) => !input.nodes.some((node) => node.id === nodeId));
    if (missingNodeId) return missingNode(missingNodeId);
    const size = input.actionName === "create_primary_script_node" ? AGENT_PRIMARY_SCRIPT_NODE_SIZE : undefined;
    const node = createCanvasNode(CanvasNodeType.Text, input.center, { content: input.content, prompt: input.content, status: NODE_STATUS_SUCCESS });
    if (size) {
        node.position = { x: input.center.x - size.width / 2, y: input.center.y - size.height / 2 };
        node.width = size.width;
        node.height = size.height;
    }
    node.title = input.title || input.content.slice(0, 32) || "文本";
    const created = input.sourceNodeIds.map((sourceNodeId) => ({ id: nanoid(), fromNodeId: sourceNodeId, toNodeId: node.id }));
    return { ok: true as const, node, nodes: [...input.nodes, node], connections: [...input.connections, ...created], createdConnectionIds: created.map((connection) => connection.id) };
}

export function planUpdateTextNode(input: { nodes: CanvasNodeData[]; nodeId: string; title: string; content: string }) {
    const node = input.nodes.find((item) => item.id === input.nodeId);
    if (!node) return missingNode(input.nodeId);
    if (node.type !== CanvasNodeType.Text) return { ok: false as const, code: "invalid_node_type", message: "只能用 update_text_node 修改文本节点" };
    const nodes = input.nodes.map((item) =>
        item.id === input.nodeId
            ? {
                ...item,
                title: input.title || item.title,
                metadata: input.content ? { ...item.metadata, content: input.content, prompt: input.content, status: NODE_STATUS_SUCCESS, errorDetails: undefined } : item.metadata,
            }
            : item,
    );
    return { ok: true as const, node: nodes.find((item) => item.id === input.nodeId)!, nodes };
}

export function planUpdateNodeTitle(input: { nodes: CanvasNodeData[]; nodeId: string; title: string }) {
    if (!input.nodes.some((node) => node.id === input.nodeId)) return missingNode(input.nodeId);
    const nodes = input.nodes.map((node) => (node.id === input.nodeId ? { ...node, title: input.title || node.title } : node));
    return { ok: true as const, node: nodes.find((node) => node.id === input.nodeId)!, nodes };
}

export function planCreateConnection(input: { nodes: CanvasNodeData[]; connections: CanvasConnection[]; fromNodeId: string; toNodeId: string }) {
    const fromNode = input.nodes.find((node) => node.id === input.fromNodeId);
    if (!fromNode) return missingNode(input.fromNodeId);
    const toNode = input.nodes.find((node) => node.id === input.toNodeId);
    if (!toNode) return missingNode(input.toNodeId);
    if (input.fromNodeId === input.toNodeId) return { ok: false as const, code: "self_connection", message: "节点不能连接到自身" };
    if (fromNode.type === CanvasNodeType.Config && toNode.type === CanvasNodeType.Config) {
        return { ok: false as const, code: "invalid_connection", message: "这两个节点不能这样连接" };
    }
    const existing = input.connections.find((connection) => connection.fromNodeId === input.fromNodeId && connection.toNodeId === input.toNodeId);
    if (existing) return { ok: true as const, connectionId: existing.id, alreadyExists: true, connections: input.connections };
    const connection: CanvasConnection = { id: nanoid(), fromNodeId: input.fromNodeId, toNodeId: input.toNodeId };
    return { ok: true as const, connectionId: connection.id, alreadyExists: false, connections: [...input.connections, connection] };
}

/** arrange_nodes：4 列排布，分组随组头位移。 */
export function planArrangeNodes(input: { nodes: CanvasNodeData[]; nodeIds: string[] }) {
    const missingNodeId = input.nodeIds.find((nodeId) => !input.nodes.some((node) => node.id === nodeId));
    if (missingNodeId) return missingNode(missingNodeId);
    const targetNodes = input.nodeIds.length
        ? input.nodeIds.map((nodeId) => input.nodes.find((node) => node.id === nodeId)!)
        : input.nodes.filter((node) => !node.metadata?.groupId && !node.metadata?.batchRootId);
    if (!targetNodes.length) return { ok: true as const, positions: [] as Array<{ id: string; position: Position }>, arrangedNodeIds: [] as string[] };
    const startX = Math.min(...targetNodes.map((node) => node.position.x));
    const startY = Math.min(...targetNodes.map((node) => node.position.y));
    const positions = new Map<string, Position>();
    let x = startX;
    let y = startY;
    let rowHeight = 0;
    targetNodes.forEach((node, index) => {
        if (index > 0 && index % 4 === 0) {
            x = startX;
            y += rowHeight + 72;
            rowHeight = 0;
        }
        positions.set(node.id, { x, y });
        x += node.width + 72;
        rowHeight = Math.max(rowHeight, node.height);
    });
    targetNodes
        .filter((node) => node.type === CanvasNodeType.Group)
        .forEach((group) => {
            const groupPosition = positions.get(group.id);
            if (!groupPosition) return;
            const offsetX = groupPosition.x - group.position.x;
            const offsetY = groupPosition.y - group.position.y;
            input.nodes
                .filter((node) => node.metadata?.groupId === group.id && !positions.has(node.id))
                .forEach((node) => positions.set(node.id, { x: node.position.x + offsetX, y: node.position.y + offsetY }));
        });
    return { ok: true as const, positions: Array.from(positions, ([id, position]) => ({ id, position })), arrangedNodeIds: targetNodes.map((node) => node.id) };
}
