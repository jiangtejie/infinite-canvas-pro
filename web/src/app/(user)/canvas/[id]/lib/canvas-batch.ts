import type { CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";

const REMIX_IMAGE_SUFFIX = "-remix-image-";

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
 * 素材源一键复刻生成的配图节点：优先按 `${sourceId}-remix-image-` 前缀识别（含批量组根节点）；
 * 复制/粘贴后 ID 变化时退回 metadata.remixIndex 识别，顺序按 remixIndex 升序。
 */
export function collectRemixImageNodeIds(nodes: CanvasNodeData[], sourceId: string): string[] {
    if (!sourceId) return [];
    const prefixed = nodes.filter((node) => isBatchTargetImageNode(node) && node.id.startsWith(`${sourceId}${REMIX_IMAGE_SUFFIX}`));
    const candidates = prefixed.length
        ? prefixed
        : nodes.filter((node) => isBatchTargetImageNode(node) && node.metadata?.remixSourceId === sourceId && typeof node.metadata?.remixIndex === "number");
    return candidates
        .map((node, index) => ({ node, index }))
        .sort((a, b) => (a.node.metadata?.remixIndex ?? Number.MAX_SAFE_INTEGER) - (b.node.metadata?.remixIndex ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
        .map(({ node }) => node.id);
}

/** 素材源复刻配图数量，用于面板显示「生成全部复刻配图（N 张）」。 */
export function countSourceRemixImages(nodes: CanvasNodeData[], sourceId: string) {
    return collectRemixImageNodeIds(nodes, sourceId).length;
}
