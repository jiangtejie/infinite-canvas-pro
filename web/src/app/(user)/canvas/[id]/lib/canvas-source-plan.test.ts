import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { buildSourceMaterialPlan, isLegacyRemixTextImageConnection, migrateRemixNodeLayouts, pruneSourceDerivedNodes, SOURCE_REMIX_IMAGE_PROMPT, SOURCE_REMIX_TEXT_PROMPT, stripLegacyRemixTextImageConnections } from "./canvas-source-plan";

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

test("remix image generation size follows the reference aspect ratio", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceImages: [{ url: "/api/files/portrait/content", width: 1080, height: 1350 }] } }), { includeRemix: true });
    const image = plan.nodes.find((node) => node.id === "source-1-remix-image-0");
    assert.ok(image);
    assert.equal(image.metadata?.size, "1024x1280");
    assert.equal(image.width, 320);
    assert.equal(image.height, 400);
});

test("remix plan fans out one image node per source image", () => {
    const plan = buildSourceMaterialPlan(sourceNode(), { includeRemix: true });
    assert.equal(plan.nodes.length, 6);
    assert.equal(plan.connections.length, 6);

    const remixText = plan.nodes.find((node) => node.id === "source-1-remix-text");
    const remixImages = plan.nodes.filter((node) => node.id.startsWith("source-1-remix-image-"));
    assert.equal(remixText?.metadata?.prompt, SOURCE_REMIX_TEXT_PROMPT);
    assert.equal(remixText?.metadata?.status, "idle");
    assert.equal(remixImages.length, 2);
    assert.deepEqual(remixImages.map((node) => node.title), ["复刻配图 1", "复刻配图 2"]);
    assert.deepEqual(remixImages.map((node) => node.metadata?.remixIndex), [1, 2]);
    assert.deepEqual(remixImages.map((node) => node.metadata?.remixSourceId), ["source-1", "source-1"]);
    assert.deepEqual(remixImages.map((node) => [node.width, node.height]), [[300, 400], [320, 160]]);
    assert.deepEqual(remixImages.map((node) => node.metadata?.size), ["768x1024", "1920x1080"]);
    assert.deepEqual(remixImages.map((node) => node.metadata?.naturalWidth), [1080, 400]);
    for (const image of remixImages) {
        assert.ok(image.metadata?.prompt?.startsWith(SOURCE_REMIX_IMAGE_PROMPT));
    }
    assert.ok(remixImages[0]?.metadata?.prompt?.includes("第 1 张原图"));
    assert.ok(remixImages[1]?.metadata?.prompt?.includes("第 2 张原图"));
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-text" && item.toNodeId === "source-1-remix-text"));
    assert.equal(plan.connections.some((item) => item.toNodeId === "source-1-remix-text" && item.fromNodeId !== "source-1-material-text"), false);
    assert.equal(plan.connections.some((item) => item.fromNodeId === "source-1-remix-text" && item.toNodeId.startsWith("source-1-remix-image-")), false);
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-0" && item.toNodeId === "source-1-remix-image-0"));
    assert.ok(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-1" && item.toNodeId === "source-1-remix-image-1"));
    assert.equal(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-0" && item.toNodeId === "source-1-remix-image-1"), false);
    assert.equal(plan.connections.some((item) => item.fromNodeId === "source-1-material-image-1" && item.toNodeId === "source-1-remix-image-0"), false);
});

test("remix plan falls back to the cover image and tolerates missing text", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceKind: "video", sourceCoverUrl: "/api/files/cover/content", sourceImages: [] } }), { includeRemix: true });
    assert.deepEqual(plan.nodes.map((node) => node.id), ["source-1-material-image-0", "source-1-remix-text", "source-1-remix-image-0"]);
    assert.equal(plan.nodes[0]?.metadata?.content, "/api/files/cover/content");
    assert.equal(plan.connections.length, 2);
});

test("text-only source still gets one text-to-image remix node", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceTitle: "标题", sourceText: "正文", sourceImages: [] } }), { includeRemix: true });
    assert.deepEqual(plan.nodes.map((node) => node.id), ["source-1-material-text", "source-1-remix-text", "source-1-remix-image-0"]);
    assert.equal(plan.nodes.filter((node) => node.id.startsWith("source-1-remix-image-")).length, 1);
    assert.equal(plan.connections.length, 2);
});

test("empty source returns an empty plan", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceStatus: "success" } }), { includeRemix: true });
    assert.deepEqual(plan.nodes, []);
    assert.deepEqual(plan.connections, []);
    assert.deepEqual(plan.sourcePatch, { sourceExpanded: true });
});

test("legacy remix text to image connections are identified for cleanup", () => {
    assert.equal(isLegacyRemixTextImageConnection({ id: "a", fromNodeId: "source-1-remix-text", toNodeId: "source-1-remix-image-0" }, "source-1"), true);
    assert.equal(isLegacyRemixTextImageConnection({ id: "b", fromNodeId: "source-1-remix-text", toNodeId: "publish-1" }, "source-1"), false);
    assert.equal(isLegacyRemixTextImageConnection({ id: "c", fromNodeId: "other-remix-text", toNodeId: "source-1-remix-image-0" }, "source-1"), false);
});

test("legacy remix connections are stripped on project restore", () => {
    const source = sourceNode();
    const connections = [
        { id: "legacy", fromNodeId: "source-1-remix-text", toNodeId: "source-1-remix-image-0" },
        { id: "publish", fromNodeId: "source-1-remix-text", toNodeId: "publish-1" },
        { id: "material", fromNodeId: "source-1-material-image-0", toNodeId: "source-1-remix-image-0" },
    ];
    assert.deepEqual(stripLegacyRemixTextImageConnections([source], connections).map((item) => item.id), ["publish", "material"]);
});

test("idle remix image nodes migrate to the reference aspect size", () => {
    const source = sourceNode();
    const idle = { id: "source-1-remix-image-0", type: CanvasNodeType.Image, title: "复刻配图 1", position: { x: 0, y: 0 }, width: 320, height: 400, metadata: {} } satisfies CanvasNodeData;
    const generated = { ...idle, id: "source-1-remix-image-1", metadata: { content: "https://example.com/generated.png" } };
    const migrated = migrateRemixNodeLayouts([source, idle, generated]);
    const migratedIdle = migrated.find((node) => node.id === idle.id);
    assert.equal(migratedIdle?.width, 300);
    assert.equal(migratedIdle?.height, 400);
    assert.equal(migratedIdle?.metadata?.size, "768x1024");
    assert.equal(migrated.find((node) => node.id === generated.id), generated);
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
