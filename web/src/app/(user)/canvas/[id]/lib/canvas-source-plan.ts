import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../../types";
import { sourceNodeText } from "./canvas-node-meta";

export type CanvasSourcePlan = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    sourcePatch: Partial<CanvasNodeMetadata>;
};

export function sourceMaterialSignature(source: CanvasNodeData) {
    return JSON.stringify([
        sourceNodeText(source),
        source.metadata?.sourcePlatform,
        source.metadata?.sourceId,
        buildMaterialImages(source).map(({ url, storageKey, width, height, mimeType }) => [storageKey || (url.startsWith("blob:") ? "" : url), storageKey, width, height, mimeType]),
    ]);
}

export function sourceExpansionNeedsSync(source: CanvasNodeData, nodes: CanvasNodeData[]) {
    const planNodeById = new Map(buildSourceMaterialPlan(source).nodes.map((node) => [node.id, node]));
    const currentMaterials = nodes.filter((node) => node.id.startsWith(`${source.id}-material-`));
    if (source.metadata?.sourceExpanded !== true && currentMaterials.length === 0) return false;
    const signatureChanged = source.metadata?.sourceExpanded === true
        && source.metadata.sourceExpandedSignature !== sourceMaterialSignature(source);
    return signatureChanged || currentMaterials.some((node) => {
        const planned = planNodeById.get(node.id);
        return planned ? !sourceMaterialNodeMatches(node, planned) : true;
    }) || planNodeById.size !== currentMaterials.length;
}

export function sourceMaterialNodeSignature(node: CanvasNodeData) {
    // 图片有 storageKey 时以存储键为身份，展示 URL（可能是临时 blob）不参与比较。
    const content = node.type === CanvasNodeType.Image && node.metadata?.storageKey ? undefined : node.metadata?.content;
    return JSON.stringify([node.type, content, node.metadata?.storageKey, node.metadata?.naturalWidth, node.metadata?.naturalHeight, node.metadata?.mimeType]);
}

export function sourceMaterialNodeMatches(current: CanvasNodeData, planned: CanvasNodeData) {
    return sourceMaterialNodeSignature(current) === sourceMaterialNodeSignature(planned);
}

export function planSourceMaterialSync(source: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const plan = buildSourceMaterialPlan(source);
    const plannedById = new Map(plan.nodes.map((node) => [node.id, node]));
    const materialPrefix = `${source.id}-material-`;
    const currentMaterials = nodes.filter((node) => node.id.startsWith(materialPrefix));
    const needsSync = sourceExpansionNeedsSync(source, nodes);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const blockedNodeIds = needsSync
        ? currentMaterials.filter((node) => {
            const planned = plannedById.get(node.id);
            if (planned && sourceMaterialNodeMatches(node, planned)) return false;
            const originalSignature = source.metadata?.sourceExpandedNodeSignatures?.[node.id];
            const wasEdited = originalSignature ? sourceMaterialNodeSignature(node) !== originalSignature : Boolean(planned);
            if (wasEdited) return true;
            return connections.some((connection) => {
                if (connection.fromNodeId !== node.id) return false;
                const target = nodeById.get(connection.toNodeId);
                return !target || !isSourceDerivedNode(source.id, target.id);
            });
        }).map((node) => node.id)
        : [];
    if (blockedNodeIds.length) return { ok: false as const, needsSync, blockedNodeIds };

    const planNodeIds = new Set(plan.nodes.map((node) => node.id));
    const pruned = pruneSourceDerivedNodes(source, nodes, connections, (node) => node.id.startsWith(materialPrefix) && !planNodeIds.has(node.id));
    if (pruned.blockedNodeIds.length) return { ok: false as const, needsSync: true, blockedNodeIds: pruned.blockedNodeIds };
    const prunedIds = new Set(pruned.nodes.map((node) => node.id));
    const plannedNodes = pruned.nodes.map((node) => {
        const planned = plannedById.get(node.id);
        if (!planned || !node.id.startsWith(materialPrefix)) return node;
        if (node.type === CanvasNodeType.Text) {
            return { ...node, metadata: { ...node.metadata, content: planned.metadata?.content, status: "success" as const } };
        }
        return {
            ...node,
            metadata: {
                ...node.metadata,
                content: planned.metadata?.content,
                storageKey: planned.metadata?.storageKey || undefined,
                naturalWidth: planned.metadata?.naturalWidth,
                naturalHeight: planned.metadata?.naturalHeight,
                mimeType: planned.metadata?.mimeType,
                status: "success" as const,
            },
        };
    });
    const nextMaterialNodes = plannedNodes.concat(plan.nodes.filter((node) => !prunedIds.has(node.id)));
    const nodeSignatures = Object.fromEntries(nextMaterialNodes.filter((node) => node.id.startsWith(materialPrefix)).map((node) => [node.id, sourceMaterialNodeSignature(node)]));
    const nextNodes = nextMaterialNodes.map((node) => node.id === source.id ? {
        ...node,
        metadata: { ...node.metadata, ...source.metadata, ...plan.sourcePatch, sourceExpandedNodeSignatures: nodeSignatures },
    } : node);
    const existingPairs = new Set(pruned.connections.map((connection) => `${connection.fromNodeId}->${connection.toNodeId}`));
    const nextConnections = pruned.connections.concat(plan.connections.filter((connection) => !existingPairs.has(`${connection.fromNodeId}->${connection.toNodeId}`)));
    return { ok: true as const, nodes: nextNodes, connections: nextConnections, needsSync, removedNodeIds: pruned.removedNodeIds };
}

const MATERIAL_GAP = 96;
const MATERIAL_TEXT_SIZE = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
const MATERIAL_IMAGE_MAX_WIDTH = 320;
const MATERIAL_IMAGE_MAX_HEIGHT = 260;
const MATERIAL_IMAGE_FALLBACK_SIZE = { width: 320, height: 240 };
const MATERIAL_IMAGE_COLUMNS = 2;
const MATERIAL_IMAGE_GRID_GAP = 20;
const MATERIAL_IMAGE_CELL_HEIGHT = 260;
const MATERIAL_IMAGE_COLUMN_STAGGER = 18;

/**
 * 素材展开建图：把解析结果铺成真实的素材文案与素材图节点。
 * 复刻文案/策划/配图由 Agent 的 plan_source_remix 建，语义在 canvas-source-remix。
 */
export function buildSourceMaterialPlan(source: CanvasNodeData): CanvasSourcePlan {
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const sourcePatch: Partial<CanvasNodeMetadata> = { sourceExpanded: true, sourceExpandedSignature: sourceMaterialSignature(source) };
    const materialText = sourceNodeText(source);
    const materialImages = buildMaterialImages(source);
    if (!materialText && !materialImages.length) {
        sourcePatch.sourceExpandedNodeSignatures = {};
        return { nodes, connections, sourcePatch };
    }

    const materialTextId = `${source.id}-material-text`;
    const materialTextPosition = { x: source.position.x + source.width + MATERIAL_GAP, y: source.position.y };
    if (materialText) {
        nodes.push({
            id: materialTextId,
            type: CanvasNodeType.Text,
            title: "素材文案",
            position: materialTextPosition,
            width: MATERIAL_TEXT_SIZE.width,
            height: MATERIAL_TEXT_SIZE.height,
            metadata: { content: materialText, status: "success", fontSize: 14 },
        });
        connections.push(connection(source.id, materialTextId));
    }

    const materialImagesX = materialText ? materialTextPosition.x + MATERIAL_TEXT_SIZE.width + MATERIAL_GAP : materialTextPosition.x;
    materialImages.forEach((image, index) => {
        const id = `${source.id}-material-image-${index}`;
        const size = fitMaterialImageSize(image.width, image.height);
        const column = index % MATERIAL_IMAGE_COLUMNS;
        const row = Math.floor(index / MATERIAL_IMAGE_COLUMNS);
        nodes.push({
            id,
            type: CanvasNodeType.Image,
            title: `素材图 ${index + 1}`,
            position: {
                x: materialImagesX + column * (MATERIAL_IMAGE_MAX_WIDTH + MATERIAL_IMAGE_GRID_GAP),
                y: source.position.y + row * (MATERIAL_IMAGE_CELL_HEIGHT + MATERIAL_IMAGE_GRID_GAP) + (column > 0 ? MATERIAL_IMAGE_COLUMN_STAGGER : 0),
            },
            width: size.width,
            height: size.height,
            metadata: {
                content: image.url,
                storageKey: image.storageKey,
                naturalWidth: image.width,
                naturalHeight: image.height,
                mimeType: image.mimeType,
                status: "success",
            },
        });
        connections.push(connection(source.id, id));
    });

    sourcePatch.sourceExpandedNodeSignatures = Object.fromEntries(nodes.map((node) => [node.id, sourceMaterialNodeSignature(node)]));
    return { nodes, connections, sourcePatch };
}

function buildMaterialImages(source: CanvasNodeData): { url: string; storageKey?: string; width?: number; height?: number; mimeType?: string }[] {
    const images = (source.metadata?.sourceImages || []).filter((image) => Boolean(image.url));
    if (images.length) return images;
    const coverUrl = source.metadata?.sourceCoverUrl;
    return coverUrl ? [{ url: coverUrl }] : [];
}

function fitMaterialImageSize(width?: number, height?: number) {
    if (!width || !height || width <= 0 || height <= 0) return MATERIAL_IMAGE_FALLBACK_SIZE;
    const scale = Math.min(1, MATERIAL_IMAGE_MAX_WIDTH / width, MATERIAL_IMAGE_MAX_HEIGHT / height);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function connection(fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId };
}

export type CanvasSourcePrunePlan = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    removedNodeIds: string[];
    blockedNodeIds: string[];
};

function isSourceDerivedNode(sourceId: string, nodeId: string) {
    return nodeId.startsWith(`${sourceId}-material-`) || nodeId.startsWith(`${sourceId}-remix-`);
}

/**
 * 清理素材源派生节点：只删除没有连到画布其他节点（非派生节点）的节点，
 * 用户已经把它接到下游的节点保留，避免误删用户工作。
 */
export function pruneSourceDerivedNodes(
    source: CanvasNodeData,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shouldRemove: (node: CanvasNodeData) => boolean,
): CanvasSourcePrunePlan {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const removed = new Set<string>();
    const blocked = new Set<string>();
    for (const node of nodes) {
        if (!isSourceDerivedNode(source.id, node.id) || !shouldRemove(node)) continue;
        const hasExternalOutgoing = connections.some((connection) => {
            if (connection.fromNodeId !== node.id) return false;
            const target = nodeById.get(connection.toNodeId);
            return !target || !isSourceDerivedNode(source.id, target.id);
        });
        if (hasExternalOutgoing) blocked.add(node.id);
        else removed.add(node.id);
    }
    return {
        nodes: nodes.filter((node) => !removed.has(node.id)),
        connections: connections.filter((connection) => !removed.has(connection.fromNodeId) && !removed.has(connection.toNodeId)),
        removedNodeIds: Array.from(removed),
        blockedNodeIds: Array.from(blocked),
    };
}