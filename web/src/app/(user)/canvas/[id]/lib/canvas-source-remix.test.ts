import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { buildSourceMaterialPlan } from "./canvas-source-plan";
import { collectBatchGenerationTargets } from "./canvas-batch";
import {
    applySourceRemixPlan,
    collectPublishableRemixImages,
    collectRemixImageNodeIds,
    collectSourceMaterialNodes,
    findSourceRemixPlanNode,
    findSourceRemixTextNode,
    hasSourceRemixText,
    parseSourceRemixPlan,
    planSourceRemix,
    remixImagePromptFromPlan,
    SOURCE_REMIX_PLAN_PROMPT,
    sourceRemixImagesReady,
} from "./canvas-source-remix";

const node = (id: string, type: CanvasNodeType, patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata: {},
    ...patch,
});

const sourceNode = (patch: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id: "source-1",
    type: CanvasNodeType.Source,
    title: "素材源",
    position: { x: 100, y: 200 },
    width: 420,
    height: 300,
    metadata: {
        sourceStatus: "success",
        sourceTitle: "标题",
        sourceText: "正文",
        sourceTags: ["话题1", "话题2"],
        sourceImages: [
            { url: "/api/files/a/content", storageKey: "server:a", width: 1080, height: 1440, mimeType: "image/jpeg" },
            { url: "/api/files/b/content", width: 400, height: 200 },
        ],
    },
    ...patch,
});

/** 展开后的画布：素材源 + 真实素材文案/素材图节点，复刻骨架按它们的实际位置排布。 */
function expandedCanvas(patch: Partial<CanvasNodeData> = {}) {
    const source = sourceNode(patch);
    const material = buildSourceMaterialPlan(source);
    return { source, nodes: [source, ...material.nodes], connections: material.connections };
}

const remix = (canvas: ReturnType<typeof expandedCanvas>, copy = "新文案", instruction?: string) =>
    planSourceRemix({ source: canvas.source, nodes: canvas.nodes, connections: canvas.connections, copy, instruction });

test("scaffold fans out one remix image per material image and wires the group plan", () => {
    const canvas = expandedCanvas();
    const plan = remix(canvas);
    assert.deepEqual(plan.copyNodeId, "source-1-remix-text");
    assert.deepEqual(plan.planNodeId, "source-1-remix-plan");
    assert.deepEqual(plan.imageNodeIds, ["source-1-remix-image-0", "source-1-remix-image-1"]);
    assert.equal(plan.nodes.length, 8);

    const copyNode = findSourceRemixTextNode(plan.nodes, "source-1");
    assert.equal(copyNode?.metadata?.content, "新文案");
    assert.equal(copyNode?.metadata?.status, "success");

    const planNode = findSourceRemixPlanNode(plan.nodes, "source-1");
    assert.equal(planNode?.title, "复刻策划");
    assert.equal(planNode?.metadata?.prompt, SOURCE_REMIX_PLAN_PROMPT);
    assert.equal(plan.planPrompt, SOURCE_REMIX_PLAN_PROMPT);
    assert.equal(planNode?.metadata?.status, "idle");

    const images = plan.imageNodeIds.map((id) => plan.nodes.find((item) => item.id === id)!);
    assert.deepEqual(images.map((item) => item.title), ["复刻配图 1", "复刻配图 2"]);
    assert.deepEqual(images.map((item) => item.metadata?.remixIndex), [1, 2]);
    assert.deepEqual(images.map((item) => item.metadata?.remixSourceId), ["source-1", "source-1"]);
    // 配图提示词由策划按整组图写入，铺开时必须为空，不留单图模板绕过策划。
    assert.deepEqual(images.map((item) => item.metadata?.prompt), ["", ""]);

    assert.deepEqual(
        plan.connections.filter((item) => item.toNodeId === plan.planNodeId).map((item) => item.fromNodeId),
        ["source-1-remix-text", "source-1-material-image-0", "source-1-material-image-1"],
    );
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-text" && item.toNodeId === plan.copyNodeId));
    assert.equal(plan.connections.some((item) => item.toNodeId === plan.copyNodeId && item.fromNodeId !== "source-1-material-text"), false);
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-0" && item.toNodeId === "source-1-remix-image-0"));
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-1" && item.toNodeId === "source-1-remix-image-1"));
    assert.equal(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-0" && item.toNodeId === "source-1-remix-image-1"), false);
    assert.equal(plan.connections.some((item) => item.fromNodeId === plan.planNodeId), false);
});

test("remix images keep the reference aspect ratio and pick a supported generation size", () => {
    const plan = remix(expandedCanvas());
    const images = plan.imageNodeIds.map((id) => plan.nodes.find((item) => item.id === id)!);
    assert.deepEqual(images.map((item) => [item.width, item.height]), [[300, 400], [320, 160]]);
    assert.deepEqual(images.map((item) => item.metadata?.size), ["768x1024", "1920x1080"]);
    assert.deepEqual(images.map((item) => item.metadata?.naturalWidth), [1080, 400]);

    const portrait = remix(expandedCanvas({ metadata: { sourceImages: [{ url: "/api/files/portrait/content", width: 1080, height: 1350 }] } }));
    const portraitImage = portrait.nodes.find((item) => item.id === "source-1-remix-image-0")!;
    assert.equal(portraitImage.metadata?.size, "1024x1280");
    assert.deepEqual([portraitImage.width, portraitImage.height], [320, 400]);
});

test("scaffold sits to the right of the material group, not the whole canvas", () => {
    const canvas = expandedCanvas();
    const farAway = node("far-away", CanvasNodeType.Text, { position: { x: 9000, y: 0 }, width: 400, height: 200 });
    const plan = planSourceRemix({ source: canvas.source, nodes: [...canvas.nodes, farAway], connections: canvas.connections, copy: "新文案" });
    const materialRight = Math.max(...collectSourceMaterialNodes(canvas.nodes, "source-1").materialImages.map((item) => item.position.x + item.width));
    const copyNode = findSourceRemixTextNode(plan.nodes, "source-1")!;
    assert.ok(copyNode.position.x > materialRight);
    assert.ok(copyNode.position.x < farAway.position.x);
});

test("re-planning reuses nodes, keeps generated images and clears the previous plan", () => {
    const canvas = expandedCanvas();
    const first = remix(canvas);
    const generated = first.nodes.map((item) => item.id === first.imageNodeIds[0]
        ? { ...item, metadata: { ...item.metadata, content: "https://example.com/done.png", status: "success" as const, size: "1024x1024" } }
        : item);
    const second = planSourceRemix({ source: canvas.source, nodes: generated, connections: first.connections, copy: "改后的文案", instruction: "换成夜景" });

    assert.equal(second.nodes.length, first.nodes.length);
    assert.equal(second.connections.length, first.connections.length);
    assert.deepEqual(second.imageNodeIds, first.imageNodeIds);
    const kept = second.nodes.find((item) => item.id === first.imageNodeIds[0])!;
    assert.equal(kept.metadata?.content, "https://example.com/done.png");
    assert.equal(kept.metadata?.size, "1024x1024");
    assert.equal(kept.metadata?.prompt, "");
    assert.equal(findSourceRemixTextNode(second.nodes, "source-1")?.metadata?.content, "改后的文案");
    assert.equal(hasSourceRemixText(findSourceRemixPlanNode(second.nodes, "source-1")), false);
    assert.equal(sourceRemixImagesReady(second.nodes, "source-1"), false);
    assert.ok(second.planPrompt.startsWith(SOURCE_REMIX_PLAN_PROMPT));
    assert.ok(second.planPrompt.endsWith("本次修改要求：换成夜景"));
});

test("shrinking the material group prunes stale remix images without external links", () => {
    const first = remix(expandedCanvas());
    const smaller = expandedCanvas({ metadata: { sourceImages: [{ url: "/api/files/a/content", width: 1080, height: 1440 }] } });
    const nodes = [...smaller.nodes, ...first.nodes.filter((item) => item.id.startsWith("source-1-remix-"))];
    const connections = [...smaller.connections, ...first.connections.filter((item) => item.toNodeId.startsWith("source-1-remix-"))];
    const second = planSourceRemix({ source: smaller.source, nodes, connections, copy: "新文案" });
    assert.deepEqual(second.imageNodeIds, ["source-1-remix-image-0"]);
    assert.equal(second.nodes.some((item) => item.id === "source-1-remix-image-1"), false);
    assert.equal(second.connections.some((item) => item.fromNodeId === "source-1-remix-image-1" || item.toNodeId === "source-1-remix-image-1"), false);
});

test("cover-only and text-only sources still get exactly one remix image", () => {
    const cover = remix(expandedCanvas({ metadata: { sourceKind: "video", sourceCoverUrl: "/api/files/cover/content", sourceImages: [] } }));
    assert.deepEqual(cover.imageNodeIds, ["source-1-remix-image-0"]);
    assert.equal(cover.nodes.find((item) => item.id === "source-1-material-image-0")?.metadata?.content, "/api/files/cover/content");
    assert.equal(findSourceRemixTextNode(cover.nodes, "source-1")?.metadata?.content, "新文案");

    const textOnly = remix(expandedCanvas({ metadata: { sourceTitle: "标题", sourceText: "正文", sourceImages: [] } }));
    assert.deepEqual(textOnly.imageNodeIds, ["source-1-remix-image-0"]);
    assert.deepEqual(textOnly.connections.filter((item) => item.toNodeId === textOnly.planNodeId).map((item) => item.fromNodeId), ["source-1-remix-text"]);
});

test("image generation is gated on a finished group plan and complete prompts", () => {
    const plan = remix(expandedCanvas());
    assert.equal(sourceRemixImagesReady(plan.nodes, "source-1"), false);
    assert.equal(sourceRemixImagesReady(plan.nodes, "source-2"), false);

    const groupPlan = { shared: "整组共同设定", images: ["第1张差异", "第2张差异"] };
    const planned = applySourceRemixPlan(plan.nodes, plan.imageNodeIds, groupPlan).map((item) => item.id === plan.planNodeId
        ? { ...item, metadata: { ...item.metadata, content: JSON.stringify(groupPlan), status: "success" as const } }
        : item);
    assert.equal(sourceRemixImagesReady(planned, "source-1"), true);

    const partial = planned.map((item) => item.id === plan.imageNodeIds[1] ? { ...item, metadata: { ...item.metadata, prompt: "" } } : item);
    assert.equal(sourceRemixImagesReady(partial, "source-1"), false);
});

test("each remix image gets a self-contained shared plus own prompt", () => {
    const plan = { shared: "整组共同设定", images: ["第1张差异", "第2张差异"] };
    assert.equal(remixImagePromptFromPlan(plan, 0), "整组共同设定\n\n第1张差异");
    const canvas = expandedCanvas();
    const scaffold = remix(canvas);
    const applied = applySourceRemixPlan(scaffold.nodes, scaffold.imageNodeIds, plan);
    assert.deepEqual(scaffold.imageNodeIds.map((id) => applied.find((item) => item.id === id)?.metadata?.prompt), ["整组共同设定\n\n第1张差异", "整组共同设定\n\n第2张差异"]);
    assert.equal(applied.find((item) => item.id === "source-1-material-image-0")?.metadata?.prompt, undefined);
});

test("plan parsing accepts group JSON, repairs fences and rejects incomplete output", async () => {
    assert.deepEqual(await parseSourceRemixPlan('{"shared":"设定","images":["a","b"]}', 2), { shared: "设定", images: ["a", "b"] });
    assert.deepEqual(await parseSourceRemixPlan('```json\n{"shared":"设定","images":["a","b"]}\n```', 2), { shared: "设定", images: ["a", "b"] });
    await assert.rejects(() => parseSourceRemixPlan('{"shared":"设定","images":["a"]}', 2));
    await assert.rejects(() => parseSourceRemixPlan('{"images":["a","b"]}', 2));
    await assert.rejects(() => parseSourceRemixPlan('{"shared":"设定","images":["a",""]}', 2));
    await assert.rejects(() => parseSourceRemixPlan("不是 JSON", 2));
});

const remixOne = node("source-1-remix-image-0", CanvasNodeType.Image, { metadata: { content: "https://example.com/r1.png", remixIndex: 1 } });
const remixTwo = node("source-1-remix-image-1", CanvasNodeType.Image, { metadata: { content: "https://example.com/r2.png", remixIndex: 2 } });
const materialImage = node("source-1-material-image-0", CanvasNodeType.Image, { metadata: { content: "https://example.com/m.png" } });

test("remix images are collected by id prefix and sorted by remixIndex", () => {
    const nodes = [sourceNode(), remixTwo, materialImage, remixOne];
    assert.deepEqual(collectRemixImageNodeIds(nodes, "source-1"), ["source-1-remix-image-0", "source-1-remix-image-1"]);
    assert.deepEqual(collectRemixImageNodeIds(nodes, "source-2"), []);
    assert.deepEqual(collectRemixImageNodeIds(nodes, ""), []);
});

test("remix images fall back to source metadata when ids changed", () => {
    const copied = node("image-copied", CanvasNodeType.Image, { metadata: { remixIndex: 3, remixSourceId: "source-missing" } });
    const otherSource = node("image-other-source", CanvasNodeType.Image, { metadata: { remixIndex: 1, remixSourceId: "source-other" } });
    const noRemix = node("image-plain", CanvasNodeType.Image, { metadata: { content: "https://example.com/plain.png" } });
    assert.deepEqual(collectRemixImageNodeIds([copied, otherSource, noRemix], "source-missing"), ["image-copied"]);
    assert.deepEqual(collectRemixImageNodeIds([copied, otherSource, noRemix], "source-other"), ["image-other-source"]);
});

test("publishable remix images only keep generated content in remix order", () => {
    const emptyRemix = node("source-1-remix-image-2", CanvasNodeType.Image, { metadata: { remixIndex: 3 } });
    assert.deepEqual(collectPublishableRemixImages([remixTwo, emptyRemix, remixOne, materialImage], "source-1").map((item) => item.id), ["source-1-remix-image-0", "source-1-remix-image-1"]);
    assert.deepEqual(collectPublishableRemixImages([emptyRemix], "source-1"), []);
});

test("a slot manually expanded into a batch root stays in the remix group", () => {
    const expanded = node("source-1-remix-image-0", CanvasNodeType.Image, {
        metadata: { content: "https://example.com/primary.png", prompt: "整组设定\n\n第1张", remixIndex: 1, isBatchRoot: true, batchChildIds: ["child-a", "child-b"] },
    });
    const sibling = node("source-1-remix-image-1", CanvasNodeType.Image, { metadata: { content: "https://example.com/r2.png", prompt: "整组设定\n\n第2张", remixIndex: 2 } });
    const planNode = node("source-1-remix-plan", CanvasNodeType.Text, { metadata: { content: "{\"shared\":\"设定\",\"images\":[\"a\",\"b\"]}" } });
    const nodes = [sourceNode(), expanded, sibling, planNode];
    assert.deepEqual(collectRemixImageNodeIds(nodes, "source-1"), ["source-1-remix-image-0", "source-1-remix-image-1"]);
    assert.deepEqual(collectPublishableRemixImages(nodes, "source-1").map((item) => item.id), ["source-1-remix-image-0", "source-1-remix-image-1"]);
    assert.equal(sourceRemixImagesReady(nodes, "source-1"), true);
    // 归属不排除批量根节点，但批量队列仍不收它：两个判定必须分开。
    assert.deepEqual(collectBatchGenerationTargets(nodes, ["source-1-remix-image-0", "source-1-remix-image-1"]).targetNodeIds, ["source-1-remix-image-1"]);
});

test("remix text lookup and readiness", () => {
    const remixText = node("source-1-remix-text", CanvasNodeType.Text, { metadata: { content: "复刻后的文案" } });
    assert.equal(findSourceRemixTextNode([sourceNode(), remixText], "source-1")?.id, "source-1-remix-text");
    assert.equal(findSourceRemixTextNode([sourceNode()], "source-1"), undefined);
    assert.equal(findSourceRemixTextNode([remixText], ""), undefined);
    assert.equal(hasSourceRemixText(remixText), true);
    assert.equal(hasSourceRemixText(undefined), false);
    assert.equal(hasSourceRemixText(node("t", CanvasNodeType.Text, { metadata: { status: "error" } })), false);
    assert.equal(hasSourceRemixText(node("t", CanvasNodeType.Text, { metadata: { status: "error", content: "上一次的结果" } })), true);
});

test("material collection sorts images by index and finds the material text", () => {
    const canvas = expandedCanvas();
    const shuffled = [canvas.nodes[3]!, canvas.nodes[1]!, canvas.nodes[2]!, canvas.source];
    const collected = collectSourceMaterialNodes(shuffled, "source-1");
    assert.deepEqual(collected.materialImages.map((item) => item.id), ["source-1-material-image-0", "source-1-material-image-1"]);
    assert.equal(collected.materialText?.id, "source-1-material-text");
    assert.deepEqual(collectSourceMaterialNodes(shuffled, "source-2").materialImages, []);
});