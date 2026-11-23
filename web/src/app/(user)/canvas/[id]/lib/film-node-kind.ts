import { CanvasNodeType, type CanvasNodeData, type FilmContextRole } from "../../types";

export const FILM_NODE_TYPES = [
    CanvasNodeType.FilmScript,
    CanvasNodeType.FilmScene,
    CanvasNodeType.FilmShot,
    CanvasNodeType.FilmCharacter,
    CanvasNodeType.FilmLocation,
    CanvasNodeType.FilmProp,
    CanvasNodeType.FilmStyle,
    CanvasNodeType.FilmBeat,
] as const;

/** 上下文角色只认专用影视节点 payload，避免普通节点冒充角色/场景。 */
export function filmContextRoleOfNode(node: CanvasNodeData | undefined): FilmContextRole | null {
    switch (node?.type) {
        case CanvasNodeType.FilmCharacter:
            return node.metadata?.filmCharacter ? "character" : null;
        case CanvasNodeType.FilmLocation:
            return node.metadata?.filmLocation ? "location" : null;
        case CanvasNodeType.FilmProp:
            return node.metadata?.filmProp ? "prop" : null;
        case CanvasNodeType.FilmStyle:
            return node.metadata?.filmStyle ? "style" : null;
        case CanvasNodeType.FilmBeat:
            return node.metadata?.filmBeat ? "beat" : null;
        default:
            return null;
    }
}
