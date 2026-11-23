import { isFilmCanvasNodeType } from "../../utils/film-mode";
import { CanvasNodeType, type CanvasConnection, type CanvasConnectionInput, type CanvasNodeData } from "../../types";
import { filmContextRoleOfNode } from "./film-node-kind";

export type FilmConnectionCheck = { ok: true } | { ok: false; reason: string; nodeIds?: string[] };

function isFilmNode(node: CanvasNodeData) {
    return isFilmCanvasNodeType(node.type);
}

/** 全片单链校验：镜头顺序只能是一条线性链。 */
export function filmSequenceCheck(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmConnectionCheck {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Set<string>();
    const outgoing = new Map<string, string>();
    for (const edge of connections) {
        if (edge.kind !== "sequence") continue;
        const from = byId.get(edge.fromNodeId);
        const to = byId.get(edge.toNodeId);
        if (!from || !to || from.type !== CanvasNodeType.FilmShot || to.type !== CanvasNodeType.FilmShot) {
            return { ok: false, reason: "连续镜头只能连接镜头节点", nodeIds: [edge.fromNodeId, edge.toNodeId] };
        }
        if (outgoing.has(edge.fromNodeId)) return { ok: false, reason: "同一镜头只能有一个后继", nodeIds: [edge.fromNodeId] };
        if (incoming.has(edge.toNodeId)) return { ok: false, reason: "同一镜头只能有一个前继", nodeIds: [edge.toNodeId] };
        outgoing.set(edge.fromNodeId, edge.toNodeId);
        incoming.add(edge.toNodeId);
    }
    const visited = new Set<string>();
    for (const shot of nodes) {
        if (shot.type !== CanvasNodeType.FilmShot) continue;
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

function checkComposition(connection: CanvasConnectionInput, nodesById: Map<string, CanvasNodeData>, connections: CanvasConnection[]): FilmConnectionCheck {
    const source = nodesById.get(connection.fromNodeId);
    const target = nodesById.get(connection.toNodeId);
    if (source?.type !== CanvasNodeType.FilmScene || target?.type !== CanvasNodeType.FilmShot) {
        return { ok: false, reason: "场次只能归属镜头节点", nodeIds: [connection.fromNodeId, connection.toNodeId] };
    }
    const hasScene = connections.some((edge) => edge.kind === "composition" && edge.toNodeId === connection.toNodeId && edge.fromNodeId !== connection.fromNodeId);
    return hasScene ? { ok: false, reason: "镜头已归属其他场次，先删除旧连线" } : { ok: true };
}

function checkContext(connection: Extract<CanvasConnectionInput, { kind: "context" }>, nodesById: Map<string, CanvasNodeData>, connections: CanvasConnection[]): FilmConnectionCheck {
    const source = nodesById.get(connection.fromNodeId);
    const target = nodesById.get(connection.toNodeId);
    const role = filmContextRoleOfNode(source);
    if (!role || target?.type !== CanvasNodeType.FilmShot) {
        return { ok: false, reason: "上下文只能从影视上下文节点连接到镜头", nodeIds: [connection.fromNodeId, connection.toNodeId] };
    }
    if (connection.data.role !== role) return { ok: false, reason: "上下文角色与节点类型不匹配", nodeIds: [connection.fromNodeId] };
    if (role === "location" && connections.some((edge) => edge.kind === "context" && edge.toNodeId === connection.toNodeId && edge.data.role === "location")) {
        return { ok: false, reason: "每个镜头只能引用一个场景" };
    }
    return { ok: true };
}

function checkDerived(connection: Extract<CanvasConnectionInput, { kind: "derived" }>, nodesById: Map<string, CanvasNodeData>): FilmConnectionCheck {
    const source = nodesById.get(connection.fromNodeId);
    const target = nodesById.get(connection.toNodeId);
    if (!source || !target || !isFilmNode(source) || !isFilmNode(target)) {
        return { ok: false, reason: "来源关系只能连接影视节点", nodeIds: [connection.fromNodeId, connection.toNodeId] };
    }
    if (source.type !== CanvasNodeType.FilmScript) {
        return { ok: false, reason: "来源关系必须从剧本节点发出", nodeIds: [connection.fromNodeId] };
    }
    return { ok: true };
}

export function canAddFilmConnection(
    connection: CanvasConnectionInput,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
): FilmConnectionCheck {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const source = nodesById.get(connection.fromNodeId);
    const target = nodesById.get(connection.toNodeId);
    if (!source || !target || !isFilmNode(source) || !isFilmNode(target)) {
        return { ok: false, reason: "影视连线必须连接影视节点", nodeIds: [connection.fromNodeId, connection.toNodeId] };
    }
    if (connections.some((edge) => edge.kind === connection.kind && edge.fromNodeId === connection.fromNodeId && edge.toNodeId === connection.toNodeId)) {
        return { ok: false, reason: "这两个节点已经连接" };
    }
    if (connection.kind === "sequence" && source.id === target.id) {
        return { ok: false, reason: "连续镜头不能连接自身" };
    }

    if (connection.kind === "composition") return checkComposition(connection, nodesById, connections);
    if (connection.kind === "context") return checkContext(connection, nodesById, connections);
    if (connection.kind === "derived") return checkDerived(connection, nodesById);
    if (connection.kind !== "sequence") return { ok: false, reason: "不支持的影视连线类型" };

    if (source.type !== CanvasNodeType.FilmShot || target.type !== CanvasNodeType.FilmShot) {
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
    return { ok: true };
}
