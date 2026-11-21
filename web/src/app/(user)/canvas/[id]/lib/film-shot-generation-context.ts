import type { FilmAsset, FilmAssetKind, FilmGenerationContext, FilmShot, FilmShotCharacterBinding, FilmShotPropBinding } from "@/lib/film/types";
import { findFilmCharacterState } from "@/app/(user)/film/utils/film-character";
import { buildFilmShotGenerationContext, type FilmGenerationOptions } from "@/app/(user)/film/utils/film-shot-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";

export type FilmGraphGenerationOptions = Omit<FilmGenerationOptions, "previousShot" | "anchorShot"> & {
    includePreviousShot?: boolean;
};

function payloadOf(node: CanvasNodeData | undefined) {
    return node?.type === CanvasNodeType.FilmAsset ? node.metadata?.filmAsset : undefined;
}

function assetsOfKind(nodes: CanvasNodeData[], kind: FilmAssetKind): FilmAsset[] {
    return nodes.flatMap((node) => {
        const payload = payloadOf(node);
        return payload?.kind === kind ? [payload.asset] : [];
    });
}

function shotFromNode(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmShot | null {
    const payload = node.metadata?.filmShot;
    if (!payload) return null;
    const incoming = connections.filter((edge) => edge.kind === "binding" && edge.toNodeId === node.id);
    const characterBindings: FilmShotCharacterBinding[] = incoming.flatMap((edge) => {
        const source = nodes.find((item) => item.id === edge.fromNodeId);
        const assetPayload = payloadOf(source);
        if (!source || !assetPayload || assetPayload.kind !== "character") return [];
        const state = findFilmCharacterState(assetPayload.asset, edge.data?.stateId);
        return [{
            characterId: assetPayload.asset.id,
            stateId: edge.data?.stateId,
            source: edge.data?.source ?? "manual",
            characterNameSnapshot: assetPayload.asset.name,
            stateNameSnapshot: state?.name,
            continuity: edge.data?.continuity ?? {},
        }];
    });
    const propBindings: FilmShotPropBinding[] = incoming.flatMap((edge) => {
        const source = nodes.find((item) => item.id === edge.fromNodeId);
        const assetPayload = payloadOf(source);
        if (!source || !assetPayload || assetPayload.kind !== "prop") return [];
        return [{ propId: assetPayload.asset.id, propNameSnapshot: assetPayload.asset.name, source: edge.data?.source ?? "manual" }];
    });
    const locationEdge = incoming.find((edge) => payloadOf(nodes.find((item) => item.id === edge.fromNodeId))?.kind === "location");
    const locationAsset = locationEdge ? payloadOf(nodes.find((item) => item.id === locationEdge.fromNodeId))?.asset : undefined;
    return {
        ...payload,
        id: node.id,
        characterBindings,
        propBindings,
        locationId: locationAsset?.id,
        locationVariantId: locationEdge?.data?.variantId,
    } as FilmShot;
}

export function selectFilmShotFromGraph(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return shotFromNode(node, nodes, connections);
}

function previousShotOf(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string): FilmShot | undefined {
    const edge = connections.find((item) => item.kind === "sequence" && item.toNodeId === shotId);
    const node = edge ? nodes.find((item) => item.id === edge.fromNodeId) : undefined;
    return node ? shotFromNode(node, nodes, connections) ?? undefined : undefined;
}

export function buildFilmShotGenerationFromGraph(    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotId: string,
    options: FilmGraphGenerationOptions,
): FilmGenerationContext | null {
    const node = nodes.find((item) => item.id === shotId && item.type === CanvasNodeType.Shot);
    if (!node) return null;
    const shot = shotFromNode(node, nodes, connections);
    if (!shot) return null;
    const { includePreviousShot = true, ...generationOptions } = options;
    const style = nodes.find((item) => payloadOf(item)?.kind === "style");
    return buildFilmShotGenerationContext({
        characters: assetsOfKind(nodes, "character"),
        locations: assetsOfKind(nodes, "location"),
        props: assetsOfKind(nodes, "prop"),
        costumes: assetsOfKind(nodes, "costume"),
        style: style ? payloadOf(style)!.asset : undefined,
    }, shot, {
        ...generationOptions,
        previousShot: includePreviousShot ? previousShotOf(nodes, connections, shotId) : undefined,
    });
}
