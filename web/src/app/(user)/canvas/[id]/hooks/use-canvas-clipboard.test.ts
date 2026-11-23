import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasNodeData } from "../../types";
import { selectClipboardNodes } from "./use-canvas-clipboard";

const node = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata,
});

test("copies selected generic nodes and expands selected generic groups", () => {
    const nodes = [
        node("group", CanvasNodeType.Group),
        node("image", CanvasNodeType.Image, { groupId: "group", content: "image.png" }),
        node("standalone", CanvasNodeType.Text, { content: "text" }),
    ];
    const selected = new Set(["group", "standalone"]);
    assert.deepEqual(selectClipboardNodes(nodes, selected).map((item) => item.id), ["group", "image", "standalone"]);
});

test("never copies film nodes, including film children of a selected group", () => {
    const nodes = [
        node("group", CanvasNodeType.Group),
        node("image", CanvasNodeType.Image, { groupId: "group" }),
        node("style", CanvasNodeType.FilmStyle, { groupId: "group" }),
        node("shot", CanvasNodeType.FilmShot),
    ];
    assert.deepEqual(selectClipboardNodes(nodes, new Set(["group", "shot"])).map((item) => item.id), ["group", "image"]);
    assert.deepEqual(selectClipboardNodes(nodes, new Set(["style", "shot"])), []);
});
