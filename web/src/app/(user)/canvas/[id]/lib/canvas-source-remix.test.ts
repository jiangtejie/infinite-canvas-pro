import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import type { RemixInput, RemixRun, SourceRemixPlan } from "../../remix-types";
import { REMIX_CORE_VERSION } from "../../remix-policy";
import { buildSourceMaterialPlan, sourceMaterialSignature } from "./canvas-source-plan";
import { applySourceRemixPlan, assertRemixRunStructure, collectPublishableRemixImages, collectRemixImageNodeIds, collectSourceMaterialNodes, detachRemixNodes, findRemixRunNode, findSourceRemixTextNode, parseSourceRemixPlan, planSourceRemix, remixApprovalKey, validateSourceRemixPlan } from "./canvas-source-remix";
const source = (): CanvasNodeData => ({ id: "source-1", type: CanvasNodeType.Source, title: "原始攻略", position: { x: 100, y: 200 }, width: 420, height: 300, metadata: { sourceStatus: "success", sourceTitle: "同城周末攻略", sourceText: "第三人称推荐清单", sourceTags: ["周末"], sourceImages: [{ url: "https://example.test/source-1.jpg", storageKey: "server:source-1", width: 1080, height: 1440, mimeType: "image/jpeg" }, { url: "https://example.test/source-2.jpg", storageKey: "server:source-2", width: 1080, height: 1440, mimeType: "image/jpeg" }] } });
function setup() {
    const original = source();
    const expanded = buildSourceMaterialPlan(original);
    const nodes = [original, ...expanded.nodes];
    const input: RemixInput = {
        ownerId: "owner-1", sourceNodeId: original.id, sourceSignature: sourceMaterialSignature(original), sourceText: "第三人称推荐清单", sourceImages: collectSourceMaterialNodes(nodes, original.id).materialImages.map((image) => ({ nodeId: image.id, title: image.title, url: image.metadata?.content || "", storageKey: image.metadata?.storageKey, width: image.metadata?.naturalWidth, height: image.metadata?.naturalHeight, mimeType: image.metadata?.mimeType })),
        settings: { mode: "content", goal: "保留清单结构", placement: "natural", instruction: "", skills: [] }, skills: [], coreVersion: REMIX_CORE_VERSION,
    };
    const run: RemixRun = { id: "run-1", createdAt: "2026-11-14T00:00:00Z", input, binding: "active" };
    return { original, nodes, connections: expanded.connections, input, run };
}
function plan(input: RemixInput): SourceRemixPlan {
    return { schemaVersion: 1, sourcePattern: { type: "第三人称攻略清单", preserve: ["第三人称", "递进顺序"] }, copy: { title: "周末去哪逛", body: "先比较路线，再按位置选择适合的门店。", tags: ["周末攻略"] }, marketingPlacement: { mode: input.settings.mode === "content" ? "content" : input.settings.placement, reason: "保持原有攻略价值", cta: "" }, factsUsed: [], visual: { sharedAnchors: ["浅色攻略卡片", "统一标题栏"], images: input.sourceImages.map((image, index) => ({ sourceImageId: image.nodeId, role: index === 0 ? "开场钩子" : "路线补充", prompt: `第 ${index + 1} 张清晰攻略卡片`, referenceAssetIds: [] })) } };
}

test("a run gets unique nodes, preserves original order and stores a single plan snapshot", () => {
    const state = setup();
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: state.run });
    assert.deepEqual(scaffold.imageNodeIds, ["source-1-remix-run-1-image-0", "source-1-remix-run-1-image-1"]);
    assert.equal(scaffold.nodes.filter((item) => item.metadata?.remixRunId === state.run.id).length, 4);
    assert.equal(findSourceRemixTextNode(scaffold.nodes, state.run.id)?.metadata?.content, "");
    assert.equal(collectRemixImageNodeIds(scaffold.nodes, state.run.id).length, 2);
    const secondRun = planSourceRemix({ source: state.original, nodes: scaffold.nodes, connections: scaffold.connections, run: { ...state.run, id: "run-2" } });
    assert.notEqual(secondRun.planNodeId, scaffold.planNodeId);
});

test("one schema creates the final copy and per-image strategy after parsing", async () => {
    const state = setup();
    const json = JSON.stringify(plan(state.input));
    const parsed = await parseSourceRemixPlan(json, state.input);
    assert.deepEqual(parsed, plan(state.input));
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: state.run });
    const applied = applySourceRemixPlan(scaffold.nodes, scaffold.connections, state.run.id, parsed);
    assert.equal(findSourceRemixTextNode(applied.nodes, state.run.id)?.metadata?.content, "周末去哪逛\n\n先比较路线，再按位置选择适合的门店。\n\n#周末攻略");
    assert.equal(applied.nodes.find((item) => item.id === scaffold.imageNodeIds[0])?.metadata?.prompt, "浅色攻略卡片\n统一标题栏\n\n第 1 张清晰攻略卡片\n\n图片1仅参考原图的版式与结构，主体和文字以本策划为准。");
    assert.deepEqual(applied.connections.filter((edge) => edge.toNodeId === scaffold.imageNodeIds[0]).map((edge) => edge.fromNodeId), ["source-1-material-image-0"]);
    assert.equal(findRemixRunNode(applied.nodes, state.run.id)?.metadata?.remixRun?.plan?.copy.title, "周末去哪逛");
});

test("marketing plan rejects unselected facts, unselected images, wrong placement and malformed lists", () => {
    const state = setup();
    const marketing: RemixInput = { ...state.input, settings: { ...state.input.settings, mode: "marketing", placement: "natural" }, marketing: { selection: { workspaceId: "w", locationId: "l", offeringIds: ["o"] }, workspace: { id: "w", name: "企业", industry: "餐饮" }, brand: { id: "b", name: "品牌" }, location: { id: "l", name: "门店", kind: "store", city: "杭州", district: "西湖", address: "", localContext: "附近写字楼午休客群" }, offerings: [{ id: "o", name: "招牌菜", kind: "product", category: "餐饮", description: "", highlights: "" }], details: [], forbidden: ["闭眼入"], facts: [{ id: "fact-1", label: "价格", value: "38 元", source: "门店菜单", approved: true, validUntil: "" }], assets: [{ assetId: "asset-1", role: "招牌菜主图", title: "招牌菜", storageKey: "server:product", width: 800, height: 800, mimeType: "image/jpeg" }] } };
    const valid = plan(marketing);
    valid.factsUsed = [{ factId: "fact-1", usedIn: ["copy.body"] }];
    assert.equal(validateSourceRemixPlan(valid, marketing).factsUsed.length, 1);
    assert.throws(() => validateSourceRemixPlan({ ...valid, factsUsed: [{ factId: "unknown", usedIn: ["copy.body"] }] }, marketing), /事实/);
    assert.throws(() => validateSourceRemixPlan({ ...valid, marketingPlacement: { ...valid.marketingPlacement, mode: "promotion" } }, marketing), /植入/);
    const badImage = { ...valid, visual: { ...valid.visual, images: valid.visual.images.map((item) => ({ ...item, referenceAssetIds: ["unselected"] })) } };
    assert.throws(() => validateSourceRemixPlan(badImage, marketing), /营销图片/);
    assert.throws(() => validateSourceRemixPlan({ ...valid, copy: { ...valid.copy, body: "这家店闭眼入" } }, marketing), /禁止/);
    assert.throws(() => validateSourceRemixPlan({ ...valid, copy: { ...valid.copy, tags: ["bad topic"] } }, marketing), /话题/);
});

test("marketing references wire reference nodes and number attached images", () => {
    const state = setup();
    const marketing: RemixInput = { ...state.input, settings: { ...state.input.settings, mode: "marketing", placement: "natural" }, marketing: { selection: { workspaceId: "w", locationId: "l", offeringIds: ["o"] }, workspace: { id: "w", name: "企业", industry: "餐饮" }, brand: { id: "b", name: "品牌" }, location: { id: "l", name: "门店", kind: "store", city: "杭州", district: "西湖", address: "", localContext: "" }, offerings: [{ id: "o", name: "招牌菜", kind: "product", category: "餐饮", description: "", highlights: "" }], details: [], forbidden: [], facts: [], assets: [{ assetId: "asset-1", role: "招牌菜主图", title: "招牌菜", storageKey: "server:product", width: 800, height: 800, mimeType: "image/jpeg" }] } };
    const withReference = plan(marketing);
    withReference.visual.images[0]!.referenceAssetIds = ["asset-1"];
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: { ...state.run, input: marketing } });
    const reference = scaffold.nodes.find((node) => node.metadata?.remixRole === "reference");
    assert.equal(reference?.metadata?.content, "/api/files/product/content");
    assert.equal(reference?.metadata?.storageKey, "server:product");
    const applied = applySourceRemixPlan(scaffold.nodes, scaffold.connections, state.run.id, withReference);
    assert.match(applied.nodes.find((node) => node.id === scaffold.imageNodeIds[0])?.metadata?.prompt || "", /图片2：招牌菜/);
    assert.deepEqual(applied.connections.filter((edge) => edge.toNodeId === scaffold.imageNodeIds[0]).map((edge) => edge.fromNodeId), ["source-1-material-image-0", reference!.id]);

    const withoutSource = { ...marketing, sourceImages: [] };
    const emptyScaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: { ...state.run, input: withoutSource } });
    const emptyPlan = { ...plan(withoutSource), visual: { sharedAnchors: ["封面"], images: [{ sourceImageId: "", role: "封面", prompt: "封面", referenceAssetIds: ["asset-1"] }] } };
    const emptyApplied = applySourceRemixPlan(emptyScaffold.nodes, emptyScaffold.connections, state.run.id, emptyPlan);
    assert.match(emptyApplied.nodes.find((node) => node.id === emptyScaffold.imageNodeIds[0])?.metadata?.prompt || "", /图片1：招牌菜/);
});

test("approval requires current source, unchanged text, prompt, references and active binding", () => {
    const state = setup();
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: state.run });
    const applied = applySourceRemixPlan(scaffold.nodes, scaffold.connections, state.run.id, plan(state.input));
    const current = assertRemixRunStructure(applied.nodes, applied.connections, state.run.id);
    const approval = remixApprovalKey(current);
    assert.ok(approval);
    assert.equal(remixApprovalKey({ ...current, approvedKey: approval }), approval);
    assert.deepEqual(collectPublishableRemixImages(applied.nodes, state.run.id), []);
    assert.throws(() => assertRemixRunStructure(applied.nodes.map((item) => item.id === "source-1" ? { ...item, metadata: { ...item.metadata, sourceText: "新的素材" } } : item), applied.connections, state.run.id), /原素材/);
    assert.throws(() => assertRemixRunStructure(applied.nodes.map((item) => item.metadata?.remixRole === "copy" ? { ...item, metadata: { ...item.metadata, content: "被手改的文案" } } : item), applied.connections, state.run.id), /重新策划/);
    assert.throws(() => assertRemixRunStructure(detachRemixNodes(applied.nodes), applied.connections, state.run.id), /导入或复制/);
    const successful = applied.nodes.map((item) => item.metadata?.remixRole === "image" ? { ...item, metadata: { ...item.metadata, content: "blob:generated", status: "success" as const } } : item);
    assert.equal(collectPublishableRemixImages(successful, state.run.id).length, 2);
});
