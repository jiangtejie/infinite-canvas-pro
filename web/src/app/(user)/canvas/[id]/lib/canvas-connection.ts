import type { CanvasConnection } from "../../types";

/** 生成稳定的连线 id：同一对节点只会有一条同向结构边。 */
export function canvasConnection(fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId };
}
