import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../../types";

export type CanvasSourcePlan = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    sourcePatch: Partial<CanvasNodeMetadata>;
};

export const SOURCE_REMIX_TEXT_PROMPT =
    "参考上游原文，写一篇同结构、同传播逻辑但完全原创的图文文案。要求：保留开头钩子和情绪节奏，换掉具体例子与措辞；标题不超过20字；正文口语化、短句；话题3-5个且不带#；不要照抄原句，不要写联系方式或绝对化用语。";

export const SOURCE_REMIX_IMAGE_PROMPT =
    "参考上游图片的画面构图、色调和图文排版风格，为复刻文案生成一张新的配图。要求：主体和场景可以替换，但构图、视觉重心、文字区位置和整体风格保持一致；画面清晰，适合 3:4 竖版发布。";

const MATERIAL_GAP = 96;
const MATERIAL_TEXT_SIZE = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
const MATERIAL_IMAGE_MAX_WIDTH = 320;
const MATERIAL_IMAGE_MAX_HEIGHT = 260;
const MATERIAL_IMAGE_FALLBACK_SIZE = { width: 320, height: 240 };
const MATERIAL_IMAGE_COLUMNS = 2;
const MATERIAL_IMAGE_GRID_GAP = 20;
const MATERIAL_IMAGE_CELL_HEIGHT = 260;
const MATERIAL_IMAGE_COLUMN_STAGGER = 18;
const REMIX_IMAGE_SIZE = { width: 320, height: 400 };
const REMIX_IMAGE_COLUMNS = 2;
const REMIX_IMAGE_GAP = 20;
const REMIX_IMAGE_COLUMN_STAGGER = 18;

export function buildSourceMaterialPlan(source: CanvasNodeData, options?: { includeRemix?: boolean }): CanvasSourcePlan {
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const sourcePatch: Partial<CanvasNodeMetadata> = { sourceExpanded: true };
    const materialText = buildMaterialText(source);
    const materialImages = buildMaterialImages(source);
    if (!materialText && !materialImages.length) return { nodes, connections, sourcePatch };

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
    const materialImageIds = materialImages.map((image, index) => {
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
        return id;
    });

    if (!options?.includeRemix) return { nodes, connections, sourcePatch };

    const remixTextId = `${source.id}-remix-text`;
    const gridRight = materialImageIds.length ? materialImagesX + MATERIAL_IMAGE_COLUMNS * MATERIAL_IMAGE_MAX_WIDTH + (MATERIAL_IMAGE_COLUMNS - 1) * MATERIAL_IMAGE_GRID_GAP : 0;
    const materialRight = materialText ? materialTextPosition.x + MATERIAL_TEXT_SIZE.width : materialTextPosition.x;
    const remixTextPosition = { x: (materialImageIds.length ? gridRight : materialRight) + MATERIAL_GAP, y: source.position.y };
    nodes.push({
        id: remixTextId,
        type: CanvasNodeType.Text,
        title: "复刻文案",
        position: remixTextPosition,
        width: MATERIAL_TEXT_SIZE.width,
        height: MATERIAL_TEXT_SIZE.height,
        metadata: { prompt: SOURCE_REMIX_TEXT_PROMPT, status: "idle" },
    });
    // 复刻文案默认只引用原文：多数文本模型不读图，连图会直接报错。
    // 需要参考画面时，用户可以手动把素材图连到复刻文案节点（文本模型需支持读图）。
    if (materialText) connections.push(connection(materialTextId, remixTextId));

    // 一张原图对应一张复刻图：不要把多张原图全塞给一个图片节点当参考，
    // 否则生成结果和原图顺序对不上，也无法逐张替换/发布。
    const remixImageCount = materialImageIds.length || 1;
    const remixImagesX = remixTextPosition.x + MATERIAL_TEXT_SIZE.width + MATERIAL_GAP;
    for (let index = 0; index < remixImageCount; index++) {
        const remixImageId = `${source.id}-remix-image-${index}`;
        const column = index % REMIX_IMAGE_COLUMNS;
        const row = Math.floor(index / REMIX_IMAGE_COLUMNS);
        nodes.push({
            id: remixImageId,
            type: CanvasNodeType.Image,
            title: remixImageCount > 1 ? `复刻配图 ${index + 1}` : "复刻配图",
            position: {
                x: remixImagesX + column * (REMIX_IMAGE_SIZE.width + REMIX_IMAGE_GAP),
                y: source.position.y + row * (REMIX_IMAGE_SIZE.height + REMIX_IMAGE_GAP) + (column > 0 ? REMIX_IMAGE_COLUMN_STAGGER : 0),
            },
            width: REMIX_IMAGE_SIZE.width,
            height: REMIX_IMAGE_SIZE.height,
            metadata: {
                prompt: remixImagePrompt(index, materialImageIds.length),
                status: "idle",
                remixIndex: index + 1,
                remixSourceId: source.id,
            },
        });
        connections.push(connection(remixTextId, remixImageId));
        const materialImageId = materialImageIds[index];
        if (materialImageId) connections.push(connection(materialImageId, remixImageId));
    }

    return { nodes, connections, sourcePatch };
}

function remixImagePrompt(index: number, total: number) {
    if (total <= 0) return SOURCE_REMIX_IMAGE_PROMPT;
    return `${SOURCE_REMIX_IMAGE_PROMPT}\n\n本张参考第 ${index + 1} 张原图（共 ${total} 张）：保持它的构图、视觉重心和画面风格，主体/场景/文案信息按复刻要求替换，避免和其他原图的画面内容混在一起。`;
}

function buildMaterialText(source: CanvasNodeData) {
    const tags = (source.metadata?.sourceTags || [])
        .map((tag) => `#${tag.replace(/^#+/, "")}`)
        .filter((tag) => tag.length > 1)
        .join(" ");
    return [source.metadata?.sourceTitle, source.metadata?.sourceText, tags]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join("\n\n");
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
