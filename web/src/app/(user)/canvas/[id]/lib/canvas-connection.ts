import type { CanvasConnection, CanvasConnectionKind, FilmBindingEdgeData } from "../../types";

export type CanvasConnectionOptions = {
    kind?: CanvasConnectionKind;
    data?: FilmBindingEdgeData;
};

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
