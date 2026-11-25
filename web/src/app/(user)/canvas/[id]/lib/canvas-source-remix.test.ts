import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import type { RemixInput, RemixRun, SourceRemixPlan } from "../../remix-types";
import { REMIX_CORE_VERSION } from "../../remix-policy";
import { buildSourceMaterialPlan, sourceMaterialSignature } from "./canvas-source-plan";
import { applySourceRemixPlan, assertRemixRunStructure, collectCollapsedRemixNodeIds, collectPublishableRemixImages, collectPublishableRemixRunIds, collectRemixImageNodeIds, collectSourceMaterialNodes, collectSourceRemixHistory, detachRemixNodes, findRemixRunNode, findRemixControlledSourceNode, findSourceRemixTextNode, parseSourceRemixPlan, planSourceRemix, remixApprovalKey, requestRemixPlanWithRepair, validateSourceRemixPlan } from "./canvas-source-remix";
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
function marketingInput(input: RemixInput): RemixInput {
    const fact = { id: "fact-1", label: "价格", value: "38 元", source: "门店菜单", approved: true, validUntil: "", scope: "location" as const, entityId: "l", subject: "门店" };
    return {
        ...input,
        settings: { ...input.settings, mode: "marketing", placement: "natural" },
        marketing: {
            selection: { workspaceId: "w", scope: "offering", brandId: "b", locationId: "l", offeringIds: ["o"] },
            scope: "offering",
            workspace: { id: "w", name: "企业", industry: "餐饮" },
            brand: { id: "b", name: "品牌" },
            location: { id: "l", name: "门店", kind: "store", city: "杭州", district: "西湖", address: "", localContext: "附近写字楼午休客群" },
            offerings: [{ id: "o", name: "招牌菜", kind: "product", category: "餐饮", description: "", highlights: "" }],
            profile: { description: "【门店】附近写字楼午休客群", audience: "", guidance: "" },
            details: [{ scope: "location", entityId: "l", subject: "门店", description: "附近写字楼午休客群", audience: "", guidance: "" }],
            forbidden: ["闭眼入"],
            facts: [fact],
            assets: [{ assetId: "asset-1", role: "招牌菜主图", title: "招牌菜", storageKey: "server:product", width: 800, height: 800, mimeType: "image/jpeg" }],
        },
    };
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
    assert.ok(scaffold.connections.some((edge) => edge.fromNodeId === scaffold.planNodeId && edge.toNodeId === scaffold.copyNodeId));
    assert.ok(scaffold.imageNodeIds.every((imageId) => scaffold.connections.some((edge) => edge.fromNodeId === scaffold.planNodeId && edge.toNodeId === imageId)));
    const secondRun = planSourceRemix({ source: state.original, nodes: scaffold.nodes, connections: scaffold.connections, run: { ...state.run, id: "run-2" } });
    assert.notEqual(secondRun.planNodeId, scaffold.planNodeId);
});

test("复刻历史按创建顺序把最新运行放在前面，并保留旧版本入口", () => {
    const state = setup();
    const first = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: state.run });
    const firstApplied = applySourceRemixPlan(first.nodes, first.connections, state.run.id, { ...plan(state.input), copy: { ...plan(state.input).copy, title: "第一版" } });
    const second = planSourceRemix({ source: state.original, nodes: firstApplied.nodes, connections: firstApplied.connections, run: { ...state.run, id: "run-2", createdAt: "2026-11-15T00:00:00Z" } });
    const secondApplied = applySourceRemixPlan(second.nodes, second.connections, "run-2", { ...plan(state.input), copy: { ...plan(state.input).copy, title: "第二版" } });
    const history = collectSourceRemixHistory(secondApplied.nodes, state.original.id);
    assert.deepEqual(history.map((item) => [item.runId, item.planNodeId, item.title]), [
        ["run-2", second.planNodeId, "第二版"],
        ["run-1", first.planNodeId, "第一版"],
    ]);
    assert.equal(collectSourceRemixHistory(secondApplied.nodes, "other-source").length, 0);
});

test("旧复刻默认收起全部节点，查看历史时展开且不删除数据", () => {
    const state = setup();
    const first = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: state.run });
    const second = planSourceRemix({ source: state.original, nodes: first.nodes, connections: first.connections, run: { ...state.run, id: "run-2" } });
    const collapsed = collectCollapsedRemixNodeIds(second.nodes, null);
    assert.deepEqual([...collapsed].sort(), [first.planNodeId, first.copyNodeId, ...first.imageNodeIds].sort());
    assert.equal(collapsed.has(second.planNodeId), false);
    assert.equal(collectCollapsedRemixNodeIds(second.nodes, state.run.id).size, 0);
    assert.equal(second.nodes.length, first.nodes.length + 4);
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
    assert.deepEqual(applied.connections.filter((edge) => edge.toNodeId === scaffold.imageNodeIds[0]).map((edge) => edge.fromNodeId), [scaffold.planNodeId, "source-1-material-image-0"]);
    assert.equal(findRemixRunNode(applied.nodes, state.run.id)?.metadata?.remixRun?.plan?.copy.title, "周末去哪逛");
    const approved = applied.nodes.map((item) => item.metadata?.remixRun ? { ...item, metadata: { ...item.metadata, remixRun: { ...item.metadata.remixRun, approvedKey: "approved", approval: { id: "approval" } as never, batch: { id: "batch" } as never } } } : item);
    const replanned = applySourceRemixPlan(approved, applied.connections, state.run.id, parsed);
    const cleared = findRemixRunNode(replanned.nodes, state.run.id)?.metadata?.remixRun;
    assert.equal(cleared?.approvedKey, undefined);
    assert.equal(cleared?.approval, undefined);
    assert.equal(cleared?.batch, undefined);
});

test("marketing plan rejects unselected facts, unselected images, wrong placement and malformed lists", () => {
    const state = setup();
    const marketing = marketingInput(state.input);
    const valid = plan(marketing);
    valid.factsUsed = [{ factId: "fact-1", usedIn: ["copy.body"] }];
    assert.equal(validateSourceRemixPlan(valid, marketing).factsUsed.length, 1);
    assert.throws(() => validateSourceRemixPlan({ ...valid, factsUsed: [{ factId: "unknown", usedIn: ["copy.body"] }] }, marketing), /事实/);
    assert.throws(() => validateSourceRemixPlan({ ...valid, marketingPlacement: { ...valid.marketingPlacement, mode: "promotion" } }, marketing), /植入/);
    const badImage = { ...valid, visual: { ...valid.visual, images: valid.visual.images.map((item) => ({ ...item, referenceAssetIds: ["unselected"] })) } };
    assert.throws(() => validateSourceRemixPlan(badImage, marketing), /营销图片/);
    assert.throws(() => validateSourceRemixPlan({ ...valid, copy: { ...valid.copy, body: "这家店闭眼入" } }, marketing), /禁止/);
    assert.deepEqual(validateSourceRemixPlan({ ...valid, copy: { ...valid.copy, tags: ["#周末 攻略", "周末攻略", " ", "a", "b", "c", "d", "e"] } }, marketing).copy.tags, ["周末攻略", "a", "b", "c", "d"]);
});

test("策划校验失败时把错误回传模型修正一次", async () => {
    const state = setup();
    const valid = plan(state.input);
    const invalid = { ...valid, copy: { ...valid.copy, title: "这是一个明显超过二十个字限制的复刻标题需要修正" } };
    const calls: unknown[][] = [];
    const replies = [JSON.stringify(invalid), JSON.stringify(valid)];
    const parsed = await requestRemixPlanWithRepair(state.input, async (repair) => {
        calls.push(structuredClone(repair));
        return { content: replies[calls.length - 1], reasoningContent: "思考", toolCalls: [] };
    });
    assert.deepEqual(parsed, valid);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], []);
    assert.deepEqual(calls[1][0], { role: "assistant", content: JSON.stringify(invalid), reasoningContent: "思考" });
    assert.match(String((calls[1][1] as { content: string }).content), /标题/);
    await assert.rejects(requestRemixPlanWithRepair(state.input, async () => ({ content: JSON.stringify(invalid), toolCalls: [] })), /标题/);
    await assert.rejects(requestRemixPlanWithRepair(state.input, async () => ({ content: " ", toolCalls: [] })), /没有返回完整内容/);
});

test("marketing references wire reference nodes and number attached images", () => {
    const state = setup();
    const marketing = marketingInput(state.input);
    const withReference = plan(marketing);
    withReference.visual.images[0]!.referenceAssetIds = ["asset-1"];
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: { ...state.run, input: marketing } });
    const reference = scaffold.nodes.find((node) => node.metadata?.remixRole === "reference");
    assert.equal(reference?.metadata?.content, "/api/files/product/content");
    assert.equal(reference?.metadata?.storageKey, "server:product");
    const applied = applySourceRemixPlan(scaffold.nodes, scaffold.connections, state.run.id, withReference);
    assert.match(applied.nodes.find((node) => node.id === scaffold.imageNodeIds[0])?.metadata?.prompt || "", /图片2：招牌菜/);
    assert.deepEqual(applied.connections.filter((edge) => edge.toNodeId === scaffold.imageNodeIds[0]).map((edge) => edge.fromNodeId), [scaffold.planNodeId, "source-1-material-image-0", reference!.id]);

    const withoutSource = { ...marketing, sourceImages: [] };
    const emptyScaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: { ...state.run, input: withoutSource } });
    const emptyPlan = { ...plan(withoutSource), visual: { sharedAnchors: ["封面"], images: [{ sourceImageId: "", role: "封面", prompt: "封面", referenceAssetIds: ["asset-1"] }] } };
    const emptyApplied = applySourceRemixPlan(emptyScaffold.nodes, emptyScaffold.connections, state.run.id, emptyPlan);
    assert.match(emptyApplied.nodes.find((node) => node.id === emptyScaffold.imageNodeIds[0])?.metadata?.prompt || "", /图片1：招牌菜/);
});

test("旧核心版本的已完成策划不能继续生成", () => {
    const state = setup();
    const oldRun: RemixRun = { ...state.run, input: { ...state.input, coreVersion: "marketing-remix-1" } };
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: oldRun });
    const applied = applySourceRemixPlan(scaffold.nodes, scaffold.connections, oldRun.id, plan(state.input));
    assert.throws(() => assertRemixRunStructure(applied.nodes, applied.connections, oldRun.id), /重新策划/);
});

test("Agent 普通媒体工具不能把复刻节点当作来源绕过整组审阅", () => {
    const state = setup();
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: state.run });
    assert.equal(findRemixControlledSourceNode(scaffold.nodes, [scaffold.copyNodeId])?.id, scaffold.copyNodeId);
    assert.equal(findRemixControlledSourceNode(scaffold.nodes, [state.original.id, scaffold.imageNodeIds[0]])?.id, scaffold.imageNodeIds[0]);
    assert.equal(findRemixControlledSourceNode(scaffold.nodes, [state.original.id]), undefined);
});

test("只收集已有成功配图的运行，忽略失败和空内容", () => {
    const state = setup();
    const scaffold = planSourceRemix({ source: state.original, nodes: state.nodes, connections: state.connections, run: state.run });
    const nodes = scaffold.nodes.map((item) => {
        if (item.metadata?.remixRole === "image" && item.id === scaffold.imageNodeIds[0]) return { ...item, metadata: { ...item.metadata, status: "success" as const, content: "blob:generated" } };
        if (item.metadata?.remixRole === "image") return { ...item, metadata: { ...item.metadata, status: "success" as const, content: "" } };
        return item;
    });
    assert.deepEqual(collectPublishableRemixRunIds(nodes), [state.run.id]);
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
    const approved = applied.nodes.map((item) => item.metadata?.remixRun ? { ...item, metadata: { ...item.metadata, remixRun: { ...item.metadata.remixRun, approvedKey: "approved", approval: { id: "approval" } as never, batch: { id: "batch" } as never } } } : item);
    const detached = findRemixRunNode(detachRemixNodes(approved), state.run.id)?.metadata?.remixRun;
    assert.equal(detached?.approvedKey, undefined);
    assert.equal(detached?.approval, undefined);
    assert.equal(detached?.batch, undefined);
    const successful = applied.nodes.map((item) => item.metadata?.remixRole === "image" ? { ...item, metadata: { ...item.metadata, content: "blob:generated", status: "success" as const } } : item);
    assert.equal(collectPublishableRemixImages(successful, state.run.id).length, 2);
});
