import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../../types";

export type CanvasSourcePlan = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    sourcePatch: Partial<CanvasNodeMetadata>;
};

export const SOURCE_REMIX_TEXT_PROMPT =
    "参考上游原文，写一篇同结构、同传播逻辑但完全原创的图文文案。要求：保留开头钩子和情绪节奏，换掉具体例子与措辞；标题不超过20字；正文口语化、短句；话题3-5个且不带#；不要照抄原句，不要写联系方式或绝对化用语。";

export const SOURCE_REMIX_PLAN_PROMPT = `你要为一组图文做复刻策划。上游是新文案；如果附有图片，那是这组图的原始配图，按原图顺序排列，第 1 张对应 images[0]。先把整组图当成一个整体读懂，再逐张产出新配图提示词。

第一步，判断整组图的关系：同一界面的连续截图、步骤递进、前后对比、并列清单还是总分结构。据此定下叙事顺序和每张图的职责（钩子 / 展开 / 结果）。

第二步，提取必须跨图完全一致的视觉锚点：界面或场景类型、同一主体的外观（头像、昵称、名称、配色、字体、圆角、状态栏、气泡或卡片样式）、版式网格、文字区位置、色调与光线。这些是整组图的身份，任何一张改了整组就散。

第三步，逐张提取并重写图内文字。图内文字是这类图的信息主体：标题、对话气泡、步骤编号、标注、按钮文案都要重写，服务于新文案，并且跨图连贯——同一段对话的多次截图必须接得上，步骤编号必须连续，不能各写各的。文字要短、字号大、位置明确，不要长段落，生图模型渲染不好密集中文。

只输出 JSON，不要解释，不要 markdown 代码块：
{"shared":"整组共同设定，150字以内，写清视觉锚点与统一风格","images":["第1张提示词","第2张提示词"]}

images 条数必须与原图张数完全一致。每条只写本张的差异：承担的职责、画面内容、图内文字的确切内容与位置，不要重复 shared 已有的设定。参考图只用于版式与风格，画面内容按新文案替换，不要照抄原图文字。`;

const MATERIAL_GAP = 96;
const MATERIAL_TEXT_SIZE = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
const MATERIAL_IMAGE_MAX_WIDTH = 320;
const MATERIAL_IMAGE_MAX_HEIGHT = 260;
const MATERIAL_IMAGE_FALLBACK_SIZE = { width: 320, height: 240 };
const MATERIAL_IMAGE_COLUMNS = 2;
const MATERIAL_IMAGE_GRID_GAP = 20;
const MATERIAL_IMAGE_CELL_HEIGHT = 260;
const MATERIAL_IMAGE_COLUMN_STAGGER = 18;
const REMIX_IMAGE_CELL = { width: 320, height: 400 };
const REMIX_IMAGE_MAX_WIDTH = 320;
const REMIX_IMAGE_MAX_HEIGHT = 400;
const REMIX_IMAGE_COLUMNS = 2;
const REMIX_IMAGE_GAP = 20;
const REMIX_IMAGE_COLUMN_STAGGER = 18;

/** 常见图片比例对应的标准生成尺寸，按比例最接近的匹配，避免模型收到不支持的自定义尺寸。 */
const REMIX_GENERATION_SIZES = [
    { size: "1024x1024", ratio: 1 },
    { size: "1536x1024", ratio: 3 / 2 },
    { size: "1024x1536", ratio: 2 / 3 },
    { size: "1024x768", ratio: 4 / 3 },
    { size: "768x1024", ratio: 3 / 4 },
    { size: "1024x1280", ratio: 4 / 5 },
    { size: "1280x1024", ratio: 5 / 4 },
    { size: "1920x1080", ratio: 16 / 9 },
    { size: "1080x1920", ratio: 9 / 16 },
    { size: "1568x672", ratio: 21 / 9 },
];

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
    // 复刻文案只引用原文：多数文本模型不读图，连图会直接报错；读整组图交给策划节点。
    if (materialText) connections.push(connection(materialTextId, remixTextId));

    // 策划读新文案 + 全部原图，产出整组共同设定与逐张提示词，配图提示词由它写入。
    const remixPlanId = `${source.id}-remix-plan`;
    const remixPlanPosition = { x: remixTextPosition.x + MATERIAL_TEXT_SIZE.width + MATERIAL_GAP, y: source.position.y };
    nodes.push({
        id: remixPlanId,
        type: CanvasNodeType.Text,
        title: "复刻策划",
        position: remixPlanPosition,
        width: MATERIAL_TEXT_SIZE.width,
        height: MATERIAL_TEXT_SIZE.height,
        metadata: { prompt: SOURCE_REMIX_PLAN_PROMPT, status: "idle" },
    });
    connections.push(connection(remixTextId, remixPlanId));
    for (const materialImageId of materialImageIds) connections.push(connection(materialImageId, remixPlanId));

    // 一张原图对应一张复刻图：不要把多张原图全塞给一个图片节点当参考，
    // 否则生成结果和原图顺序对不上，也无法逐张替换/发布。
    const remixImageCount = materialImageIds.length || 1;
    const remixImagesX = remixPlanPosition.x + MATERIAL_TEXT_SIZE.width + MATERIAL_GAP;
    for (let index = 0; index < remixImageCount; index++) {
        const remixImageId = `${source.id}-remix-image-${index}`;
        const column = index % REMIX_IMAGE_COLUMNS;
        const row = Math.floor(index / REMIX_IMAGE_COLUMNS);
        const materialImage = materialImages[index];
        const nodeSize = fitRemixImageSize(materialImage?.width, materialImage?.height);
        const generationSize = chooseRemixGenerationSize(materialImage?.width, materialImage?.height);
        nodes.push({
            id: remixImageId,
            type: CanvasNodeType.Image,
            title: remixImageCount > 1 ? `复刻配图 ${index + 1}` : "复刻配图",
            position: {
                x: remixImagesX + column * (REMIX_IMAGE_CELL.width + REMIX_IMAGE_GAP),
                y: source.position.y + row * (REMIX_IMAGE_CELL.height + REMIX_IMAGE_GAP) + (column > 0 ? REMIX_IMAGE_COLUMN_STAGGER : 0),
            },
            width: nodeSize.width,
            height: nodeSize.height,
            metadata: {
                prompt: "",
                status: "idle",
                remixIndex: index + 1,
                remixSourceId: source.id,
                ...(generationSize ? { size: generationSize } : {}),
                naturalWidth: materialImage?.width,
                naturalHeight: materialImage?.height,
            },
        });
        // 复刻文案是抖音正文，不作为配图提示词；配图只参考对应原图。
        const materialImageId = materialImageIds[index];
        if (materialImageId) connections.push(connection(materialImageId, remixImageId));
    }

    return { nodes, connections, sourcePatch };
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

function fitRemixImageSize(width?: number, height?: number) {
    if (!width || !height || width <= 0 || height <= 0) return { width: REMIX_IMAGE_MAX_WIDTH, height: REMIX_IMAGE_MAX_HEIGHT };
    const scale = Math.min(1, REMIX_IMAGE_MAX_WIDTH / width, REMIX_IMAGE_MAX_HEIGHT / height);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function chooseRemixGenerationSize(width?: number, height?: number) {
    if (!width || !height || width <= 0 || height <= 0) return "";
    const ratio = width / height;
    return REMIX_GENERATION_SIZES.reduce((best, current) => Math.abs(current.ratio - ratio) < Math.abs(best.ratio - ratio) ? current : best).size;
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
