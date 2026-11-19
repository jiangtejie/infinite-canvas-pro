"use client";

import { useEffect, useState } from "react";

import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";

/** 挂载后把 storageKey 解析成可用地址；刷新后失效的 blob URL 由 storageKey 兜底恢复。 */
export function useResolvedMediaSrc(url?: string, storageKey?: string, kind: "image" | "media" = "image") {
    const [src, setSrc] = useState(url || "");

    useEffect(() => {
        let cancelled = false;
        if (!storageKey) {
            setSrc(url || "");
            return;
        }
        setSrc(url || "");
        const resolve = kind === "image" ? resolveImageUrl : resolveMediaUrl;
        void resolve(storageKey, url || "")
            .then((resolved) => {
                if (!cancelled) setSrc(resolved || url || "");
            })
            .catch(() => {
                if (!cancelled) setSrc(url || "");
            });
        return () => {
            cancelled = true;
        };
    }, [storageKey, url, kind]);

    return src;
}
