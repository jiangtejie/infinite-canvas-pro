"use client";

import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";

/** 分镜图在本地可能只留下 storageKey，挂载后解析成可用 URL，避免刷新后 blob 地址失效。 */
export function useFilmImageUrl(url?: string, storageKey?: string) {
    return useResolvedMediaSrc(url, storageKey);
}

/** 分镜视频同理会留下 storageKey，挂载后解析成可用地址。 */
export function useFilmVideoUrl(url?: string, storageKey?: string) {
    return useResolvedMediaSrc(url, storageKey, "media");
}
