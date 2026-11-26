import type { FilmAsset, FilmGenerationContext, FilmShot, FilmShotCharacterBinding, FilmShotPropBinding } from "@/lib/film/types";
import { findFilmCharacterState } from "@/app/(user)/film/utils/film-character";
import { buildFilmShotGenerationContext, type FilmGenerationOptions } from "@/app/(user)/film/utils/film-shot-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { filmBeatPrompt } from "./film-beat";
import { orderFilmShots } from "./film-layout";

export type FilmGraphGenerationOptions = Omit<FilmGenerationOptions, "previousShot" | "anchorShot"> & {
    includePreviousShot?: boolean;
    costumes?: FilmAsset[];
    stylePresetId?: string;
    directorStyleId?: string;
};

function assetOf(node: CanvasNodeData | undefined): FilmAsset | undefined {
    if (node?.type === CanvasNodeType.FilmCharacter) return node.metadata?.filmCharacter?.asset;
    if (node?.type === CanvasNodeType.FilmLocation) return node.metadata?.filmLocation?.asset;
    if (node?.type === CanvasNodeType.FilmProp) return node.metadata?.filmProp?.asset;
    if (node?.type === CanvasNodeType.FilmStyle) return node.metadata?.filmStyle?.asset;
    return undefined;
}

function assetsOfType(nodes: CanvasNodeData[], type: CanvasNodeType, payloadKey: "filmCharacter" | "filmLocation" | "filmProp" | "filmStyle"): FilmAsset[] {
    return nodes.flatMap((node) => node.type === type && node.metadata?.[payloadKey] ? [node.metadata[payloadKey]!.asset] : []);
}

function shotFromNode(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmShot | null {
    const payload = node.metadata?.filmShot;
    if (!payload) return null;
    const incoming = connections.filter((edge) => edge.kind === "context" && edge.toNodeId === node.id);
    const characterBindings: FilmShotCharacterBinding[] = incoming.flatMap((edge) => {
        if (edge.kind !== "context" || edge.data.role !== "character") return [];
        const source = nodes.find((item) => item.id === edge.fromNodeId && item.type === CanvasNodeType.FilmCharacter);
        const asset = assetOf(source);
        if (!source || !asset) return [];
        const state = findFilmCharacterState(asset, edge.data.stateId);
        return [{
            characterId: asset.id,
            stateId: edge.data.stateId,
            source: edge.data.source,
            characterNameSnapshot: asset.name,
            stateNameSnapshot: state?.name,
            continuity: edge.data.continuity ?? {},
        }];
    });
    const propBindings: FilmShotPropBinding[] = incoming.flatMap((edge) => {
        if (edge.kind !== "context" || edge.data.role !== "prop") return [];
        const source = nodes.find((item) => item.id === edge.fromNodeId && item.type === CanvasNodeType.FilmProp);
        const asset = assetOf(source);
        return asset ? [{ propId: asset.id, propNameSnapshot: asset.name, source: edge.data.source }] : [];
    });
    const locationEdge = incoming.find((edge) => {
        if (edge.kind !== "context" || edge.data.role !== "location") return false;
        return nodes.some((item) => item.id === edge.fromNodeId && item.type === CanvasNodeType.FilmLocation && assetOf(item));
    });
    const locationAsset = locationEdge ? assetOf(nodes.find((item) => item.id === locationEdge.fromNodeId)) : undefined;
    const beatPrompts = incoming.flatMap((edge) => {
        if (edge.kind !== "context" || edge.data.role !== "beat") return [];
        const beat = nodes.find((item) => item.id === edge.fromNodeId && item.type === CanvasNodeType.FilmBeat)?.metadata?.filmBeat;
        const text = filmBeatPrompt(beat);
        return text ? [text] : [];
    });
    return {
        ...payload,
        id: node.id,
        prompt: [payload.prompt, ...beatPrompts].filter(Boolean).join("\n"),
        characterBindings,
        propBindings,
        locationId: locationAsset?.id,
        locationVariantId: locationEdge?.kind === "context" ? locationEdge.data.variantId : undefined,
    } as FilmShot;
}

export function selectFilmShotFromGraph(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return shotFromNode(node, nodes, connections);
}

function previousShotOf(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string): FilmShot | undefined {
    const ordered = orderFilmShots(nodes.filter((item) => item.type === CanvasNodeType.FilmShot), connections);
    const index = ordered.findIndex((item) => item.id === shotId);
    const node = index > 0 ? ordered[index - 1] : undefined;
    return node ? shotFromNode(node, nodes, connections) ?? undefined : undefined;
}

function sceneContextOf(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string) {
    const edge = connections.find((item) => item.kind === "composition" && item.toNodeId === shotId);
    const scene = edge ? nodes.find((item) => item.id === edge.fromNodeId && item.type === CanvasNodeType.FilmScene) : undefined;
    const payload = scene?.metadata?.filmScene;
    if (!payload) return undefined;
    return {
        episodeTitle: payload.episodeTitle,
        name: payload.name,
        location: payload.location,
        time: payload.time,
        mood: payload.mood,
        notes: payload.notes,
    };
}

export function buildFilmShotGenerationFromGraph(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotId: string,
    options: FilmGraphGenerationOptions,
): FilmGenerationContext | null {
    const node = nodes.find((item) => item.id === shotId && item.type === CanvasNodeType.FilmShot);
    if (!node) return null;
    const shot = shotFromNode(node, nodes, connections);
    if (!shot) return null;
    const { includePreviousShot = true, costumes = [], stylePresetId, directorStyleId, ...generationOptions } = options;
    const style = assetsOfType(nodes, CanvasNodeType.FilmStyle, "filmStyle")[0];
    return buildFilmShotGenerationContext({
        characters: assetsOfType(nodes, CanvasNodeType.FilmCharacter, "filmCharacter"),
        locations: assetsOfType(nodes, CanvasNodeType.FilmLocation, "filmLocation"),
        props: assetsOfType(nodes, CanvasNodeType.FilmProp, "filmProp"),
        costumes,
        style,
        stylePreset: stylePresetId,
        directorStyleId,
    }, shot, {
        ...generationOptions,
        previousShot: includePreviousShot ? previousShotOf(nodes, connections, shotId) : undefined,
        sceneContext: sceneContextOf(nodes, connections, shotId),
    });
}
