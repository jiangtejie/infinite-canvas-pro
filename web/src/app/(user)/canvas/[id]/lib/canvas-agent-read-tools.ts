import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { canvasAgentNodeSummary } from "./canvas-agent-summary";

export const MAX_AGENT_QUERY_PAGE_SIZE = 50;

type QueryAgentCanvasNodesInput = {
    nodes: CanvasNodeData[];
    nodeId?: string;
    keyword?: string;
    type?: string;
    page?: number;
    pageSize?: number;
};

/** query_canvas_nodes 工具：按 ID / 类型 / 关键词过滤并分页，只返回定位信息。 */
export function queryAgentCanvasNodes({ nodes, nodeId = "", keyword = "", type = "", page = 1, pageSize = 20 }: QueryAgentCanvasNodesInput) {
    const normalizedKeyword = keyword.toLowerCase();
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePageSize = Math.max(1, Math.min(MAX_AGENT_QUERY_PAGE_SIZE, Math.floor(pageSize) || 20));
    const filtered = nodes.filter((node) => {
        if (nodeId && node.id !== nodeId) return false;
        if (type && node.type !== type) return false;
        if (!normalizedKeyword) return true;
        const content = isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio ? "" : node.metadata?.content || "";
        return `${node.title} ${content} ${node.metadata?.prompt || ""}`.toLowerCase().includes(normalizedKeyword);
    });
    return {
        ok: true as const,
        items: filtered.slice((safePage - 1) * safePageSize, safePage * safePageSize).map((node) => ({
            id: node.id,
            type: node.type,
            title: node.title,
            status: node.metadata?.status,
            groupId: node.metadata?.groupId,
        })),
        total: filtered.length,
        page: safePage,
        pageSize: safePageSize,
    };
}

/** 直接上下游节点，get_upstream / get_downstream / get_connected 共用。 */
export function agentNodeNeighbors({ nodes, connections, nodeId }: { nodes: CanvasNodeData[]; connections: CanvasConnection[]; nodeId: string }) {
    const upstreamIds = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const downstreamIds = connections.filter((connection) => connection.fromNodeId === nodeId).map((connection) => connection.toNodeId);
    return {
        upstream: nodes.filter((node) => upstreamIds.includes(node.id)).map(canvasAgentNodeSummary),
        downstream: nodes.filter((node) => downstreamIds.includes(node.id)).map(canvasAgentNodeSummary),
    };
}

export function isAgentMediaNodeType(type: CanvasNodeType) {
    return type === CanvasNodeType.Image || type === CanvasNodeType.Panorama || type === CanvasNodeType.Video || type === CanvasNodeType.Audio;
}
