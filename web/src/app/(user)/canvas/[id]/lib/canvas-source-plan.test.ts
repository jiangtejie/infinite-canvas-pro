import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { buildSourceMaterialPlan, pruneSourceDerivedNodes, SOURCE_REMIX_IMAGE_PROMPT, SOURCE_REMIX_TEXT_PROMPT } from "./canvas-source-plan";

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

test("source material plan keeps deterministic ids and content", () => {
    const source = sourceNode();
    const first = buildSourceMaterialPlan(source);
    const second = buildSourceMaterialPlan(source);

    assert.deepEqual(first, second);
    assert.deepEqual(
        first.nodes.map((node) => node.id),
        ["source-1-material-text", "source-1-material-image-0", "source-1-material-image-1"],
    );
    assert.deepEqual(
        first.connections.map((item) => item.id),
        ["source-1->source-1-material-text", "source-1->source-1-material-image-0", "source-1->source-1-material-image-1"],
    );
    assert.deepEqual(first.sourcePatch, { sourceExpanded: true });
});

test("material text joins title, body and hashtags", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceTitle: "标题", sourceText: "正文第一段\n正文第二段", sourceTags: ["#话题1", "话题2"] } }));
    const textNode = plan.nodes.find((node) => node.id === "source-1-material-text");
    assert.equal(textNode?.type, CanvasNodeType.Text);
    assert.equal(textNode?.metadata?.content, "标题\n\n正文第一段\n正文第二段\n\n#话题1 #话题2");
    assert.equal(textNode?.metadata?.status, "success");
    assert.equal(textNode?.metadata?.fontSize, 14);
});

test("material images keep aspect ratio, fall back to 4:3 and avoid overlap", () => {
    const plan = buildSourceMaterialPlan(sourceNode());
    const images = plan.nodes.filter((node) => node.type === CanvasNodeType.Image && node.id.includes("material-image"));
    assert.equal(images.length, 2);
    assert.deepEqual(images.map((node) => [node.width, node.height]), [[195, 260], [320, 160]]);
    assert.equal(images[0]?.metadata?.content, "/api/files/a/content");
    assert.equal(images[0]?.metadata?.storageKey, "server:a");
    assert.equal(images[0]?.metadata?.naturalWidth, 1080);
    assert.equal(images[0]?.metadata?.mimeType, "image/jpeg");

    const noSizePlan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceImages: [{ url: "/api/files/c/content" }] } }));
    const noSizeImage = noSizePlan.nodes.find((node) => node.id === "source-1-material-image-0");
    assert.deepEqual([noSizeImage?.width, noSizeImage?.height], [320, 240]);

    const textNode = plan.nodes.find((node) => node.id === "source-1-material-text");
    assert.ok(textNode && images[0] && textNode.position.x + textNode.width < images[0].position.x);

    for (let i = 0; i < images.length; i++) {
        for (let j = i + 1; j < images.length; j++) {
            const first = images[i]!;
            const second = images[j]!;
            const overlap = first.position.x < second.position.x + second.width && second.position.x < first.position.x + first.width && first.position.y < second.position.y + second.height && second.position.y < first.position.y + first.height;
            assert.equal(overlap, false);
        }
    }
});

test("material connections only wire source to material nodes", () => {
    const plan = buildSourceMaterialPlan(sourceNode());
    assert.equal(plan.connections.length, 3);
    assert.deepEqual(plan.nodes.map((node) => node.type), [CanvasNodeType.Text, CanvasNodeType.Image, CanvasNodeType.Image]);
});

test("remix plan adds prompt nodes and full connections", () => {
    const plan = buildSourceMaterialPlan(sourceNode(), { includeRemix: true });
    assert.equal(plan.nodes.length, 5);
    assert.equal(plan.connections.length, 7);

    const remixText = plan.nodes.find((node) => node.id === "source-1-remix-text");
    const remixImage = plan.nodes.find((node) => node.id === "source-1-remix-image");
    assert.equal(remixText?.metadata?.prompt, SOURCE_REMIX_TEXT_PROMPT);
    assert.equal(remixText?.metadata?.status, "idle");
    assert.equal(remixImage?.metadata?.prompt, SOURCE_REMIX_IMAGE_PROMPT);
    assert.equal(remixImage?.metadata?.status, "idle");
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-text" && item.toNodeId === "source-1-remix-text"));
    assert.equal(plan.connections.some((item) => item.toNodeId === "source-1-remix-text" && item.fromNodeId !== "source-1-material-text"), false);
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-remix-text" && item.toNodeId === "source-1-remix-image"));
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-0" && item.toNodeId === "source-1-remix-image"));
});

test("remix plan falls back to the cover image and tolerates missing text", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceKind: "video", sourceCoverUrl: "/api/files/cover/content", sourceImages: [] } }), { includeRemix: true });
    assert.deepEqual(plan.nodes.map((node) => node.id), ["source-1-material-image-0", "source-1-remix-text", "source-1-remix-image"]);
    assert.equal(plan.nodes[0]?.metadata?.content, "/api/files/cover/content");
    assert.equal(plan.connections.length, 3);
});

test("empty source returns an empty plan", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceStatus: "success" } }), { includeRemix: true });
    assert.deepEqual(plan.nodes, []);
    assert.deepEqual(plan.connections, []);
    assert.deepEqual(plan.sourcePatch, { sourceExpanded: true });
});

test("prune derived nodes removes stale materials without external links", () => {
    const source = sourceNode();
    const materialText: CanvasNodeData = { id: "source-1-material-text", type: CanvasNodeType.Text, title: "素材文案", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: {} };
    const materialImage: CanvasNodeData = { id: "source-1-material-image-0", type: CanvasNodeType.Image, title: "素材图 1", position: { x: 400, y: 0 }, width: 320, height: 240, metadata: {} };
    const remixImage: CanvasNodeData = { id: "source-1-remix-image", type: CanvasNodeType.Image, title: "复刻配图", position: { x: 800, y: 0 }, width: 320, height: 400, metadata: {} };
    const external: CanvasNodeData = { id: "external", type: CanvasNodeType.Image, title: "外部节点", position: { x: 0, y: 0 }, width: 200, height: 200, metadata: {} };
    const nodes = [source, materialText, materialImage, remixImage, external];
    const connections = [
        { id: "a", fromNodeId: source.id, toNodeId: materialText.id },
        { id: "b", fromNodeId: source.id, toNodeId: materialImage.id },
        { id: "c", fromNodeId: materialImage.id, toNodeId: remixImage.id },
        { id: "d", fromNodeId: remixImage.id, toNodeId: external.id },
    ];
    const plan = pruneSourceDerivedNodes(source, nodes, connections, (node) => node.id.startsWith("source-1-material-") && node.id !== materialImage.id);
    assert.deepEqual(plan.removedNodeIds, [materialText.id]);
    assert.deepEqual(plan.blockedNodeIds, []);
    assert.equal(plan.nodes.some((node) => node.id === materialText.id), false);
    assert.equal(plan.connections.some((item) => item.id === "a"), false);
});

test("prune keeps derived nodes that already connect to external nodes", () => {
    const source = sourceNode();
    const materialImage: CanvasNodeData = { id: "source-1-material-image-0", type: CanvasNodeType.Image, title: "素材图 1", position: { x: 400, y: 0 }, width: 320, height: 240, metadata: {} };
    const external: CanvasNodeData = { id: "external", type: CanvasNodeType.Text, title: "外部节点", position: { x: 0, y: 0 }, width: 200, height: 200, metadata: {} };
    const connections = [
        { id: "a", fromNodeId: source.id, toNodeId: materialImage.id },
        { id: "b", fromNodeId: materialImage.id, toNodeId: external.id },
    ];
    const plan = pruneSourceDerivedNodes(source, [source, materialImage, external], connections, () => true);
    assert.deepEqual(plan.blockedNodeIds, [materialImage.id]);
    assert.equal(plan.nodes.some((node) => node.id === materialImage.id), true);
    assert.equal(plan.connections.some((item) => item.id === "b"), true);
});

test("reset removes all derived nodes when nothing is referenced externally", () => {
    const source = sourceNode();
    const materialText: CanvasNodeData = { id: "source-1-material-text", type: CanvasNodeType.Text, title: "素材文案", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: {} };
    const remixImage: CanvasNodeData = { id: "source-1-remix-image", type: CanvasNodeType.Image, title: "复刻配图", position: { x: 800, y: 0 }, width: 320, height: 400, metadata: {} };
    const connections = [
        { id: "a", fromNodeId: source.id, toNodeId: materialText.id },
        { id: "b", fromNodeId: materialText.id, toNodeId: remixImage.id },
    ];
    const plan = pruneSourceDerivedNodes(source, [source, materialText, remixImage], connections, () => true);
    assert.equal(plan.removedNodeIds.length, 2);
    assert.deepEqual(plan.nodes.map((node) => node.id), [source.id]);
    assert.deepEqual(plan.connections, []);
});
