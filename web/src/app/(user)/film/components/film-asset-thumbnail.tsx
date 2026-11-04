"use client";

import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilmAsset } from "../types";
import { useFilmImageUrl } from "../hooks/use-film-image-url";

export function FilmAssetThumbnail({ asset, className }: { asset: FilmAsset; className?: string }) {
    const src = useFilmImageUrl(asset.imageUrl, asset.storageKey);
    if (src) {
        return <span aria-label={asset.name} className={cn("block bg-cover bg-center", className)} style={{ backgroundImage: `url(${src})` }} />;
    }
    return (
        <span className={cn("grid place-items-center bg-background/40 text-muted-foreground/35", className)}>
            <ImageIcon className="size-5" aria-hidden />
        </span>
    );
}
