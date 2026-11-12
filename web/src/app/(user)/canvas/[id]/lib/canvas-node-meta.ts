import { CanvasNodeType, type CanvasNodeData, type CanvasNodeStatus } from "../../types";

/** 画布节点展示状态：素材源/发布节点各有自己的状态字段，其余沿用节点任务状态。 */
export function canvasNodeDisplayStatus(node: CanvasNodeData): CanvasNodeStatus | undefined {
    if (node.type === CanvasNodeType.Source) return node.metadata?.sourceStatus;
    if (node.type === CanvasNodeType.Publish) {
        if (node.metadata?.publishStatus === "generating") return "loading";
        if (node.metadata?.publishStatus === "error") return "error";
        return node.metadata?.publishRecord ? "success" : "idle";
    }
    return node.metadata?.status;
}
