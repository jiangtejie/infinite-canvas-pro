import { CanvasNodeType, type CanvasNodeData, type ConnectionHandle } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";

export function getConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

export function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Group || second.type === CanvasNodeType.Group) return null;
    if (second.type === CanvasNodeType.Source) return null;
    if (second.type === CanvasNodeType.Director) {
        if (!isCanvasImageNodeType(first.type)) return null;
        return firstHandleType === "target" ? { fromNodeId: second.id, toNodeId: first.id } : { fromNodeId: first.id, toNodeId: second.id };
    }
    if (first.type === CanvasNodeType.Director) {
        if (!isCanvasImageNodeType(second.type)) return null;
        return firstHandleType === "target" ? { fromNodeId: second.id, toNodeId: first.id } : { fromNodeId: first.id, toNodeId: second.id };
    }
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    return { fromNodeId: first.id, toNodeId: second.id };
}
