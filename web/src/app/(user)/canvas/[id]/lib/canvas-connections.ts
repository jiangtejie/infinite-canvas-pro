import { CanvasNodeType, type CanvasNodeData, type ConnectionHandle } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";

export function getConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

/** 发布节点只接受文本/图片作为上游，且自身不能作为连线来源。 */
export function isPublishUpstreamNode(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Text || isCanvasImageNodeType(node.type);
}

export function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Group || second.type === CanvasNodeType.Group) return null;
    if (second.type === CanvasNodeType.Source) return null;
    if (first.type === CanvasNodeType.Publish || second.type === CanvasNodeType.Publish) {
        const publishIsFirst = first.type === CanvasNodeType.Publish;
        const publish = publishIsFirst ? first : second;
        const upstream = publishIsFirst ? second : first;
        const upstreamToPublish = publishIsFirst ? firstHandleType === "target" : firstHandleType === "source";
        if (!upstreamToPublish || !isPublishUpstreamNode(upstream)) return null;
        return { fromNodeId: upstream.id, toNodeId: publish.id };
    }
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
