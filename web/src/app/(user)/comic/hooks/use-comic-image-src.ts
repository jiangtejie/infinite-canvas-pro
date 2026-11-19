"use client";

import { useResolvedMediaSrc } from "@/hooks/use-resolved-media-src";
import type { ComicImageRef } from "../types";

export function useComicImageSrc(image?: ComicImageRef) {
    return useResolvedMediaSrc(image?.url, image?.storageKey);
}
