import type { CanvasConnection, CanvasNodeData, FilmBindingEdgeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { canAddFilmConnection } from "./film-connections";

export type FilmBindingAddResult = { connections: CanvasConnection[]; edgeId: string } | { error: string };

export function addFilmShotBinding(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotId: string,
    assetNodeId: string,
    patch: Partial<FilmBindingEdgeData> = {},
): FilmBindingAddResult {
    const asset = nodes.find((node) => node.id === assetNodeId);
    const payload = asset?.metadata?.filmAsset;
    if (!asset || !payload || !["character", "location", "prop"].includes(payload.kind)) {
        return { error: "该资产不能绑定到镜头" };
    }
    const data: FilmBindingEdgeData = { source: "manual", ...patch };
    const check = canAddFilmConnection({ fromNodeId: assetNodeId, toNodeId: shotId, kind: "binding", data }, nodes, connections);
    if (!check.ok) return { error: check.reason };
    const edge = canvasConnection(assetNodeId, shotId, { kind: "binding", data });
    return { connections: [...connections, edge], edgeId: edge.id };
}

export function removeFilmShotBinding(connections: CanvasConnection[], edgeId: string) {
    return connections.filter((edge) => edge.id !== edgeId);
}

export function updateFilmShotBinding(connections: CanvasConnection[], edgeId: string, patch: Partial<FilmBindingEdgeData>) {
    return connections.map((edge) => edge.id === edgeId && edge.kind === "binding"
        ? { ...edge, data: { ...edge.data, source: edge.data?.source ?? "manual", ...patch } }
        : edge);
}
