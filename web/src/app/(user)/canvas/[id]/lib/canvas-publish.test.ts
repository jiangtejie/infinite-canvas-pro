import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type CanvasPublishDraft, type CanvasPublishRecord } from "../../types";
import { buildDefaultPublishDraft, collectPublishInputs, extractPublishTags, findSourcePublishNode, getPublishNodePlacement, isPublishDraftDirty, migratePublishNodeLayouts, planPublishNodeConnections, planSourcePublishNode, publishDraftSignature, publishQrExpired, reorderPublishImageIds } from "./canvas-publish";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

const nodeAt = (id: string, type: CanvasNodeType, patch: Partial<CanvasNodeData>): CanvasNodeData => ({ ...node(id, type), ...patch });

const connection = (fromNodeId: string, toNodeId: string): CanvasConnection => ({ id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId });

const publish = node("publish", CanvasNodeType.Publish);
const text = node("text", CanvasNodeType.Text, { content: "夏日海边穿搭分享\n#穿搭 #海边 #夏日" });
const imageOne = node("img1", CanvasNodeType.Image, { content: "data:image/png;base64,aaa" });
const imageTwo = node("img2", CanvasNodeType.Image, { content: "https://example.com/2.png" });
const video = node("video", CanvasNodeType.Video, { content: "https://example.com/v.mp4" });

const inputs = collectPublishInputs("publish", [publish, text, imageOne, imageTwo, video], [
    connection("text", "publish"),
    connection("img1", "publish"),
    connection("img2", "publish"),
    connection("video", "publish"),
    connection("img1", "publish"),
]);

test("collectPublishInputs only keeps upstream text and images and dedupes repeated nodes", () => {
    assert.match(inputs.text, /夏日海边穿搭分享/);
    assert.deepEqual(inputs.textNodeIds, ["text"]);
    assert.deepEqual(inputs.images.map((item) => item.nodeId), ["img1", "img2"]);
});

test("buildDefaultPublishDraft uses the first line as title and extracts tags", () => {
    const draft = buildDefaultPublishDraft(inputs);
    assert.equal(draft.title, "夏日海边穿搭分享");
    assert.deepEqual(draft.tags, ["穿搭", "海边", "夏日"]);
    assert.equal(draft.body?.includes("#"), false);
    assert.deepEqual(draft.imageNodeIds, ["img1", "img2"]);
    assert.equal(buildDefaultPublishDraft({ text: "x".repeat(40), textNodeIds: [], images: [] }).title?.length, 20);
});

test("extractPublishTags dedupes and limits to five tags", () => {
    assert.deepEqual(extractPublishTags("#a #b #a #c #d #e #f"), ["a", "b", "c", "d", "e"]);
    assert.deepEqual(extractPublishTags("没有话题"), []);
});

test("publishQrExpired compares the deadline with the current time", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const record = { id: "r1", qrText: "qr", expiresAt: new Date(now + 60_000).toISOString(), mock: false, status: "issued" as const };
    assert.equal(publishQrExpired(record, now), false);
    assert.equal(publishQrExpired(record, now + 120_000), true);
    assert.equal(publishQrExpired(undefined, now), false);
});
const snapshot: CanvasPublishDraft = { title: "旧标题", body: "旧正文", tags: ["旅行"], imageNodeIds: ["img1", "img2"] };
const issuedRecord: CanvasPublishRecord = { id: "r1", qrText: "qr", expiresAt: "2026-01-01T01:00:00Z", mock: false, status: "issued" };

test("publishDraftSignature ignores surrounding spaces and hashtag prefixes", () => {
    assert.equal(
        publishDraftSignature({ title: " 标题 ", body: "正文", tags: ["#旅行"], imageNodeIds: ["a"] }),
        publishDraftSignature({ title: "标题", body: "正文", tags: ["旅行"], imageNodeIds: ["a"] }),
    );
    assert.notEqual(publishDraftSignature({ ...snapshot }), publishDraftSignature({ ...snapshot, imageNodeIds: ["img2", "img1"] }));
});

test("isPublishDraftDirty compares the current draft with the generated snapshot", () => {
    assert.equal(isPublishDraftDirty(undefined, { ...snapshot, title: "新标题" }, snapshot), false);
    assert.equal(isPublishDraftDirty({ ...issuedRecord, status: "confirmed" }, { ...snapshot, title: "新标题" }, snapshot), false);
    assert.equal(isPublishDraftDirty(issuedRecord, { ...snapshot, title: "新标题" }, undefined), false);
    assert.equal(isPublishDraftDirty(issuedRecord, { ...snapshot }, snapshot), false);
    assert.equal(isPublishDraftDirty(issuedRecord, { ...snapshot, title: "新标题" }, snapshot), true);
    assert.equal(isPublishDraftDirty(issuedRecord, { ...snapshot, body: "新正文" }, snapshot), true);
    assert.equal(isPublishDraftDirty(issuedRecord, { ...snapshot, tags: ["旅行", "摄影"] }, snapshot), true);
    assert.equal(isPublishDraftDirty(issuedRecord, { ...snapshot, imageNodeIds: ["img2", "img1"] }, snapshot), true);
});

const publishNode = nodeAt("publish-node", CanvasNodeType.Publish, { position: { x: 1000, y: 0 }, metadata: { publishSourceId: "source-1" } });
const otherPublishNode = nodeAt("publish-other", CanvasNodeType.Publish, { metadata: { publishSourceId: "source-2" } });
const sourceTextForPublish = nodeAt("source-1-remix-text", CanvasNodeType.Text, { metadata: { content: "复刻文案" } });
const sourceImageForPublish = nodeAt("source-1-remix-image-0", CanvasNodeType.Image, { position: { x: 400, y: 0 }, width: 200, height: 200, metadata: { content: "https://example.com/r.png" } });

test("publish image drag reorder inserts at the target position", () => {
    assert.deepEqual(reorderPublishImageIds(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
    assert.deepEqual(reorderPublishImageIds(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
    assert.deepEqual(reorderPublishImageIds(["a", "b"], "a", "a"), ["a", "b"]);
    assert.deepEqual(reorderPublishImageIds(["a", "b"], "missing", "b"), ["a", "b"]);
});

test("source publish node is reused by metadata.publishSourceId", () => {
    assert.equal(findSourcePublishNode([publishNode, otherPublishNode], "source-1")?.id, "publish-node");
    assert.equal(findSourcePublishNode([otherPublishNode], "source-1"), undefined);
    assert.equal(findSourcePublishNode([publishNode], ""), undefined);
});

test("publish node connections only add missing upstream links", () => {
    const connections = [{ id: "a->p", fromNodeId: "source-1-remix-text", toNodeId: "publish-node" }];
    assert.deepEqual(planPublishNodeConnections("publish-node", ["source-1-remix-text", "img-1", "img-1", "img-2"], connections), ["img-1", "img-2"]);
    assert.deepEqual(planPublishNodeConnections("publish-node", [], connections), []);
});

test("publish node placement sits right of the remix bounding box", () => {
    assert.deepEqual(
        getPublishNodePlacement([sourceTextForPublish, sourceImageForPublish], ["source-1-remix-text", "source-1-remix-image-0"]),
        { x: 600 + 96 + 240, y: 100 },
    );
    assert.equal(getPublishNodePlacement([], []), null);
});

test("source publish plan creates a node once and then only fills missing connections", () => {
    const nodes = [sourceTextForPublish, sourceImageForPublish];
    const created = planSourcePublishNode(nodes, [], "source-1", "source-1-remix-text", ["source-1-remix-image-0"]);
    assert.equal(created.existingPublishNodeId, null);
    assert.deepEqual(created.upstreamNodeIds, ["source-1-remix-text", "source-1-remix-image-0"]);
    assert.deepEqual(created.connectNodeIds, ["source-1-remix-text", "source-1-remix-image-0"]);
    assert.deepEqual(created.createPosition, { x: 600 + 96 + 240, y: 100 });

    const reused = planSourcePublishNode([...nodes, publishNode], [{ id: "a->p", fromNodeId: "source-1-remix-text", toNodeId: "publish-node" }], "source-1", "source-1-remix-text", ["source-1-remix-image-0"]);
    assert.equal(reused.existingPublishNodeId, "publish-node");
    assert.equal(reused.createPosition, null);
    assert.deepEqual(reused.connectNodeIds, ["source-1-remix-image-0"]);
});

const publishLayoutVersion = (node: CanvasNodeData) => (node.metadata as CanvasNodeMetadata & { publishLayoutVersion?: number })?.publishLayoutVersion;

test("migratePublishNodeLayouts upgrades legacy 380x280 publish nodes around their center", () => {
    const legacy = nodeAt("publish-legacy", CanvasNodeType.Publish, { position: { x: 100, y: 50 }, width: 380, height: 280, metadata: {} });
    const current = nodeAt("publish-current", CanvasNodeType.Publish, { width: 480, height: 340, metadata: { publishLayoutVersion: 2 } as CanvasNodeMetadata });
    const custom = nodeAt("publish-custom", CanvasNodeType.Publish, { width: 420, height: 300 });
    const textNode = nodeAt("text-legacy", CanvasNodeType.Text, { width: 380, height: 280 });
    const migrated = migratePublishNodeLayouts([legacy, current, custom, textNode]);
    assert.equal(migrated[0].width, 480);
    assert.equal(migrated[0].height, 340);
    assert.deepEqual(migrated[0].position, { x: 50, y: 20 });
    assert.equal(publishLayoutVersion(migrated[0]), 2);
    assert.equal(migrated[1], current);
    assert.equal(migrated[2], custom);
    assert.equal(migrated[3], textNode);
});

test("migratePublishNodeLayouts keeps the array untouched when nothing needs migration", () => {
    const current = nodeAt("publish-current", CanvasNodeType.Publish, { width: 480, height: 340, metadata: { publishLayoutVersion: 2 } as CanvasNodeMetadata });
    const nodes = [current];
    assert.equal(migratePublishNodeLayouts(nodes), nodes);
});

