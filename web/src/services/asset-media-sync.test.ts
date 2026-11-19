import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";
import { applyAssetMediaPromotions, assetMediaNeedsPromotion } from "./asset-media-sync";
import type { MediaPromotionReplacement } from "./media-promotion";

const updatedAt = "2026-01-01T00:00:00.000Z";
const replacements = new Map<string, MediaPromotionReplacement>([
    ["image:local", { url: "blob:image-new", storageKey: "server:image", width: 1024, height: 768 }],
    ["video:local", { url: "blob:video-new", storageKey: "server:video" }],
    ["data:cover", { url: "https://cdn.example.com/cover.png", storageKey: "server:cover" }],
]);

test("我的素材同步前会升级图片、视频与封面", () => {
    const image: Asset = {
        id: "a1", kind: "image", title: "图", coverUrl: "blob:image", tags: [], createdAt: updatedAt, updatedAt,
        data: { dataUrl: "blob:image", storageKey: "image:local", width: 0, height: 0, bytes: 3, mimeType: "image/png" },
    };
    const video: Asset = {
        id: "a2", kind: "video", title: "视频", coverUrl: "", tags: [], createdAt: updatedAt, updatedAt,
        data: { url: "blob:video", storageKey: "video:local", width: 0, height: 0, bytes: 5, mimeType: "video/mp4" },
    };
    const text: Asset = {
        id: "a3", kind: "text", title: "文案", coverUrl: "data:cover", tags: [], createdAt: updatedAt, updatedAt,
        data: { content: "内容" },
    };
    const applied = applyAssetMediaPromotions([image, video, text], replacements);
    assert.equal(applied.changed, true);
    const savedImage = applied.assets[0];
    assert.equal(savedImage.kind, "image");
    if (savedImage.kind === "image") {
        assert.equal(savedImage.data.storageKey, "server:image");
        assert.equal(savedImage.data.dataUrl, "blob:image-new");
        assert.equal(savedImage.data.width, 1024);
    }
    const savedVideo = applied.assets[1];
    assert.equal(savedVideo.kind, "video");
    if (savedVideo.kind === "video") {
        assert.equal(savedVideo.data.storageKey, "server:video");
        assert.equal(savedVideo.data.url, "blob:video-new");
    }
    assert.equal(applied.assets[2].coverUrl, "https://cdn.example.com/cover.png");
    assert.notEqual(applied.assets[0].updatedAt, updatedAt);
});

test("只有本地媒体才需要升级；无命中时保持原引用", () => {
    const local: Asset = {
        id: "a1", kind: "image", title: "图", coverUrl: "", tags: [], createdAt: updatedAt, updatedAt,
        data: { dataUrl: "blob:image", storageKey: "image:local", width: 0, height: 0, bytes: 3, mimeType: "image/png" },
    };
    const remote: Asset = {
        id: "a2", kind: "image", title: "云图", coverUrl: "", tags: [], createdAt: updatedAt, updatedAt,
        data: { dataUrl: "https://cdn.example.com/a.png", storageKey: "server:a", width: 10, height: 10, bytes: 3, mimeType: "image/png" },
    };
    assert.equal(assetMediaNeedsPromotion([local]), true);
    assert.equal(assetMediaNeedsPromotion([remote]), false);
    const untouched = applyAssetMediaPromotions([remote], new Map());
    assert.equal(untouched.changed, false);
    assert.equal(untouched.assets[0], remote);
});
