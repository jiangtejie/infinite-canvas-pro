import type { FilmAsset } from "@/lib/film/types";
import type { CanvasNodeData, FilmSceneNodeData, FilmScriptNodeData, FilmShotNodeData } from "../../types";

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

export function patchFilmAssetNode(node: CanvasNodeData, patch: Partial<FilmAsset>, now = new Date().toISOString()): CanvasNodeData {
    if (!node.metadata?.filmAsset) return node;
    const payload = node.metadata.filmAsset;
    return {
        ...node,
        metadata: {
            ...node.metadata,
            filmAsset: { ...payload, asset: { ...payload.asset, ...patch, updatedAt: now } },
        },
    };
}
