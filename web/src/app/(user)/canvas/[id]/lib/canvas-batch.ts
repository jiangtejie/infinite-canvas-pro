import type { CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";

/** 可作为批量生成目标的图片节点：图片/全景图；批量组根节点只代表一组结果，不参与批量。 */
export function isBatchTargetImageNode(node: CanvasNodeData) {
    return isCanvasImageNodeType(node.type) && !node.metadata?.isBatchRoot;
}

/**
 * 批量目标：直接选中的图片节点 + 选中组内的图片子节点（metadata.groupId），
 * 按画布节点顺序去重并排除批量组根节点。
 */
export function collectBatchTargetNodeIds(nodes: CanvasNodeData[], selectedIds: Iterable<string>): string[] {
    const selected = new Set(selectedIds);
    if (!selected.size) return [];
    const targets = new Set<string>();
    for (const node of nodes) {
        if (!isBatchTargetImageNode(node)) continue;
        const parentGroupId = node.metadata?.groupId;
        if (selected.has(node.id) || (parentGroupId ? selected.has(parentGroupId) : false)) targets.add(node.id);
    }
    return Array.from(targets);
}

/**
 * 批量生成目标：在批量候选里再剔除没有提示词的节点，与单节点面板 canSubmit 同口径。
 * 空提示词的图片请求会真实发出并扣算力点，必须在入队前挡掉。
 */
export function collectBatchGenerationTargets(nodes: CanvasNodeData[], nodeIds: Iterable<string>) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const candidates = Array.from(new Set(nodeIds)).flatMap((id) => {
        const node = byId.get(id);
        return node && isBatchTargetImageNode(node) ? [node] : [];
    });
    const targets = candidates.filter((node) => (node.metadata?.prompt || "").trim());
    return { targetNodeIds: targets.map((node) => node.id), skippedCount: candidates.length - targets.length };
}
