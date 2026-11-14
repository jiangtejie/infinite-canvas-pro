import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import type { RemixInput, RemixRun, SourceRemixPlan } from "../../remix-types";
import { REMIX_CORE_VERSION } from "../../remix-policy";
import { sourceMaterialSignature } from "./canvas-source-plan";

export function collectSourceMaterialNodes(nodes: CanvasNodeData[], sourceId: string) {
    return {
        materialText: nodes.find((node) => node.id === `${sourceId}-material-text` && node.type === CanvasNodeType.Text),
        materialImages: nodes.filter((node) => node.id.startsWith(`${sourceId}-material-image-`) && node.type === CanvasNodeType.Image).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    };
}

export function findSourceRemixPlanNode(nodes: CanvasNodeData[], sourceId: string) {
    return nodes.findLast((node) => node.metadata?.remixRole === "plan" && node.metadata.remixSourceId === sourceId);
}
export function findRemixRunNode(nodes: CanvasNodeData[], runId: string) {
    return nodes.find((node) => node.metadata?.remixRun?.id === runId && node.metadata.remixRole === "plan");
}
export function findSourceRemixTextNode(nodes: CanvasNodeData[], runId: string) {
    return nodes.find((node) => node.metadata?.remixRunId === runId && node.metadata.remixRole === "copy");
}
export function collectRemixImageNodeIds(nodes: CanvasNodeData[], runId: string) {
    return nodes.filter((node) => node.type === CanvasNodeType.Image && node.metadata?.remixRunId === runId && node.metadata.remixRole === "image")
        .sort((a, b) => (a.metadata?.remixIndex || 0) - (b.metadata?.remixIndex || 0)).map((node) => node.id);
}
export function collectPublishableRemixImages(nodes: CanvasNodeData[], runId: string) {
    const ids = new Set(collectRemixImageNodeIds(nodes, runId));
    return nodes.filter((node) => ids.has(node.id) && node.metadata?.status === "success" && Boolean(node.metadata.content?.trim()))
        .sort((a, b) => (a.metadata?.remixIndex || 0) - (b.metadata?.remixIndex || 0));
}
export function hasSourceRemixText(node: CanvasNodeData | undefined) {
    return Boolean(node?.metadata?.content?.trim());
}
export function remixCopyText(plan: SourceRemixPlan) {
    return [plan.copy.title, plan.copy.body, plan.copy.tags.map((tag) => `#${tag}`).join(" ")].join("\n\n");
}
export function remixImagePromptFromPlan(plan: SourceRemixPlan, index: number, input: RemixInput) {
    const image = plan.visual.images[index];
    const offset = input.sourceImages.length ? 2 : 1;
    const references = image.referenceAssetIds.map((id, i) => {
        const asset = input.marketing?.assets.find((item) => item.assetId === id)!;
        return `图片${i + offset}：${asset.title}（${asset.role}），保持真实外观与品牌身份`;
    });
    return [plan.visual.sharedAnchors.join("\n"), image.prompt, input.sourceImages.length ? "图片1仅参考原图的版式与结构，主体和文字以本策划为准。" : "", ...references].filter(Boolean).join("\n\n");
}
export function formatRemixPlan(plan: SourceRemixPlan) {
    return [`结构：${plan.sourcePattern.type}`, `保留：${plan.sourcePattern.preserve.join("；")}`, `植入：${plan.marketingPlacement.reason}`, `引导：${plan.marketingPlacement.cta || "无"}`, "", ...plan.visual.images.map((image, index) => `第${index + 1}张 · ${image.role}\n${image.prompt}`)].join("\n\n");
}

const SIZES = [["1024x1024", 1], ["1536x1024", 1.5], ["1024x1536", 2 / 3], ["1024x768", 4 / 3], ["768x1024", 3 / 4], ["1024x1280", 4 / 5], ["1280x1024", 5 / 4], ["1920x1080", 16 / 9], ["1080x1920", 9 / 16]] as const;
function imageSize(width = 1024, height = 768) {
    const scale = Math.min(1, 320 / width, 400 / height);
    const ratio = width / height;
    return { width: Math.round(width * scale), height: Math.round(height * scale), size: SIZES.reduce((best, current) => Math.abs(current[1] - ratio) < Math.abs(best[1] - ratio) ? current : best)[0] };
}

export function planSourceRemix({ source, nodes, connections, run }: { source: CanvasNodeData; nodes: CanvasNodeData[]; connections: CanvasConnection[]; run: RemixRun }) {
    const material = collectSourceMaterialNodes(nodes, source.id);
    const materialRight = [source, material.materialText, ...material.materialImages].reduce((right, node) => Math.max(right, node ? node.position.x + node.width : 0), 0);
    const previous = nodes.filter((node) => node.metadata?.remixSourceId === source.id);
    const top = previous.length ? Math.max(...previous.map((node) => node.position.y + node.height)) + 100 : source.position.y;
    const prefix = `${source.id}-remix-${run.id}`;
    const planNodeId = `${prefix}-plan`;
    const copyNodeId = `${prefix}-copy`;
    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
    const base = { remixSourceId: source.id, remixRunId: run.id };
    const additions: CanvasNodeData[] = [
        { id: planNodeId, type: CanvasNodeType.Text, ...spec, title: "复刻策划", position: { x: materialRight + 96, y: top }, metadata: { ...base, remixRole: "plan", remixRun: run, content: "正在准备组级策划", status: "idle", fontSize: 14 } },
        { id: copyNodeId, type: CanvasNodeType.Text, ...spec, title: "复刻文案", position: { x: materialRight + spec.width + 192, y: top }, metadata: { ...base, remixRole: "copy", content: "", status: "idle", fontSize: 14 } },
    ];
    const edge = (fromNodeId: string, toNodeId: string): CanvasConnection => ({ id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId });
    // 运行主链：素材源 → 策划 → 文案 / 配图；配图的参考图数据边在 applySourceRemixPlan 里补齐。
    const newConnections = [edge(source.id, planNodeId), edge(planNodeId, copyNodeId)];
    const imageNodeIds: string[] = [];
    for (let index = 0; index < Math.max(1, run.input.sourceImages.length); index++) {
        const original = run.input.sourceImages[index];
        const size = imageSize(original?.width, original?.height);
        const id = `${prefix}-image-${index}`;
        imageNodeIds.push(id);
        additions.push({ id, type: CanvasNodeType.Image, title: `复刻配图 ${index + 1}`, position: { x: materialRight + spec.width * 2 + 288 + index % 2 * 340, y: top + Math.floor(index / 2) * 440 }, width: size.width, height: size.height, metadata: { ...base, remixRole: "image", remixIndex: index + 1, prompt: "", size: size.size, count: 1, status: "idle" } });
        newConnections.push(edge(planNodeId, id));
    }
    for (const [index, asset] of (run.input.marketing?.assets || []).entries()) {
        const serverObject = asset.storageKey.startsWith("server:") && !asset.storageKey.startsWith("server:webdav:");
        additions.push({ id: `${prefix}-reference-${index}`, type: CanvasNodeType.Image, title: asset.title, position: { x: materialRight + 96 + index % 2 * 240, y: top + spec.height + 80 + Math.floor(index / 2) * 220 }, width: 220, height: asset.width && asset.height ? Math.min(200, 220 * asset.height / asset.width) : 180, metadata: { ...base, remixRole: "reference", marketingAssetId: asset.assetId, content: serverObject ? `/api/files/${encodeURIComponent(asset.storageKey.slice("server:".length))}/content` : "", storageKey: asset.storageKey, naturalWidth: asset.width, naturalHeight: asset.height, mimeType: asset.mimeType, status: "success" } });
    }
    return { nodes: [...nodes, ...additions], connections: [...connections, ...newConnections], planNodeId, copyNodeId, imageNodeIds };
}

export function applySourceRemixPlan(nodes: CanvasNodeData[], connections: CanvasConnection[], runId: string, plan: SourceRemixPlan) {
    const planNode = findRemixRunNode(nodes, runId);
    const run = planNode?.metadata?.remixRun;
    if (!run) throw new Error("复刻运行记录已不存在");
    const planNodeId = planNode!.id;
    const imageIds = collectRemixImageNodeIds(nodes, runId);
    const affectedIds = new Set(imageIds);
    // 重建参考图数据边时保留策划 → 配图的结构边。
    const nextConnections = connections.filter((edge) => !affectedIds.has(edge.toNodeId) || edge.fromNodeId === planNodeId);
    plan.visual.images.forEach((image, index) => {
        const referenceIds = [image.sourceImageId, ...image.referenceAssetIds.map((id) => nodes.find((node) => node.metadata?.remixRunId === runId && node.metadata.marketingAssetId === id && node.metadata.remixRole === "reference")?.id || "")].filter(Boolean);
        referenceIds.forEach((fromNodeId) => nextConnections.push({ id: `${fromNodeId}->${imageIds[index]}`, fromNodeId, toNodeId: imageIds[index] }));
        if (!nextConnections.some((edge) => edge.fromNodeId === planNodeId && edge.toNodeId === imageIds[index])) {
            nextConnections.push({ id: `${planNodeId}->${imageIds[index]}`, fromNodeId: planNodeId, toNodeId: imageIds[index] });
        }
    });
    const copyNode = findSourceRemixTextNode(nodes, runId);
    if (copyNode && !nextConnections.some((edge) => edge.fromNodeId === planNodeId && edge.toNodeId === copyNode.id)) {
        nextConnections.push({ id: `${planNodeId}->${copyNode.id}`, fromNodeId: planNodeId, toNodeId: copyNode.id });
    }
    return {
        nodes: nodes.map((node): CanvasNodeData => {
            if (node.metadata?.remixRunId !== runId) return node;
            if (node.metadata.remixRole === "plan") return { ...node, metadata: { ...node.metadata, content: formatRemixPlan(plan), status: "success", remixRun: { ...run, plan, approvedKey: undefined, error: undefined } } };
            if (node.metadata.remixRole === "copy") return { ...node, metadata: { ...node.metadata, content: remixCopyText(plan), status: "success" } };
            const index = imageIds.indexOf(node.id);
            return index < 0 ? node : { ...node, metadata: { ...node.metadata, prompt: remixImagePromptFromPlan(plan, index, run.input) } };
        }), connections: nextConnections,
    };
}

function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function text(value: unknown, name: string, max = 12000): string {
    if (typeof value !== "string" || !value.trim() || Array.from(value).length > max) throw new Error(`策划 ${name} 缺失或过长`);
    return value.trim();
}
function strings(value: unknown, name: string, empty = false): string[] {
    if (!Array.isArray(value) || (!empty && !value.length) || value.length > 100) throw new Error(`策划 ${name} 必须为数组`);
    return value.map((item) => text(item, name, 4000));
}
export async function parseSourceRemixPlan(raw: string, input: RemixInput): Promise<SourceRemixPlan> {
    const { jsonrepair } = await import("jsonrepair");
    const value: unknown = JSON.parse(jsonrepair(raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")));
    return validateSourceRemixPlan(value, input);
}
export function validateSourceRemixPlan(value: unknown, input: RemixInput): SourceRemixPlan {
    if (!record(value) || value.schemaVersion !== 1 || !record(value.copy) || !record(value.sourcePattern) || !record(value.marketingPlacement) || !record(value.visual)) throw new Error("策划输出结构不完整");
    const title = text(value.copy.title, "标题", 20);
    const body = text(value.copy.body, "正文", 2000);
    const tags = strings(value.copy.tags, "话题", true);
    if (tags.length > 5 || new Set(tags).size !== tags.length || tags.some((tag) => /[#\s]/.test(tag))) throw new Error("策划话题最多 5 个，不能重复或包含 # 与空白");
    const mode = input.settings.mode === "content" ? "content" : input.settings.placement;
    if (value.marketingPlacement.mode !== mode || typeof value.marketingPlacement.cta !== "string") throw new Error("策划植入方式与本次设置不一致");
    const assetIds = new Set(input.marketing?.assets.map((asset) => asset.assetId) || []);
    if (!Array.isArray(value.visual.images) || value.visual.images.length !== Math.max(1, input.sourceImages.length)) throw new Error("策划配图数量与原图不一致");
    const images = value.visual.images.map((item, index) => {
        if (!record(item) || item.sourceImageId !== (input.sourceImages[index]?.nodeId || "")) throw new Error("策划原图顺序或编号不匹配");
        const refs = strings(item.referenceAssetIds, "图片引用", true);
        if (new Set(refs).size !== refs.length || refs.some((id) => !assetIds.has(id))) throw new Error("策划引用了未选中的营销图片");
        return { sourceImageId: item.sourceImageId as string, role: text(item.role, "图片职责", 300), prompt: text(item.prompt, "图片提示词"), referenceAssetIds: refs };
    });
    const factIds = new Set(input.marketing?.facts.map((fact) => fact.id) || []);
    if (!Array.isArray(value.factsUsed)) throw new Error("策划缺少事实使用说明");
    const usedIds = new Set<string>();
    const factsUsed = value.factsUsed.map((item) => {
        if (!record(item) || typeof item.factId !== "string" || !factIds.has(item.factId) || usedIds.has(item.factId)) throw new Error("策划引用了未知或重复的事实");
        usedIds.add(item.factId);
        const usedIn = strings(item.usedIn, "事实位置");
        if (usedIn.some((path) => !["copy.title", "copy.body", "marketingPlacement.cta", ...images.map((_, index) => `images[${index}]`)].includes(path))) throw new Error("策划事实位置无效");
        return { factId: item.factId, usedIn };
    });
    const plan: SourceRemixPlan = { schemaVersion: 1, sourcePattern: { type: text(value.sourcePattern.type, "内容结构", 300), preserve: strings(value.sourcePattern.preserve, "保留特征") }, copy: { title, body, tags }, marketingPlacement: { mode, reason: text(value.marketingPlacement.reason, "植入说明", 2000), cta: value.marketingPlacement.cta.trim() }, factsUsed, visual: { sharedAnchors: strings(value.visual.sharedAnchors, "共同视觉锚点"), images } };
    const output = [title, body, plan.marketingPlacement.cta, ...images.map((image) => image.prompt)].join("\n");
    if (input.marketing?.forbidden.some((word) => word.trim() && output.includes(word))) throw new Error("策划包含资料中明确禁止的表述，请重新策划");
    return plan;
}

export function remixApprovalKey(run: RemixRun) {
    return JSON.stringify([run.input.sourceSignature, run.input.marketingKey, run.input.skills, run.input.settings, run.input.coreVersion, run.plan]);
}

export function assertRemixRunStructure(nodes: CanvasNodeData[], connections: CanvasConnection[], runId: string): RemixRun {
    const planNode = findRemixRunNode(nodes, runId);
    const run = planNode?.metadata?.remixRun;
    if (!run?.plan || planNode?.metadata?.status !== "success") throw new Error("整组策划未完成，请先完成复刻策划");
    if (run.binding !== "active") throw new Error("该复刻来自导入或复制，请重新选择营销资料并创建新策划");
    if (run.input.coreVersion !== REMIX_CORE_VERSION) throw new Error("复刻规则已更新，请重新策划");
    const source = nodes.find((node) => node.id === run.input.sourceNodeId);
    if (!source || sourceMaterialSignature(source) !== run.input.sourceSignature) throw new Error("原素材已变化，请重新策划");
    validateSourceRemixPlan(run.plan, run.input);
    if (planNode.metadata.content !== formatRemixPlan(run.plan) || findSourceRemixTextNode(nodes, runId)?.metadata?.content !== remixCopyText(run.plan)) throw new Error("复刻文案或策划已编辑，请重新策划后审阅");
    const images = collectRemixImageNodeIds(nodes, runId).map((id) => nodes.find((node) => node.id === id)!);
    if (images.length !== run.plan.visual.images.length) throw new Error("复刻配图槽位已变化，请重新策划");
    for (const [index, node] of images.entries()) {
        if (node.metadata?.remixIndex !== index + 1 || node.metadata.isBatchRoot || node.metadata.batchRootId || node.metadata.prompt !== remixImagePromptFromPlan(run.plan, index, run.input)) throw new Error("复刻配图提示词或槽位已变化，请重新策划");
        const image = run.plan.visual.images[index];
        const expected = [image.sourceImageId, ...image.referenceAssetIds.map((id) => {
            const asset = run.input.marketing?.assets.find((entry) => entry.assetId === id)!;
            const reference = nodes.find((entry) => entry.metadata?.remixRunId === runId && entry.metadata.remixRole === "reference" && entry.metadata.marketingAssetId === id);
            if (!reference || reference.metadata?.storageKey !== asset.storageKey) throw new Error("营销图片引用已变化，请重新策划");
            return reference.id;
        })].filter(Boolean);
        // 策划 → 配图是结构边，不参与参考图校验；参考图数据边仍要求完全一致。
        const actual = connections.filter((edge) => edge.toNodeId === node.id && edge.fromNodeId !== planNode?.id).map((edge) => edge.fromNodeId);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("复刻参考图或连线已变化，请重新策划");
        const original = run.input.sourceImages[index];
        if (original) {
            const live = nodes.find((entry) => entry.id === original.nodeId);
            if (!live || (original.storageKey ? live.metadata?.storageKey !== original.storageKey : live.metadata?.content !== original.url)) throw new Error("展开的原图已变化，请重新策划");
        }
    }
    return run;
}

export function sourceRemixNeedsSync(source: CanvasNodeData, nodes: CanvasNodeData[]) {
    const run = findSourceRemixPlanNode(nodes, source.id)?.metadata?.remixRun;
    return Boolean(run?.plan && run.input.sourceSignature !== sourceMaterialSignature(source));
}

export function detachRemixNodes(nodes: CanvasNodeData[]) {
    return nodes.map((node) => node.metadata?.remixRun ? { ...node, metadata: { ...node.metadata, remixRun: { ...node.metadata.remixRun, binding: "detached" as const, approvedKey: undefined } } } : node);
}
