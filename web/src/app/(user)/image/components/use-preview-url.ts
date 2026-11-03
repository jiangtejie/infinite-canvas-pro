"use client";

import { useEffect, useSyncExternalStore } from "react";

import { ensureImagePreview, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";

/**
 * 每张可见图片单独订阅预览缓存；未渲染的卡片不会生成或刷新预览。
 */
export function useImagePreviewUrl(key: string, source: string, fallback: string) {
    const storageKey = source && source !== fallback ? source : undefined;

    useEffect(() => {
        void ensureImagePreview(key, fallback, storageKey);
    }, [fallback, key, storageKey]);

    const getSnapshot = () => previewUrlFor(key, source) || fallback;
    return useSyncExternalStore(subscribeImagePreviews, getSnapshot, getSnapshot);
}
