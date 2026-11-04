"use client";

import { useEffect, useState } from "react";

import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";

/** 分镜图在本地可能只留下 storageKey，挂载后解析成可用 URL，避免刷新后 blob 地址失效。 */
export function useFilmImageUrl(url?: string, storageKey?: string) {
    const [src, setSrc] = useState(url || "");

    useEffect(() => {
        let cancelled = false;
        if (!storageKey) {
            setSrc(url || "");
            return;
        }
        void resolveImageUrl(storageKey, url || "")
            .then((resolved) => {
                if (!cancelled) setSrc(resolved || url || "");
            })
            .catch(() => {
                if (!cancelled) setSrc(url || "");
            });
        return () => {
            cancelled = true;
        };
    }, [storageKey, url]);

    return src;
}

/** 分镜视频同理会留下 storageKey，挂载后解析成可用地址。 */
export function useFilmVideoUrl(url?: string, storageKey?: string) {
    const [src, setSrc] = useState(url || "");

    useEffect(() => {
        let cancelled = false;
        if (!storageKey) {
            setSrc(url || "");
            return;
        }
        void resolveMediaUrl(storageKey, url || "")
            .then((resolved) => {
                if (!cancelled) setSrc(resolved || url || "");
            })
            .catch(() => {
                if (!cancelled) setSrc(url || "");
            });
        return () => {
            cancelled = true;
        };
    }, [storageKey, url]);

    return src;
}
