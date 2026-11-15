"use client";

import { useEffect, useState } from "react";

import { resolveImageUrl } from "@/services/image-storage";
import type { ComicImageRef } from "../types";

export function useComicImageSrc(image?: ComicImageRef) {
    const [src, setSrc] = useState(image?.url || "");
    useEffect(() => {
        if (!image) {
            setSrc("");
            return;
        }
        let cancelled = false;
        setSrc(image.url);
        void resolveImageUrl(image.storageKey, image.url).then((url) => { if (!cancelled) setSrc(url); }).catch(() => { if (!cancelled) setSrc(image.url); });
        return () => { cancelled = true; };
    }, [image]);
    return src;
}
