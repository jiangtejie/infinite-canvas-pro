"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getProxyUrl } from "@/services/image-storage";

const MAX_CONCURRENCY = 3;
/** 会话内最多保留的缩略图数量；超出后回收最早且当前没有节点在用的。 */
const CACHE_LIMIT = 320;

/** 会话内缩略图缓存：远景/中景用 384 档代替原图，避免一次性解码整屏大图。 */
const thumbs = new Map<string, string>();
const pending = new Map<string, Promise<void>>();
const failed = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
const queue: Array<() => void> = [];
let active = 0;

function notify(key: string) {
    listeners.get(key)?.forEach((listener) => listener());
}

function evictThumbnails() {
    for (const [key, url] of thumbs) {
        if (thumbs.size <= CACHE_LIMIT) return;
        // 还有节点挂在这里时不回收，避免正在显示的图变成裂图。
        if (listeners.get(key)?.size) continue;
        URL.revokeObjectURL(url);
        thumbs.delete(key);
    }
}

function schedule(task: () => Promise<void>) {
    return new Promise<void>((resolve) => {
        const run = () => {
            active += 1;
            void task()
                .catch(() => undefined)
                .finally(() => {
                    active -= 1;
                    resolve();
                    queue.shift()?.();
                });
        };
        if (active < MAX_CONCURRENCY) run();
        else queue.push(run);
    });
}

async function renderThumbnail(source: string, maxEdge: number) {
    const response = await fetch(getProxyUrl(source));
    if (!response.ok) throw new Error("缩略图拉取失败");
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        bitmap.close();
        throw new Error("缩略图绘制失败");
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) throw new Error("缩略图编码失败");
    return URL.createObjectURL(blob);
}

export function canvasThumbnailUrl(key: string) {
    return thumbs.get(key);
}

export function subscribeCanvasThumbnail(key: string, listener: () => void) {
    const set = listeners.get(key) ?? new Set<() => void>();
    set.add(listener);
    listeners.set(key, set);
    return () => {
        set.delete(listener);
        if (!set.size) listeners.delete(key);
    };
}

/** 按需生成缩略图；失败只记录一次，回退到原图由调用方决定。 */
export function ensureCanvasThumbnail(key: string, source: string, maxEdge: number) {
    if (!key || !source || maxEdge <= 0) return;
    if (thumbs.has(key) || pending.has(key) || failed.has(key)) return;
    const request = schedule(async () => {
        try {
            thumbs.set(key, await renderThumbnail(source, maxEdge));
            evictThumbnails();
            notify(key);
        } catch {
            failed.add(key);
        } finally {
            pending.delete(key);
        }
    });
    pending.set(key, request);
}

export function useCanvasThumbnail(key: string, source: string, maxEdge: number) {
    const enabled = maxEdge > 0 && Boolean(source);
    useEffect(() => {
        if (enabled) ensureCanvasThumbnail(key, source, maxEdge);
    }, [enabled, key, maxEdge, source]);
    const subscribe = useCallback((listener: () => void) => subscribeCanvasThumbnail(key, listener), [key]);
    const read = useCallback(() => (enabled ? canvasThumbnailUrl(key) : undefined), [enabled, key]);
    return useSyncExternalStore(subscribe, read, read);
}
