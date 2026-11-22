import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import type { CanvasNormalizedConnection } from "./canvas-connections";

export type FilmConnectionCheck = { ok: true } | { ok: false; reason: string; nodeIds?: string[] };

/** 全片单链校验：镜头顺序只能是一条线性链。 */
export function filmSequenceCheck(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmConnectionCheck {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Set<string>();
    const outgoing = new Map<string, string>();
    for (const edge of connections) {
        if (edge.kind !== "sequence") continue;
        const from = byId.get(edge.fromNodeId);
        const to = byId.get(edge.toNodeId);
        if (!from || !to || from.type !== CanvasNodeType.Shot || to.type !== CanvasNodeType.Shot) {
            return { ok: false, reason: "连续镜头只能连接镜头节点", nodeIds: [edge.fromNodeId, edge.toNodeId] };
        }
        if (outgoing.has(edge.fromNodeId)) return { ok: false, reason: "同一镜头只能有一个后继", nodeIds: [edge.fromNodeId] };
        if (incoming.has(edge.toNodeId)) return { ok: false, reason: "同一镜头只能有一个前继", nodeIds: [edge.toNodeId] };
        outgoing.set(edge.fromNodeId, edge.toNodeId);
        incoming.add(edge.toNodeId);
    }
    const visited = new Set<string>();
    for (const shot of nodes) {
        if (shot.type !== CanvasNodeType.Shot) continue;
        const path = new Set<string>();
        let current: string | undefined = shot.id;
        while (current && !visited.has(current)) {
            if (path.has(current)) return { ok: false, reason: "连续镜头不能成环", nodeIds: [...path] };
            path.add(current);
            current = outgoing.get(current);
        }
        path.forEach((id) => visited.add(id));
    }
    return { ok: true };
}

export function canAddFilmConnection(
    connection: CanvasNormalizedConnection,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
): FilmConnectionCheck {
    if (connections.some((edge) => edge.fromNodeId === connection.fromNodeId && edge.toNodeId === connection.toNodeId)) {
        return { ok: false, reason: "这两个节点已经连接" };
    }
    if (connection.kind === "binding") {
        const source = nodes.find((node) => node.id === connection.fromNodeId);
        if (source?.metadata?.filmAsset?.kind === "location") {
            const hasLocation = connections.some((edge) => {
                if (edge.kind !== "binding" || edge.toNodeId !== connection.toNodeId) return false;
                const edgeSource = nodes.find((node) => node.id === edge.fromNodeId);
                return edgeSource?.metadata?.filmAsset?.kind === "location";
            });
            if (hasLocation) return { ok: false, reason: "每个镜头只能绑定一个场景" };
        }
    }
    if (connection.kind === "composition") {
        const hasScene = connections.some((edge) => edge.kind === "composition" && edge.toNodeId === connection.toNodeId && edge.fromNodeId !== connection.fromNodeId);
        if (hasScene) return { ok: false, reason: "镜头已归属其他场次，先删除旧连线" };
    }
    if (connection.kind === "sequence") {
        const source = nodes.find((node) => node.id === connection.fromNodeId);
        const target = nodes.find((node) => node.id === connection.toNodeId);
        if (source?.type !== CanvasNodeType.Shot || target?.type !== CanvasNodeType.Shot) {
            return { ok: false, reason: "连续镜头只能连接镜头节点" };
        }
        if (connections.some((edge) => edge.kind === "sequence" && edge.fromNodeId === connection.fromNodeId)) {
            return { ok: false, reason: "该镜头已有后继，请先删除旧顺序" };
        }
        if (connections.some((edge) => edge.kind === "sequence" && edge.toNodeId === connection.toNodeId)) {
            return { ok: false, reason: "该镜头已有前继，请先删除旧顺序" };
        }
        const outgoing = new Map<string, string[]>();
        connections.forEach((edge) => {
            if (edge.kind !== "sequence") return;
            outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) || []), edge.toNodeId]);
        });
        const stack = [...(outgoing.get(connection.toNodeId) || [])];
        const seen = new Set<string>();
        while (stack.length) {
            const id = stack.pop()!;
            if (id === connection.fromNodeId) return { ok: false, reason: "连续镜头不能成环" };
            if (seen.has(id)) continue;
            seen.add(id);
            stack.push(...(outgoing.get(id) || []));
        }
    }
    return { ok: true };
}
