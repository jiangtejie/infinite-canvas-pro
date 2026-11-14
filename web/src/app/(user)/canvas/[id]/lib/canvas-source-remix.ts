import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { pruneSourceDerivedNodes, sourceMaterialSignature } from "./canvas-source-plan";

/**
 * 素材源复刻的唯一语义归属：节点 ID 约定、定位、策划提示词、策划解析、
 * 复刻文案/策划/配图建图与比例选尺寸、配图生成门禁。
 * 素材展开建图与派生节点清理在 canvas-source-plan，本模块单向依赖它，不反向被它依赖。
 */

const REMIX_IMAGE_SUFFIX = "-remix-image-";
const REMIX_TEXT_SUFFIX = "-remix-text";
const REMIX_PLAN_SUFFIX = "-remix-plan";
const MATERIAL_IMAGE_SUFFIX = "-material-image-";
const MATERIAL_TEXT_SUFFIX = "-material-text";

const REMIX_GAP = 96;
const REMIX_TEXT_SIZE = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
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

export const SOURCE_REMIX_PLAN_PROMPT = `你要为一组图文做复刻策划。上游是新文案；如果附有图片，那是这组图的原始配图，按原图顺序排列，第 1 张对应 images[0]。先把整组图当成一个整体读懂，再逐张产出新配图提示词。

第一步，判断整组图的关系：同一界面的连续截图、步骤递进、前后对比、并列清单还是总分结构。据此定下叙事顺序和每张图的职责（钩子 / 展开 / 结果）。

第二步，提取必须跨图完全一致的视觉锚点：界面或场景类型、同一主体的外观（头像、昵称、名称、配色、字体、圆角、状态栏、气泡或卡片样式）、版式网格、文字区位置、色调与光线。这些是整组图的身份，任何一张改了整组就散。

第三步，逐张提取并重写图内文字。图内文字是这类图的信息主体：标题、对话气泡、步骤编号、标注、按钮文案都要重写，服务于新文案，并且跨图连贯——同一段对话的多次截图必须接得上，步骤编号必须连续，不能各写各的。文字要短、字号大、位置明确，不要长段落，生图模型渲染不好密集中文。

只输出 JSON，不要解释，不要 markdown 代码块：
{"shared":"整组共同设定，150字以内，写清视觉锚点与统一风格","images":["第1张提示词","第2张提示词"]}

images 条数必须与原图张数完全一致。每条只写本张的差异：承担的职责、画面内容、图内文字的确切内容与位置，不要重复 shared 已有的设定。参考图只用于版式与风格，画面内容按新文案替换，不要照抄原图文字。`;

export type SourceRemixPlan = {
    shared: string;
    images: string[];
};

export type SourceRemixScaffold = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    copyNodeId: string;
    planNodeId: string;
    imageNodeIds: string[];
    planPrompt: string;
    sourceSignature: string;
};

function connection(fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId };
}

/** 素材展开后的真实节点：复刻骨架按它们的实际右边界排布，不重算素材布局常量。 */
export function collectSourceMaterialNodes(nodes: CanvasNodeData[], sourceId: string) {
    const materialImages = nodes
        .filter((node) => node.id.startsWith(`${sourceId}${MATERIAL_IMAGE_SUFFIX}`) && isCanvasImageNodeType(node.type))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const materialText = nodes.find((node) => node.id === `${sourceId}${MATERIAL_TEXT_SUFFIX}` && node.type === CanvasNodeType.Text);
    return { materialText, materialImages };
}

export function findSourceRemixTextNode(nodes: CanvasNodeData[], sourceId: string) {
    if (!sourceId) return undefined;
    const id = `${sourceId}${REMIX_TEXT_SUFFIX}`;
    return nodes.find((node) => node.id === id && node.type === CanvasNodeType.Text);
}

export function findSourceRemixPlanNode(nodes: CanvasNodeData[], sourceId: string) {
    if (!sourceId) return undefined;
    const id = `${sourceId}${REMIX_PLAN_SUFFIX}`;
    return nodes.find((node) => node.id === id && node.type === CanvasNodeType.Text);
}

/**
 * 复刻配图节点：优先按 `${sourceId}-remix-image-` 前缀识别（含批量组根节点）；
 * 复制/粘贴后 ID 变化时退回 metadata.remixIndex 识别，顺序按 remixIndex 升序。
 * 组内归属只看 ID/remixIndex，不看 isBatchRoot：用户手动把某张按多结果原地生成后
 * 它仍是本组的一个槽位，发布与门禁都不能少算它；能否入批量队列由 canvas-batch 另行判定。
 */
export function collectRemixImageNodeIds(nodes: CanvasNodeData[], sourceId: string): string[] {
    if (!sourceId) return [];
    const prefixed = nodes.filter((node) => isCanvasImageNodeType(node.type) && node.id.startsWith(`${sourceId}${REMIX_IMAGE_SUFFIX}`));
    const candidates = prefixed.length
        ? prefixed
        : nodes.filter((node) => isCanvasImageNodeType(node.type) && node.metadata?.remixSourceId === sourceId && typeof node.metadata?.remixIndex === "number");
    return candidates
        .map((node, index) => ({ node, index }))
        .sort((a, b) => (a.node.metadata?.remixIndex ?? Number.MAX_SAFE_INTEGER) - (b.node.metadata?.remixIndex ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
        .map(({ node }) => node.id);
}

/** 已成功生成内容的复刻配图，用于发布节点选图。 */
export function collectPublishableRemixImages(nodes: CanvasNodeData[], sourceId: string) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return collectRemixImageNodeIds(nodes, sourceId)
        .map((nodeId) => byId.get(nodeId))
        .filter((node): node is CanvasNodeData => Boolean(node && (node.metadata?.content || "").trim()));
}

/** 文案是否已生成内容；策划与配图都以它为前置条件。 */
export function hasSourceRemixText(node: CanvasNodeData | undefined) {
    return Boolean(node && (node.metadata?.content || "").trim());
}

/**
 * 建复刻骨架并并入画布：复刻文案（正文由 Agent 直接写入）→ 策划（读新文案 + 全部原图）→ 一张原图对应一张配图。
 * 同 ID 节点复用，配图保留已生成内容；策划正文与配图提示词清空，必须等本次策划写回后才允许生成。
 */
export function planSourceRemix({ source, nodes: currentNodes, connections: currentConnections, copy, instruction }: {
    source: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    copy: string;
    instruction?: string;
}): SourceRemixScaffold {
    const { materialText, materialImages } = collectSourceMaterialNodes(currentNodes, source.id);
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const materialRight = [materialText, ...materialImages].reduce((right, node) => Math.max(right, node ? node.position.x + node.width : 0), source.position.x + source.width);
    const originX = materialRight + REMIX_GAP;
    const sourceSignature = sourceMaterialSignature(source);
    const planPrompt = instruction?.trim() ? `${SOURCE_REMIX_PLAN_PROMPT}\n\n本次修改要求：${instruction.trim()}` : SOURCE_REMIX_PLAN_PROMPT;

    const copyNodeId = `${source.id}${REMIX_TEXT_SUFFIX}`;
    nodes.push({
        id: copyNodeId,
        type: CanvasNodeType.Text,
        title: "复刻文案",
        position: { x: originX, y: source.position.y },
        width: REMIX_TEXT_SIZE.width,
        height: REMIX_TEXT_SIZE.height,
        metadata: { content: copy, status: "success", fontSize: 14 },
    });
    // 复刻文案只引用原文：多数文本模型不读图，连图会直接报错；读整组图交给策划节点。
    if (materialText) connections.push(connection(materialText.id, copyNodeId));

    const planNodeId = `${source.id}${REMIX_PLAN_SUFFIX}`;
    const planX = originX + REMIX_TEXT_SIZE.width + REMIX_GAP;
    nodes.push({
        id: planNodeId,
        type: CanvasNodeType.Text,
        title: "复刻策划",
        position: { x: planX, y: source.position.y },
        width: REMIX_TEXT_SIZE.width,
        height: REMIX_TEXT_SIZE.height,
        metadata: { prompt: planPrompt, status: "idle", remixSourceSignature: undefined },
    });
    connections.push(connection(copyNodeId, planNodeId));
    for (const materialImage of materialImages) connections.push(connection(materialImage.id, planNodeId));

    // 一张原图对应一张复刻图：不要把多张原图全塞给一个图片节点当参考，
    // 否则生成结果和原图顺序对不上，也无法逐张替换/发布。
    const imageCount = materialImages.length || 1;
    const imagesX = planX + REMIX_TEXT_SIZE.width + REMIX_GAP;
    const imageNodeIds: string[] = [];
    for (let index = 0; index < imageCount; index++) {
        const imageNodeId = `${source.id}${REMIX_IMAGE_SUFFIX}${index}`;
        const column = index % REMIX_IMAGE_COLUMNS;
        const row = Math.floor(index / REMIX_IMAGE_COLUMNS);
        const materialImage = materialImages[index];
        const width = materialImage?.metadata?.naturalWidth;
        const height = materialImage?.metadata?.naturalHeight;
        const nodeSize = fitRemixImageSize(width, height);
        const generationSize = chooseRemixGenerationSize(width, height);
        nodes.push({
            id: imageNodeId,
            type: CanvasNodeType.Image,
            title: imageCount > 1 ? `复刻配图 ${index + 1}` : "复刻配图",
            position: {
                x: imagesX + column * (REMIX_IMAGE_CELL.width + REMIX_IMAGE_GAP),
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
                naturalWidth: width,
                naturalHeight: height,
            },
        });
        // 复刻文案是抖音正文，不作为配图提示词；配图只参考对应原图。
        if (materialImage) connections.push(connection(materialImage.id, imageNodeId));
        imageNodeIds.push(imageNodeId);
    }

    const scaffoldIds = new Set(nodes.map((node) => node.id));
    const prune = pruneSourceDerivedNodes(source, currentNodes, currentConnections,
        (node) => node.id.startsWith(`${source.id}${REMIX_IMAGE_SUFFIX}`) && !scaffoldIds.has(node.id));
    const plannedById = new Map(nodes.map((node) => [node.id, node]));
    const existingIds = new Set(prune.nodes.map((node) => node.id));
    const nextNodes = prune.nodes
        .map((node): CanvasNodeData => {
            const planned = plannedById.get(node.id);
            if (!planned) return node;
            if (node.id === copyNodeId) return { ...node, metadata: { ...node.metadata, content: copy, status: "success", errorDetails: undefined } };
            if (node.id === planNodeId) return { ...node, title: planned.title, metadata: { ...node.metadata, prompt: planPrompt, content: "", status: "idle", errorDetails: undefined, remixSourceSignature: undefined } };
            return {
                ...node,
                title: planned.title,
                width: planned.width,
                height: planned.height,
                metadata: {
                    ...node.metadata,
                    prompt: "",
                    size: node.metadata?.size || planned.metadata?.size,
                    naturalWidth: planned.metadata?.naturalWidth,
                    naturalHeight: planned.metadata?.naturalHeight,
                    remixIndex: planned.metadata?.remixIndex,
                    remixSourceId: planned.metadata?.remixSourceId,
                },
            };
        })
        .concat(nodes.filter((node) => !existingIds.has(node.id)));
    const existingPairs = new Set(prune.connections.map((item) => `${item.fromNodeId}->${item.toNodeId}`));
    const nextConnections = prune.connections.concat(connections.filter((item) => !existingPairs.has(`${item.fromNodeId}->${item.toNodeId}`)));
    return { nodes: nextNodes, connections: nextConnections, copyNodeId, planNodeId, imageNodeIds, planPrompt, sourceSignature };
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

/** 策划节点输出的是模型生成的 JSON：整组共同设定 + 按原图顺序的逐张提示词。 */
export async function parseSourceRemixPlan(text: string, count: number): Promise<SourceRemixPlan> {
    const { jsonrepair } = await import("jsonrepair");
    const parsed = JSON.parse(jsonrepair(text)) as { shared?: unknown; images?: unknown };
    const shared = typeof parsed.shared === "string" ? parsed.shared.trim() : "";
    const images = Array.isArray(parsed.images)
        ? parsed.images.map((item) => (typeof item === "string" ? item.trim() : ""))
        : [];
    if (!shared || images.length !== count || images.some((item) => !item)) throw new Error("策划输出不完整，请重新生成策划");
    return { shared, images };
}

/** 每张配图拿到的是「整组共同设定 + 本张差异」，生图调用彼此独立，提示词必须自包含。 */
export function remixImagePromptFromPlan(plan: SourceRemixPlan, index: number) {
    return `${plan.shared}\n\n${plan.images[index]}`;
}

export function applySourceRemixPlan(nodes: CanvasNodeData[], imageIds: string[], plan: SourceRemixPlan): CanvasNodeData[] {
    const promptById = new Map(imageIds.map((id, index) => [id, remixImagePromptFromPlan(plan, index)]));
    return nodes.map((node) => promptById.has(node.id)
        ? { ...node, metadata: { ...node.metadata, prompt: promptById.get(node.id) } }
        : node);
}

/** 配图生成门禁：策划必须已产出正文，且每张配图都已拿到自包含提示词。 */
export function sourceRemixNeedsSync(source: CanvasNodeData, nodes: CanvasNodeData[]) {
    const planNode = findSourceRemixPlanNode(nodes, source.id);
    return planNode?.metadata?.status === "success"
        && Boolean(planNode.metadata.content)
        && planNode.metadata.remixSourceSignature !== sourceMaterialSignature(source);
}

export function sourceRemixImagesReady(nodes: CanvasNodeData[], sourceId: string) {
    const source = nodes.find((node) => node.id === sourceId && node.type === CanvasNodeType.Source);
    const planNode = findSourceRemixPlanNode(nodes, sourceId);
    if (!source || planNode?.metadata?.status !== "success" || !hasSourceRemixText(planNode) || planNode.metadata?.remixSourceSignature !== sourceMaterialSignature(source)) return false;
    const imageIds = collectRemixImageNodeIds(nodes, sourceId);
    if (!imageIds.length) return false;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return imageIds.every((id) => Boolean((byId.get(id)?.metadata?.prompt || "").trim()));
}