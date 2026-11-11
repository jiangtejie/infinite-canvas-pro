import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { collectBatchTargetNodeIds, collectRemixImageNodeIds, countSourceRemixImages, isBatchTargetImageNode } from "./canvas-batch";

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

const group = node("group", CanvasNodeType.Group);
const text = node("text", CanvasNodeType.Text, { metadata: { content: "文案" } });
const imageA = node("img-a", CanvasNodeType.Image, { metadata: { content: "https://example.com/a.png" } });
const imageB = node("img-b", CanvasNodeType.Image, { metadata: { content: "https://example.com/b.png" } });
const groupImage = node("img-group", CanvasNodeType.Image, { metadata: { content: "https://example.com/g.png", groupId: "group" } });
const batchRoot = node("img-root", CanvasNodeType.Image, { metadata: { content: "https://example.com/root.png", isBatchRoot: true } });
const panorama = node("pano", CanvasNodeType.Panorama, { metadata: { content: "https://example.com/p.png" } });
const video = node("video", CanvasNodeType.Video, { metadata: { content: "https://example.com/v.mp4" } });

test("batch targets keep only directly selected image nodes", () => {
    const nodes = [text, imageA, imageB, video, panorama];
    assert.deepEqual(collectBatchTargetNodeIds(nodes, ["img-a", "img-b", "text", "video"]), ["img-a", "img-b"]);
    assert.deepEqual(collectBatchTargetNodeIds(nodes, ["pano"]), ["pano"]);
});

test("selecting a group targets its image children", () => {
    assert.deepEqual(collectBatchTargetNodeIds([group, imageA, groupImage], ["group"]), ["img-group"]);
});

test("direct selection and group selection dedupe and skip batch roots", () => {
    const nodes = [group, groupImage, imageA, batchRoot];
    assert.deepEqual(collectBatchTargetNodeIds(nodes, ["img-a", "group", "img-group", "img-root"]), ["img-group", "img-a"]);
});

test("non-image nodes and empty selections produce no targets", () => {
    assert.deepEqual(collectBatchTargetNodeIds([text, video, group], ["text", "video", "group"]), []);
    assert.deepEqual(collectBatchTargetNodeIds([imageA], []), []);
});

test("batch target predicate excludes group roots and non-image nodes", () => {
    assert.equal(isBatchTargetImageNode(imageA), true);
    assert.equal(isBatchTargetImageNode(panorama), true);
    assert.equal(isBatchTargetImageNode(batchRoot), false);
    assert.equal(isBatchTargetImageNode(text), false);
});

const source = node("source-1", CanvasNodeType.Source);
const remixOne = node("source-1-remix-image-0", CanvasNodeType.Image, { metadata: { content: "https://example.com/r1.png", remixIndex: 1 } });
const remixTwo = node("source-1-remix-image-1", CanvasNodeType.Image, { metadata: { content: "https://example.com/r2.png", remixIndex: 2 } });
const materialImage = node("source-1-material-image-0", CanvasNodeType.Image, { metadata: { content: "https://example.com/m.png" } });

test("source remix images are collected by id prefix and sorted by remixIndex", () => {
    const nodes = [source, remixTwo, materialImage, remixOne, imageA];
    assert.deepEqual(collectRemixImageNodeIds(nodes, "source-1"), ["source-1-remix-image-0", "source-1-remix-image-1"]);
    assert.equal(countSourceRemixImages(nodes, "source-1"), 2);
    assert.deepEqual(collectRemixImageNodeIds(nodes, "source-2"), []);
});

test("remix images fall back to source metadata when ids changed", () => {
    const copied = node("image-copied", CanvasNodeType.Image, { metadata: { content: "https://example.com/copy.png", remixIndex: 3, remixSourceId: "source-missing" } });
    const otherSource = node("image-other-source", CanvasNodeType.Image, { metadata: { content: "https://example.com/other.png", remixIndex: 1, remixSourceId: "source-other" } });
    const noRemix = node("image-plain", CanvasNodeType.Image, { metadata: { content: "https://example.com/plain.png" } });
    assert.deepEqual(collectRemixImageNodeIds([copied, otherSource, noRemix], "source-missing"), ["image-copied"]);
    assert.deepEqual(collectRemixImageNodeIds([copied, otherSource, noRemix], "source-other"), ["image-other-source"]);
});
