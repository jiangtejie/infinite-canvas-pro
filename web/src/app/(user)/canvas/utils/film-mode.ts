import { CanvasNodeType } from "../types";
import { FILM_NODE_TYPES } from "../[id]/lib/film-node-kind";

const FILM_NODE_TYPE_SET = new Set<CanvasNodeType>(FILM_NODE_TYPES);

export function isFilmCanvasNodeType(type: CanvasNodeType): type is (typeof FILM_NODE_TYPES)[number] {
    return FILM_NODE_TYPE_SET.has(type);
}
