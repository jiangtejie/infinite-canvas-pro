import { CanvasNodeType, type CanvasConnection, type CanvasConnectionInput, type CanvasNodeData } from "../../types";
import type { FilmContextEdgeData } from "./film-graph-types";
import { canvasConnection } from "./canvas-connection";
import { canAddFilmConnection } from "./film-connections";
import { filmContextRoleOfNode } from "./film-node-kind";

export type FilmConnectionResult = { connections: CanvasConnection[]; edgeId: string } | { error: string };

export function addFilmContextEdge(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    sourceNodeId: string,
    shotId: string,
    data: FilmContextEdgeData,
): FilmConnectionResult {
    const source = nodes.find((node) => node.id === sourceNodeId);
    const role = filmContextRoleOfNode(source);
    if (!source || role === null) return { error: "该节点不能作为镜头上下文" };
    const shot = nodes.find((node) => node.id === shotId && node.type === CanvasNodeType.FilmShot);
    if (!shot) return { error: "上下文目标必须是镜头节点" };
    if (role !== data.role) return { error: "上下文角色与节点类型不匹配" };

    const input: CanvasConnectionInput = { fromNodeId: sourceNodeId, toNodeId: shotId, kind: "context", data };
    const check = canAddFilmConnection(input, nodes, connections);
    if (!check.ok) return { error: check.reason };
    const edge = canvasConnection(sourceNodeId, shotId, { kind: "context", data });
    return { connections: [...connections, edge], edgeId: edge.id };
}

export function removeFilmContextEdge(connections: CanvasConnection[], edgeId: string): CanvasConnection[] {
    return connections.filter((edge) => edge.id !== edgeId || edge.kind !== "context");
}

export function updateFilmContextEdge(
    connections: CanvasConnection[],
    edgeId: string,
    patch: Partial<Omit<FilmContextEdgeData, "role">>,
): CanvasConnection[] {
    return connections.map((edge) => edge.id === edgeId && edge.kind === "context"
        ? { ...edge, data: { ...edge.data, ...patch, role: edge.data.role } }
        : edge);
}
