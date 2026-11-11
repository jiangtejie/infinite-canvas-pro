import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasPublishDraft, type CanvasPublishRecord } from "../../types";
import { buildDefaultPublishDraft, collectPublishInputs, extractPublishTags, isPublishDraftDirty, publishDraftSignature, publishQrExpired } from "./canvas-publish";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    metadata,
});

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

