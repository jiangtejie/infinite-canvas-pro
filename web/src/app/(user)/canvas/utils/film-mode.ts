import { CanvasNodeType } from "../types";

export const FILM_CANVAS_DEV = process.env.NEXT_PUBLIC_ENABLE_FILM_CANVAS === "1";

const FILM_NODE_TYPES: CanvasNodeType[] = [
    CanvasNodeType.Script,
    CanvasNodeType.Scene,
    CanvasNodeType.Shot,
    CanvasNodeType.FilmAsset,
];

export function isFilmCanvasNodeType(type: CanvasNodeType) {
    return FILM_NODE_TYPES.includes(type);
}
