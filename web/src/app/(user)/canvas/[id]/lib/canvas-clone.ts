import { nanoid } from "nanoid";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../../types";
import { NODE_STATUS_SUCCESS } from "./canvas-node-constants";

/** 复制节点标题：已带后缀的不重复追加，避免「X Copy Copy」。 */
export function copyNodeTitle(title: string) {
    return title.endsWith(" Copy") ? title : `${title} Copy`;
}

type CloneCanvasNodesOptions = {
    offset: Position;
    /** 生成新标题；默认追加 Copy 后缀。 */
    rename?: (title: string) => string;
    /** 粘贴时组内子节点会重映射 groupId；单节点复制沿用原 groupId。 */
    remapGroupIds?: boolean;
};

export type CloneCanvasNodesResult = {
    nodes: CanvasNodeData[];
    idMap: Map<string, string>;
};

export function cloneCanvasNodes(nodes: CanvasNodeData[], { offset, rename = copyNodeTitle, remapGroupIds = false }: CloneCanvasNodesOptions): CloneCanvasNodesResult {
    const idMap = new Map<string, string>();
    const cloned = nodes.map((node) => {
        const id = nanoid();
        idMap.set(node.id, id);
        return {
            ...node,
            id,
            title: rename(node.title),
            position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
            metadata: cloneNodeMetadata(node),
        };
    });
    if (!remapGroupIds) return { nodes: cloned, idMap };
    return {
        nodes: cloned.map((node) => {
            const groupId = node.metadata?.groupId;
            const nextGroupId = groupId ? idMap.get(groupId) : undefined;
            if (!groupId || nextGroupId) return nextGroupId ? { ...node, metadata: { ...node.metadata, groupId: nextGroupId } } : node;
            return { ...node, metadata: { ...node.metadata, groupId: undefined } };
        }),
        idMap,
    };
}

export function cloneCanvasConnections(connections: CanvasConnection[], idMap: Map<string, string>): CanvasConnection[] {
    return connections.flatMap((connection) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        return fromNodeId && toNodeId ? [{ ...connection, id: nanoid(), fromNodeId, toNodeId }] : [];
    });
}

function cloneNodeMetadata(node: CanvasNodeData): CanvasNodeMetadata | undefined {
    if (!node.metadata) return undefined;
    const metadata: CanvasNodeMetadata = { ...node.metadata, clientTaskId: undefined, taskBackend: undefined };
    if (metadata.remixRun) metadata.remixRun = { ...metadata.remixRun, binding: "detached", approvedKey: undefined };
    if (metadata.remixRunId) metadata.remixRunId = `detached:${metadata.remixRunId}`;
    if (metadata.remixRun) metadata.remixRun.id = metadata.remixRunId!;
    if (node.type === CanvasNodeType.Publish) {
        metadata.publishRecord = undefined;
        metadata.publishStatus = "idle";
        metadata.publishError = undefined;
    }
    if (node.metadata.status === "stopping" || node.metadata.status === "stopped") {
        metadata.status = node.metadata.content ? NODE_STATUS_SUCCESS : "idle";
        metadata.errorDetails = undefined;
    }
    return metadata;
}
