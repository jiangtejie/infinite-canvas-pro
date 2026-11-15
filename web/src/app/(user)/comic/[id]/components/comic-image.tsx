"use client";

import type { ComicImageRef } from "../../types";
import { useComicImageSrc } from "../../hooks/use-comic-image-src";

export function ComicImage({ image, className }: { image: ComicImageRef; className?: string }) {
    const src = useComicImageSrc(image);
    return <img src={src} alt="" className={className} draggable={false} />;
}
