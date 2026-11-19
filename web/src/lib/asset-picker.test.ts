import assert from "node:assert/strict";
import test from "node:test";

import { assetInsertPayload, libraryInsertPayload } from "./asset-picker";

test("asset picker keeps storage keys for my assets", () => {
    assert.deepEqual(assetInsertPayload({
        id: "a1",
        kind: "image",
        title: "参考图",
        coverUrl: "https://cdn/ref.png",
        tags: [],
        createdAt: "",
        updatedAt: "",
        data: { dataUrl: "https://cdn/ref.png", storageKey: "server:ref.png", width: 800, height: 600, bytes: 10, mimeType: "image/png" },
    }), {
        kind: "image",
        dataUrl: "https://cdn/ref.png",
        storageKey: "server:ref.png",
        title: "参考图",
        assetId: "a1",
        width: 800,
        height: 600,
        bytes: 10,
        mimeType: "image/png",
        source: "asset",
    });
});

test("asset picker marks library items without local storage keys", () => {
    assert.deepEqual(libraryInsertPayload({ id: "l1", type: "image", title: "库图", url: "https://cdn/lib.png", coverUrl: "https://cdn/lib.png", content: "", description: "", tags: [], category: "", createdAt: "", updatedAt: "" }), {
        kind: "image",
        dataUrl: "https://cdn/lib.png",
        title: "库图",
        assetId: "l1",
        source: "library",
    });
});

test("asset picker maps text assets to content payload", () => {
    assert.deepEqual(assetInsertPayload({
        id: "t1",
        kind: "text",
        title: "文案",
        coverUrl: "",
        tags: [],
        createdAt: "",
        updatedAt: "",
        data: { content: "正文" },
    }), { kind: "text", content: "正文", title: "文案", assetId: "t1", source: "asset" });
});
