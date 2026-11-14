import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { buildSourceMaterialPlan, planSourceMaterialSync, pruneSourceDerivedNodes, sourceExpansionNeedsSync, sourceMaterialNodeSignature, sourceMaterialSignature } from "./canvas-source-plan";
import { sourceNodeText } from "./canvas-node-meta";

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
    assert.equal(first.sourcePatch.sourceExpanded, true);
    assert.equal(typeof first.sourcePatch.sourceExpandedSignature, "string");
    assert.deepEqual(Object.keys(first.sourcePatch.sourceExpandedNodeSignatures || {}).sort(), first.nodes.map((node) => node.id).sort());
});

test("source expansion sync updates changed content and stores its signatures", () => {
    const initialSource = sourceNode();
    const initialPlan = buildSourceMaterialPlan(initialSource);
    const expandedSource = { ...initialSource, metadata: { ...initialSource.metadata, ...initialPlan.sourcePatch } };
    const changedSource = { ...expandedSource, metadata: { ...expandedSource.metadata, sourceText: "更新正文", sourceImages: [{ url: "/api/files/new/content", storageKey: "server:new", width: 800, height: 600 }] } };
    const nodes = [expandedSource, ...initialPlan.nodes.map((node) => node.id === "source-1-material-image-0" ? { ...node, width: 111, height: 222 } : node)];
    assert.equal(sourceExpansionNeedsSync(changedSource, nodes), true);

    const result = planSourceMaterialSync(changedSource, nodes, initialPlan.connections);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.needsSync, true);
    const text = result.nodes.find((node) => node.id === "source-1-material-text");
    const image = result.nodes.find((node) => node.id === "source-1-material-image-0");
    const updatedSource = result.nodes.find((node) => node.id === "source-1")!;
    assert.equal(text?.metadata?.content, sourceNodeText(changedSource));
    assert.equal(image?.metadata?.content, "/api/files/new/content");
    assert.deepEqual([image?.width, image?.height], [111, 222]);
    assert.equal(updatedSource.metadata?.sourceExpandedSignature, sourceMaterialSignature(changedSource));
    assert.equal(updatedSource.metadata?.sourceExpandedNodeSignatures?.[text!.id], sourceMaterialNodeSignature(text!));
    assert.equal(sourceExpansionNeedsSync(updatedSource, result.nodes), false);
    const syncedImageUrlOnly = { ...updatedSource, metadata: { ...updatedSource.metadata, sourceImages: updatedSource.metadata?.sourceImages?.map((image) => ({ ...image, url: "blob:refreshed-preview" })) } };
    assert.equal(sourceExpansionNeedsSync(syncedImageUrlOnly, result.nodes), false);
});

test("source expansion sync stops when changed material is manually edited or externally connected", () => {
    const source = sourceNode();
    const plan = buildSourceMaterialPlan(source);
    const snapshotSource = { ...source, metadata: { ...source.metadata, ...plan.sourcePatch } };
    const editedText = { ...plan.nodes[0]!, metadata: { ...plan.nodes[0]!.metadata, content: "用户编辑的内容" } };
    const changedSource = { ...snapshotSource, metadata: { ...snapshotSource.metadata, sourceText: "新正文", sourceImages: [{ ...snapshotSource.metadata!.sourceImages![0]!, url: "/api/files/changed/content" }, ...snapshotSource.metadata!.sourceImages!.slice(1)] } };
    const editedResult = planSourceMaterialSync(changedSource, [changedSource, editedText, ...plan.nodes.slice(1)], plan.connections);
    assert.equal(editedResult.ok, false);
    if (!editedResult.ok) assert.deepEqual(editedResult.blockedNodeIds, [editedText.id]);

    const external = { id: "external", type: CanvasNodeType.Text, title: "外部", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: {} } satisfies CanvasNodeData;
    const linkedResult = planSourceMaterialSync(changedSource, [changedSource, ...plan.nodes, external], [...plan.connections, { id: "external-use", fromNodeId: plan.nodes[0]!.id, toNodeId: external.id }]);
    assert.equal(linkedResult.ok, false);
    if (!linkedResult.ok) assert.deepEqual(linkedResult.blockedNodeIds, [plan.nodes[0]!.id]);
});

test("material text joins title, body and hashtags", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceTitle: "标题", sourceText: "正文第一段\n正文第二段", sourceTags: ["#话题1", "话题2"] } }));
    const textNode = plan.nodes.find((node) => node.id === "source-1-material-text");
    assert.equal(textNode?.type, CanvasNodeType.Text);
    assert.equal(textNode?.metadata?.content, "标题\n\n正文第一段\n正文第二段\n\n#话题1 #话题2");
    assert.equal(textNode?.metadata?.status, "success");
    assert.equal(textNode?.metadata?.fontSize, 14);
});

test("material text is exactly the shared source text with normalized tags", () => {
    const source = sourceNode({ metadata: { sourceTitle: "标题", sourceText: "正文", sourceTags: ["#话题1", "话题2", "", "#"] } });
    const plan = buildSourceMaterialPlan(source);
    const textNode = plan.nodes.find((node) => node.id === "source-1-material-text");
    assert.equal(textNode?.metadata?.content, sourceNodeText(source));
    assert.equal(textNode?.metadata?.content, "标题\n\n正文\n\n#话题1 #话题2");
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

test("empty source returns an empty plan", () => {
    const plan = buildSourceMaterialPlan(sourceNode({ metadata: { sourceStatus: "success" } }));
    assert.deepEqual(plan.nodes, []);
    assert.deepEqual(plan.connections, []);
    assert.equal(plan.sourcePatch.sourceExpanded, true);
    assert.equal(typeof plan.sourcePatch.sourceExpandedSignature, "string");
    assert.deepEqual(plan.sourcePatch.sourceExpandedNodeSignatures, {});
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
