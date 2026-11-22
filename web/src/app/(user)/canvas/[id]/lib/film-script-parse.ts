import { nanoid } from "nanoid";

import type { FilmEpisode, FilmShot } from "@/lib/film/types";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmParseSnapshot, type FilmScriptNodeData, type FilmShotNodeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { orderFilmShots } from "./film-layout";

export type FilmParseGraphResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    scriptPatch: Partial<FilmScriptNodeData>;
    shotCount: number;
    sceneCount: number;
    removedNodeIds: string[];
};

const COLUMN_GAP = 60;
const SHOT_GAP = 32;
const START_GAP = 120;

export function buildFilmParseGraph(
    episodes: FilmEpisode[],
    scriptNode: CanvasNodeData,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    mode: "overwrite" | "append" = "overwrite",
): FilmParseGraphResult {
    const removableNodes = mode === "overwrite" ? nodes.filter((node) => node.type === CanvasNodeType.Scene || node.type === CanvasNodeType.Shot) : [];
    const removedNodeIds = new Set(removableNodes.map((node) => node.id));
    const removedConnections = connections.filter((edge) => removedNodeIds.has(edge.fromNodeId) || removedNodeIds.has(edge.toNodeId));
    const removedConnectionIds = new Set(removedConnections.map((edge) => edge.id));
    const appendScenes = mode === "append" ? nodes.filter((node) => node.type === CanvasNodeType.Scene).length : 0;
    const sceneWidth = NODE_DEFAULT_SIZE[CanvasNodeType.Scene].width;
    const sceneHeight = NODE_DEFAULT_SIZE[CanvasNodeType.Scene].height;
    const shotHeight = NODE_DEFAULT_SIZE[CanvasNodeType.Shot].height;
    const baseX = scriptNode.position.x + scriptNode.width + START_GAP + appendScenes * (sceneWidth + COLUMN_GAP);
    const baseY = scriptNode.position.y;

    const createdNodes: CanvasNodeData[] = [];
    const createdConnections: CanvasConnection[] = [];
    let sceneColumn = 0;
    let shotCount = 0;
    const existingTail = mode === "append"
        ? orderFilmShots(nodes.filter((node) => node.type === CanvasNodeType.Shot), connections).at(-1)?.id ?? ""
        : "";
    let previousShotId = existingTail;
    for (const episode of episodes) {
        for (const scene of episode.scenes) {
            const sceneId = nanoid();
            createdNodes.push({
                id: sceneId,
                type: CanvasNodeType.Scene,
                title: scene.name || "场次",
                position: { x: baseX + sceneColumn * (sceneWidth + COLUMN_GAP), y: baseY },
                width: sceneWidth,
                height: sceneHeight,
                metadata: {
                    status: "idle",
                    filmScene: {
                        episodeId: episode.id,
                        episodeTitle: episode.title || "",
                        name: scene.name || "",
                        location: scene.location || "",
                        time: scene.time || "",
                        mood: scene.mood || "",
                    },
                },
            });
            for (const [shotIndex, shot] of scene.shots.entries()) {
                const shotId = nanoid();
                createdNodes.push({
                    id: shotId,
                    type: CanvasNodeType.Shot,
                    title: shot.shotNo || "镜头",
                    position: { x: baseX + sceneColumn * (sceneWidth + COLUMN_GAP), y: baseY + sceneHeight + 40 + shotIndex * (shotHeight + SHOT_GAP) },
                    width: NODE_DEFAULT_SIZE[CanvasNodeType.Shot].width,
                    height: shotHeight,
                    metadata: { status: "idle", filmShot: shotPayload(shot) },
                });
                createdConnections.push(canvasConnection(sceneId, shotId, { kind: "composition" }));
                if (previousShotId) createdConnections.push(canvasConnection(previousShotId, shotId, { kind: "sequence" }));
                previousShotId = shotId;
                shotCount += 1;
            }
            sceneColumn += 1;
        }
    }

    const snapshot: FilmParseSnapshot = {
        id: nanoid(),
        createdAt: new Date().toISOString(),
        mode,
        nodes: createdNodes,
        connections: createdConnections,
        removedNodes: removableNodes,
        removedConnections,
    };
    const snapshots = [...(scriptNode.metadata?.filmScript?.parseSnapshots ?? []), snapshot].slice(-3);
    const scriptPatch: Partial<FilmScriptNodeData> = { parseSnapshots: snapshots };
    const parsedScriptNode: CanvasNodeData = {
        ...scriptNode,
        metadata: { ...scriptNode.metadata, filmScript: { ...scriptNode.metadata?.filmScript, ...scriptPatch } as FilmScriptNodeData },
    };
    return {
        nodes: [...nodes.filter((node) => !removedNodeIds.has(node.id)).map((node) => node.id === scriptNode.id ? parsedScriptNode : node), ...createdNodes],
        connections: [...connections.filter((edge) => !removedConnectionIds.has(edge.id)), ...createdConnections],
        scriptPatch,
        shotCount,
        sceneCount: sceneColumn,
        removedNodeIds: removableNodes.map((node) => node.id),
    };
}

export function undoFilmParseGraph(scriptNode: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const snapshots = scriptNode.metadata?.filmScript?.parseSnapshots ?? [];
    const snapshot = snapshots[snapshots.length - 1];
    if (!snapshot) return null;
    const generatedNodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const generatedConnectionIds = new Set(snapshot.connections.map((edge) => edge.id));
    const remainingNodes = nodes.filter((node) => !generatedNodeIds.has(node.id));
    const existingNodeIds = new Set(remainingNodes.map((node) => node.id));
    const restoredNodes = (snapshot.removedNodes ?? []).filter((node) => !existingNodeIds.has(node.id));
    const remainingConnections = connections.filter((edge) => !generatedConnectionIds.has(edge.id) && !generatedNodeIds.has(edge.fromNodeId) && !generatedNodeIds.has(edge.toNodeId));
    const existingConnectionIds = new Set(remainingConnections.map((edge) => edge.id));
    const restoredConnections = (snapshot.removedConnections ?? []).filter((edge) => !existingConnectionIds.has(edge.id));
    const scriptPatch: Partial<FilmScriptNodeData> = { parseSnapshots: snapshots.slice(0, -1) };
    const nextScriptNode: CanvasNodeData = {
        ...scriptNode,
        metadata: { ...scriptNode.metadata, filmScript: { ...scriptNode.metadata?.filmScript, ...scriptPatch } as FilmScriptNodeData },
    };
    return {
        nodes: [...remainingNodes.map((node) => node.id === scriptNode.id ? nextScriptNode : node), ...restoredNodes],
        connections: [...remainingConnections, ...restoredConnections],
        scriptPatch,
    };
}

function shotPayload(shot: FilmShot): FilmShotNodeData {
    const copy = { ...shot } as Record<string, unknown>;
    for (const key of ["id", "characterBindings", "propBindings", "locationId", "locationVariantId"]) delete copy[key];
    return copy as FilmShotNodeData;
}
