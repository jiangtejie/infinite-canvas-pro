"use client";

import { cn } from "@/lib/utils";
import type { FilmShot } from "@/lib/film/types";
import { useFilmImageUrl } from "../hooks/use-film-image-url";

export function FilmShotThumbnail({ shot, className }: { shot: FilmShot; className?: string }) {
    const src = useFilmImageUrl(shot.imageUrl, shot.storageKey);
    if (!src) return null;
    return <span aria-label={`${shot.shotNo} 分镜图`} className={cn("block bg-cover bg-center", className)} style={{ backgroundImage: `url(${src})` }} />;
}
