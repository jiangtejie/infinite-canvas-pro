import type { CanvasConnection, CanvasNodeData } from "../../types";
import type { CanvasNormalizedConnection } from "./canvas-connections";

export type FilmConnectionCheck = { ok: true } | { ok: false; reason: string };

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
