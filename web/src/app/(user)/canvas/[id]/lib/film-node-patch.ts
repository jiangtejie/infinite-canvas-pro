import type { FilmAsset } from "@/lib/film/types";
import { CanvasNodeType, type CanvasNodeData, type FilmSceneNodeData, type FilmScriptNodeData, type FilmShotNodeData } from "../../types";

export function patchFilmScriptNode(node: CanvasNodeData, patch: Partial<FilmScriptNodeData>): CanvasNodeData {
    if (!node.metadata?.filmScript) return node;
    return { ...node, metadata: { ...node.metadata, filmScript: { ...node.metadata.filmScript, ...patch } } };
}

export function patchFilmSceneNode(node: CanvasNodeData, patch: Partial<FilmSceneNodeData>): CanvasNodeData {
    if (!node.metadata?.filmScene) return node;
    return { ...node, metadata: { ...node.metadata, filmScene: { ...node.metadata.filmScene, ...patch } } };
}

export function patchFilmShotNode(node: CanvasNodeData, patch: Partial<FilmShotNodeData>): CanvasNodeData {
    if (!node.metadata?.filmShot) return node;
    return { ...node, metadata: { ...node.metadata, filmShot: { ...node.metadata.filmShot, ...patch } } };
}

export type FilmContextAssetKey = "filmCharacter" | "filmLocation" | "filmProp" | "filmStyle";

const FILM_CONTEXT_ASSET_KEY: Partial<Record<CanvasNodeType, FilmContextAssetKey>> = {
    [CanvasNodeType.FilmCharacter]: "filmCharacter",
    [CanvasNodeType.FilmLocation]: "filmLocation",
    [CanvasNodeType.FilmProp]: "filmProp",
    [CanvasNodeType.FilmStyle]: "filmStyle",
};

/** 专用上下文节点承载的项目资产 key；普通节点或缺少 payload 时返回 null。 */
export function filmContextAssetKey(node: CanvasNodeData): FilmContextAssetKey | null {
    const key = FILM_CONTEXT_ASSET_KEY[node.type];
    return key && node.metadata?.[key] ? key : null;
}

export function filmContextAsset(node: CanvasNodeData): FilmAsset | undefined {
    const key = filmContextAssetKey(node);
    return key ? node.metadata?.[key]?.asset : undefined;
}

export function patchFilmContextAssetNode(node: CanvasNodeData, patch: Partial<FilmAsset>, now = new Date().toISOString()): CanvasNodeData {
    const key = filmContextAssetKey(node);
    if (!key) return node;
    const payload = node.metadata?.[key];
    if (!payload) return node;
    return {
        ...node,
        metadata: {
            ...node.metadata,
            [key]: { ...payload, asset: { ...payload.asset, ...patch, updatedAt: now } },
        },
    };
}

export function updateFilmContextAssetNode(node: CanvasNodeData, updater: (asset: FilmAsset) => FilmAsset, now = new Date().toISOString()): CanvasNodeData {
    const key = filmContextAssetKey(node);
    if (!key) return node;
    const payload = node.metadata?.[key];
    if (!payload) return node;
    return {
        ...node,
        metadata: {
            ...node.metadata,
            [key]: { ...payload, asset: { ...updater(payload.asset), updatedAt: now } },
        },
    };
}
