import { CanvasNodeType, type CanvasConnectionInput, type CanvasNodeData, type ConnectionHandle } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { isFilmCanvasNodeType } from "../../utils/film-mode";
import { filmContextRoleOfNode } from "./film-node-kind";

export type CanvasNormalizedConnection = CanvasConnectionInput;

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

function normalizeFilmConnection(
    first: CanvasNodeData,
    second: CanvasNodeData,
    firstHandleType: "source" | "target",
): CanvasNormalizedConnection | null {
    const firstRole = filmContextRoleOfNode(first);
    const secondRole = filmContextRoleOfNode(second);
    if (firstRole && second.type === CanvasNodeType.FilmShot) {
        return { fromNodeId: first.id, toNodeId: second.id, kind: "context", data: { role: firstRole, source: "manual" } };
    }
    if (first.type === CanvasNodeType.FilmShot && secondRole) {
        return { fromNodeId: second.id, toNodeId: first.id, kind: "context", data: { role: secondRole, source: "manual" } };
    }
    if (first.type === CanvasNodeType.FilmScene && second.type === CanvasNodeType.FilmShot) {
        return { fromNodeId: first.id, toNodeId: second.id, kind: "composition" };
    }
    if (first.type === CanvasNodeType.FilmShot && second.type === CanvasNodeType.FilmScene) {
        return { fromNodeId: second.id, toNodeId: first.id, kind: "composition" };
    }
    if (first.type === CanvasNodeType.FilmShot && second.type === CanvasNodeType.FilmShot) {
        return firstHandleType === "source"
            ? { fromNodeId: first.id, toNodeId: second.id, kind: "sequence" }
            : { fromNodeId: second.id, toNodeId: first.id, kind: "sequence" };
    }
    return null;
}

export function normalizeConnection(
    firstNodeId: string,
    secondNodeId: string,
    nodes: CanvasNodeData[],
    firstHandleType: "source" | "target",
): CanvasNormalizedConnection | null {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    const film = normalizeFilmConnection(first, second, firstHandleType);
    if (film) return film;
    if (isFilmCanvasNodeType(first.type) || isFilmCanvasNodeType(second.type)) return null;
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
