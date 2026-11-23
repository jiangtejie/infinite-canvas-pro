import type { CanvasConnection, CanvasConnectionInput } from "../../types";

type WithoutConnectionEndpoints<T> = T extends CanvasConnectionInput ? Omit<T, "fromNodeId" | "toNodeId"> : never;

export type CanvasConnectionOptions = WithoutConnectionEndpoints<CanvasConnectionInput>;

/** 生成稳定的连线 id：同一对节点只会有一条同向结构边。 */
export function canvasConnection(
    fromNodeId: string,
    toNodeId: string,
    options: CanvasConnectionOptions = {},
): CanvasConnection {
    return {
        id: `${fromNodeId}->${toNodeId}`,
        fromNodeId,
        toNodeId,
        ...options,
    };
}
