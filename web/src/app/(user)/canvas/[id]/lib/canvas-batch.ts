import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";

const REMIX_IMAGE_SUFFIX = "-remix-image-";
const REMIX_TEXT_SUFFIX = "-remix-text";

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

/** 一键复刻生成的复刻文案节点。 */
export function findSourceRemixTextNode(nodes: CanvasNodeData[], sourceId: string) {
    if (!sourceId) return undefined;
    const id = `${sourceId}${REMIX_TEXT_SUFFIX}`;
    return nodes.find((node) => node.id === id && node.type === CanvasNodeType.Text);
}

export type CanvasSourceRemixTextStatus = "missing" | "idle" | "generating" | "success" | "error";

/** 复刻文案状态：节点不存在=未生成、loading=生成中、有正文=已生成、error=失败。 */
export function getSourceRemixTextStatus(node: CanvasNodeData | undefined): CanvasSourceRemixTextStatus {
    if (!node) return "missing";
    if (node.metadata?.status === "loading" || node.metadata?.status === "stopping") return "generating";
    if ((node.metadata?.content || "").trim()) return "success";
    if (node.metadata?.status === "error") return "error";
    return "idle";
}

/** 文案是否已生成内容；配图与发布步骤都以它为前置条件。 */
export function hasSourceRemixText(node: CanvasNodeData | undefined) {
    return Boolean(node && (node.metadata?.content || "").trim());
}

/** 已成功生成内容的复刻配图，用于发布节点选图。 */
export function collectPublishableRemixImages(nodes: CanvasNodeData[], sourceId: string) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return collectRemixImageNodeIds(nodes, sourceId)
        .map((nodeId) => byId.get(nodeId))
        .filter((node): node is CanvasNodeData => Boolean(node && (node.metadata?.content || "").trim()));
}
