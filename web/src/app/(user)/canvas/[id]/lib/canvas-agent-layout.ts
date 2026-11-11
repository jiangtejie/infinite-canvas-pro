import { getNodeSpec } from "../../constants";
import { CanvasNodeType, type CanvasNodeData, type Position } from "../../types";

type NextAgentNodeCenterInput = {
    nodes: CanvasNodeData[];
    type: CanvasNodeType;
    sourceNodes?: CanvasNodeData[];
    canvasCenter: Position;
    sizeOverride?: { width: number; height: number };
};

const GAP_X = 72;
const GAP_Y = 72;
const COLUMNS = 3;
const SOURCE_OFFSET_X = 96;

/**
 * Agent 新建节点落点：优先放在直接来源右侧，其次按 3 列网格寻找不与现有节点重叠的位置。
 */
export function nextAgentNodeCenter({ nodes, type, sourceNodes = [], canvasCenter, sizeOverride }: NextAgentNodeCenterInput): Position {
    const spec = sizeOverride ? { ...getNodeSpec(type), ...sizeOverride } : getNodeSpec(type);
    const fallbackNodes = nodes.filter(
        (node) =>
            node.type !== CanvasNodeType.Group &&
            node.type !== CanvasNodeType.Config &&
            node.type !== CanvasNodeType.Director &&
            !node.metadata?.groupId &&
            !node.metadata?.excludeUpstreamText,
    );
    const candidates = sourceNodes.length ? sourceNodes : fallbackNodes;
    const source = candidates.length
        ? candidates.reduce((rightmost, node) => (node.position.x + node.width > rightmost.position.x + rightmost.width ? node : rightmost))
        : null;
    const startX = source ? source.position.x + source.width + SOURCE_OFFSET_X + spec.width / 2 : canvasCenter.x;
    const startY = source ? source.position.y + spec.height / 2 : canvasCenter.y;
    const collides = (x: number, y: number) => {
        const left = x - spec.width / 2;
        const right = x + spec.width / 2;
        const top = y - spec.height / 2;
        const bottom = y + spec.height / 2;
        return nodes.some(
            (node) =>
                left < node.position.x + node.width + GAP_X &&
                right + GAP_X > node.position.x &&
                top < node.position.y + node.height + GAP_Y &&
                bottom + GAP_Y > node.position.y,
        );
    };
    const maxSlots = Math.max(30, (nodes.length + 1) * COLUMNS * 2);

    for (let slot = 0; slot < maxSlots; slot += 1) {
        const x = startX + (slot % COLUMNS) * (spec.width + GAP_X);
        const y = startY + Math.floor(slot / COLUMNS) * (spec.height + GAP_Y);
        if (!collides(x, y)) return { x, y };
    }

    return {
        x: startX,
        y: Math.max(canvasCenter.y, ...nodes.map((node) => node.position.y + node.height + GAP_Y + spec.height / 2)),
    };
}
