import type { FilmAsset, FilmShot, FilmStructurePlan } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasFilmMeta, type CanvasNodeData } from "../../types";
import type { FilmContextRole } from "./film-graph-types";
import { selectFilmShotFromGraph } from "./film-shot-generation-context";
import { selectFilmShotEntries, UNASSIGNED_SCENE_ID } from "./film-selectors";
import type { FilmShotEntry } from "./film-studio-types";

export type FilmGraphReviewScene = {
    id: string;
    episodeTitle: string;
    name: string;
    location: string;
    time: string;
    mood: string;
    notes?: string;
    shotIds: string[];
};

export type FilmGraphReviewContext = {
    role: FilmContextRole;
    nodeId: string;
    source: "manual" | "ai";
    asset?: FilmAsset;
    name: string;
    stateId?: string;
    variantId?: string;
    continuity?: {
        outfit?: string;
        physicalCondition?: string;
        heldProps?: string[];
        emotion?: string;
        intentionalChange?: string;
    };
};

export type FilmGraphReviewShot = {
    id: string;
    shot: FilmShot;
    sceneId?: string;
    scene?: FilmGraphReviewScene;
    contexts: FilmGraphReviewContext[];
};

export type FilmGraphReviewInput = {
    title: string;
    scenes: FilmGraphReviewScene[];
    shots: FilmGraphReviewShot[];
    contexts: Array<FilmGraphReviewContext & { shotId: string }>;
    assets: {
        characters: FilmAsset[];
        locations: FilmAsset[];
        props: FilmAsset[];
        costumes: FilmAsset[];
        styles: FilmAsset[];
    };
    style?: FilmAsset;
    script?: { text: string; source?: import("../../types").FilmScriptSource; structurePlan?: FilmStructurePlan };
    filmMeta?: CanvasFilmMeta;
};

function assetData(node: CanvasNodeData | undefined): { role: FilmContextRole; asset?: FilmAsset; name: string } | null {
    switch (node?.type) {
        case CanvasNodeType.FilmCharacter:
            return node.metadata?.filmCharacter ? { role: "character", asset: node.metadata.filmCharacter.asset, name: node.metadata.filmCharacter.asset.name } : null;
        case CanvasNodeType.FilmLocation:
            return node.metadata?.filmLocation ? { role: "location", asset: node.metadata.filmLocation.asset, name: node.metadata.filmLocation.asset.name } : null;
        case CanvasNodeType.FilmProp:
            return node.metadata?.filmProp ? { role: "prop", asset: node.metadata.filmProp.asset, name: node.metadata.filmProp.asset.name } : null;
        case CanvasNodeType.FilmStyle:
            return node.metadata?.filmStyle ? { role: "style", asset: node.metadata.filmStyle.asset, name: node.metadata.filmStyle.asset.name } : null;
        case CanvasNodeType.FilmBeat:
            return node.metadata?.filmBeat ? { role: "beat", name: node.metadata.filmBeat.title || node.title } : null;
        default:
            return null;
    }
}

function scenesFor(entries: FilmShotEntry[], nodes: CanvasNodeData[]): FilmGraphReviewScene[] {
    const sceneNodes = nodes
        .filter((node) => node.type === CanvasNodeType.FilmScene && node.metadata?.filmScene)
        .slice()
        .sort((left, right) => {
            const leftMeta = left.metadata?.filmScene;
            const rightMeta = right.metadata?.filmScene;
            return (leftMeta?.episodeId || "").localeCompare(rightMeta?.episodeId || "")
                || left.position.y - right.position.y
                || left.position.x - right.position.x
                || left.id.localeCompare(right.id);
        });
    const scenes = sceneNodes.flatMap((node) => {
        const data = node.metadata?.filmScene;
        if (!data) return [];
        const shotIds = entries.filter((entry) => entry.sceneId === node.id).map((entry) => entry.shot.id);
        return [{
            id: node.id,
            episodeTitle: data.episodeTitle,
            name: data.name || node.title,
            location: data.location,
            time: data.time,
            mood: data.mood,
            notes: data.notes,
            shotIds,
        }];
    });
    const unassignedShotIds = entries.filter((entry) => entry.sceneId === UNASSIGNED_SCENE_ID).map((entry) => entry.shot.id);
    return unassignedShotIds.length ? [...scenes, {
        id: UNASSIGNED_SCENE_ID,
        episodeTitle: "",
        name: "未分场",
        location: "",
        time: "",
        mood: "",
        shotIds: unassignedShotIds,
    }] : scenes;
}

export function selectFilmReviewInput(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    filmMeta?: CanvasFilmMeta,
    title = "",
    costumes: FilmAsset[] = [],
): FilmGraphReviewInput {
    const entries = selectFilmShotEntries(nodes, connections);
    const scenes = scenesFor(entries, nodes);
    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const shotEntries = entries.flatMap((entry) => {
        if (!entry.shot.metadata?.filmShot) return [];
        const sceneId = connections.find((edge) => edge.kind === "composition" && edge.toNodeId === entry.shot.id && sceneById.has(edge.fromNodeId))?.fromNodeId;
        const contexts = connections.flatMap((edge) => {
            if (edge.kind !== "context" || edge.toNodeId !== entry.shot.id) return [];
            const node = nodeById.get(edge.fromNodeId);
            const source = assetData(node);
            if (source && source.role !== edge.data.role) return [];
            return [{
                role: edge.data.role,
                nodeId: edge.fromNodeId,
                source: edge.data.source,
                asset: source?.asset,
                name: source?.name || node?.title || edge.fromNodeId,
                stateId: edge.data.stateId,
                variantId: edge.data.variantId,
                continuity: edge.data.continuity,
            }];
        });
        const shot = selectFilmShotFromGraph(entry.shot, nodes, connections);
        if (!shot) return [];
        return [{ id: entry.shot.id, shot, sceneId, scene: sceneId ? sceneById.get(sceneId) : undefined, contexts }];
    });
    const contexts = shotEntries.flatMap((shot) => shot.contexts.map((context) => ({ ...context, shotId: shot.id })));
    const assets = {
        characters: nodes.flatMap((node) => node.type === CanvasNodeType.FilmCharacter && node.metadata?.filmCharacter ? [node.metadata.filmCharacter.asset] : []),
        locations: nodes.flatMap((node) => node.type === CanvasNodeType.FilmLocation && node.metadata?.filmLocation ? [node.metadata.filmLocation.asset] : []),
        props: nodes.flatMap((node) => node.type === CanvasNodeType.FilmProp && node.metadata?.filmProp ? [node.metadata.filmProp.asset] : []),
        costumes,
        styles: nodes.flatMap((node) => node.type === CanvasNodeType.FilmStyle && node.metadata?.filmStyle ? [node.metadata.filmStyle.asset] : []),
    };
    const scriptNode = nodes.find((node) => node.type === CanvasNodeType.FilmScript && node.metadata?.filmScript);
    const script = scriptNode?.metadata?.filmScript;
    const style = assets.styles[0];
    return {
        title,
        scenes,
        shots: shotEntries,
        contexts,
        assets,
        style,
        script: script ? { text: script.text, source: script.source, structurePlan: script.structurePlan } : undefined,
        filmMeta,
    };
}
