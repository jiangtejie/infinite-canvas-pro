import type { FilmAssetKind } from "./types";

/** 五类影视资产在 UI、库、提示词中的统一名称。 */
export const FILM_ASSET_KIND_LABELS: Record<FilmAssetKind, string> = {
    character: "角色",
    location: "场景",
    prop: "道具",
    costume: "服装",
    style: "风格",
};

export function filmAssetKindLabel(kind: FilmAssetKind) {
    return FILM_ASSET_KIND_LABELS[kind];
}
