import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { buildAngleLabel, buildAnglePrompt, findRetrySourceNode, isAudioFile, isConnectionFlowing, isHiddenBatchChild, isHiddenBatchConnectionEndpoint, isNodeFlowActive, sourceNodeReferenceImages } from "./canvas-graph";

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

test("retry source walks upstream until it finds a config node", () => {
    const nodes = [node("config", CanvasNodeType.Config), node("image", CanvasNodeType.Image), node("target", CanvasNodeType.Image)];
    const connections: CanvasConnection[] = [
        { id: "c1", fromNodeId: "config", toNodeId: "image" },
        { id: "c2", fromNodeId: "image", toNodeId: "target" },
    ];
    assert.equal(findRetrySourceNode("target", nodes, connections)?.id, "config");
    assert.equal(findRetrySourceNode("target", [nodes[2]], []), null);
});

test("source node reference images are only built for images with content", () => {
    const image = node("image", CanvasNodeType.Image, { metadata: { content: "https://example.com/i.png", storageKey: "key", mimeType: "image/webp" } });
    const references = sourceNodeReferenceImages(image);
    assert.equal(references.length, 1);
    assert.equal(references[0].name, "image-image.png");
    assert.equal(references[0].type, "image/webp");
    assert.equal(references[0].dataUrl, "https://example.com/i.png");
    assert.equal(references[0].storageKey, "key");
    assert.deepEqual(sourceNodeReferenceImages(node("text", CanvasNodeType.Text, { metadata: { content: "hello" } })), []);
});

test("audio file detection accepts mime types and mp3/wav names", () => {
    assert.equal(isAudioFile(new File([""], "a.mp3", { type: "audio/mpeg" })), true);
    assert.equal(isAudioFile(new File([""], "a.wav", { type: "" })), true);
    assert.equal(isAudioFile(new File([""], "a.txt", { type: "text/plain" })), false);
});

test("batch children are hidden only when the root is collapsed", () => {
    const root = node("root", CanvasNodeType.Image, { metadata: { isBatchRoot: true, imageBatchExpanded: false } });
    const child = node("child", CanvasNodeType.Image, { metadata: { batchRootId: "root" } });
    assert.equal(isHiddenBatchChild(child, [root, child]), true);
    assert.equal(isHiddenBatchChild(child, [root, child], new Set(["root"])), false);
    assert.equal(isHiddenBatchChild(child, [node("root", CanvasNodeType.Image, { metadata: { imageBatchExpanded: true } }), child]), false);
    assert.equal(isHiddenBatchChild(node("plain", CanvasNodeType.Image), [root]), false);
    assert.equal(isHiddenBatchConnectionEndpoint(child, [root, child]), true);
});

test("angle labels describe direction, pitch and lens", () => {
    assert.match(buildAngleLabel({ horizontalAngle: 0, pitchAngle: 0, cameraDistance: 1.5, wideAngle: false }), /正面视角.*水平视角.*1.5.*标准镜头/);
    assert.match(buildAngleLabel({ horizontalAngle: 15, pitchAngle: -10, cameraDistance: 2, wideAngle: true }), /向右旋转 15 度.*仰视 10 度.*广角镜头/);
    assert.match(buildAngleLabel({ horizontalAngle: -15, pitchAngle: 10, cameraDistance: 2, wideAngle: false }), /向左旋转 15 度.*俯视 10 度/);
    assert.match(buildAnglePrompt({ horizontalAngle: 0, pitchAngle: 0, cameraDistance: 1, wideAngle: false }), /AI 多角度/);
});

test("connection flow follows loading targets and source parsing", () => {
    const source = node("source", CanvasNodeType.Source, { metadata: { sourceParsing: true } });
    const target = node("image", CanvasNodeType.Image, { metadata: { status: "loading" } });
    assert.equal(isNodeFlowActive(target), true);
    assert.equal(isConnectionFlowing(source, target), true);
    assert.equal(isConnectionFlowing(source, node("idle", CanvasNodeType.Image)), true);
    assert.equal(isConnectionFlowing(node("idle-source", CanvasNodeType.Source), node("idle", CanvasNodeType.Image)), false);
    assert.equal(isConnectionFlowing(node("text", CanvasNodeType.Text), node("publish", CanvasNodeType.Publish, { metadata: { publishStatus: "generating" } })), true);
});
