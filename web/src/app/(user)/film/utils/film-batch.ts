import type { FilmShot } from "@/lib/film/types";

/** 批量出图：过滤无描述镜头、按需跳过已有图，并把锚点镜头排到最前。 */
export function selectFilmBatchShots(shots: FilmShot[], options: { anchorShotId?: string; skipExisting?: boolean } = {}) {
    return shots
        .filter((shot) => (shot.prompt || shot.description).trim())
        .filter((shot) => !(options.skipExisting && shot.imageUrl))
        .sort((left, right) => left.id === options.anchorShotId ? -1 : right.id === options.anchorShotId ? 1 : 0);
}
