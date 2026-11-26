import { nanoid } from "nanoid";

import type { FilmEpisode, FilmShot } from "@/lib/film/types";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmParseSnapshot, type FilmScriptNodeData, type FilmShotNodeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { orderFilmShots, placeFilmNodes } from "./film-layout";

export type FilmParseGraphResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    scriptPatch: Partial<FilmScriptNodeData>;
    shotCount: number;
    sceneCount: number;
    removedNodeIds: string[];
};

export function buildFilmParseGraph(
    episodes: FilmEpisode[],
    scriptNode: CanvasNodeData,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    mode: "overwrite" | "append" = "overwrite",
): FilmParseGraphResult {
    const removableNodes = mode === "overwrite" ? nodes.filter((node) => node.type === CanvasNodeType.FilmScene || node.type === CanvasNodeType.FilmShot) : [];
    const removedNodeIds = new Set(removableNodes.map((node) => node.id));
    const removedConnections = connections.filter((edge) => removedNodeIds.has(edge.fromNodeId) || removedNodeIds.has(edge.toNodeId));
    const removedConnectionIds = new Set(removedConnections.map((edge) => edge.id));
    const sceneWidth = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].width;
    const sceneHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].height;
    const shotHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].height;

    const createdNodes: CanvasNodeData[] = [];
    const createdConnections: CanvasConnection[] = [];
    let sceneColumn = 0;
    let shotCount = 0;
    const existingTail = mode === "append"
        ? orderFilmShots(nodes.filter((node) => node.type === CanvasNodeType.FilmShot), connections).at(-1)?.id ?? ""
        : "";
    let previousShotId = existingTail;
    for (const episode of episodes) {
        for (const scene of episode.scenes) {
            const sceneId = nanoid();
            createdNodes.push({
                id: sceneId,
                type: CanvasNodeType.FilmScene,
                title: scene.name || "场次",
                position: { x: 0, y: 0 },
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
            for (const shot of scene.shots) {
                const shotId = nanoid();
                createdNodes.push({
                    id: shotId,
                    type: CanvasNodeType.FilmShot,
                    title: shot.shotNo || "镜头",
                    position: { x: 0, y: 0 },
                    width: NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].width,
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

    const remainingNodes = nodes.filter((node) => !removedNodeIds.has(node.id));
    const placedNodes = placeFilmNodes(remainingNodes, [...connections, ...createdConnections], createdNodes);
    const snapshot: FilmParseSnapshot = {
        id: nanoid(),
        createdAt: new Date().toISOString(),
        mode,
        nodes: placedNodes,
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
        nodes: [...remainingNodes.map((node) => node.id === scriptNode.id ? parsedScriptNode : node), ...placedNodes],
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
    const updatedNodeIds = new Set((snapshot.updatedNodes ?? []).map((node) => node.id));
    const remainingNodes = nodes.filter((node) => !generatedNodeIds.has(node.id) && !updatedNodeIds.has(node.id));
    const existingNodeIds = new Set(remainingNodes.map((node) => node.id));
    const restoredNodes = [
        ...(snapshot.updatedNodes ?? []),
        ...(snapshot.detachedNodes ?? []),
        ...(snapshot.removedNodes ?? []),
    ].filter((node) => !generatedNodeIds.has(node.id) && (updatedNodeIds.has(node.id) || !existingNodeIds.has(node.id)));
    const remainingConnections = connections.filter((edge) => !generatedConnectionIds.has(edge.id) && !generatedNodeIds.has(edge.fromNodeId) && !generatedNodeIds.has(edge.toNodeId));
    const existingConnectionIds = new Set(remainingConnections.map((edge) => edge.id));
    const restoredConnections = (snapshot.removedConnections ?? []).filter((edge) => !existingConnectionIds.has(edge.id));
    const scriptPatch: Partial<FilmScriptNodeData> = { parseSnapshots: snapshots.slice(0, -1) };
    const restoredScript = restoredNodes.find((node) => node.id === scriptNode.id);
    const nextScriptNode: CanvasNodeData = {
        ...(restoredScript ?? scriptNode),
        metadata: { ...(restoredScript ?? scriptNode).metadata, filmScript: { ...(restoredScript ?? scriptNode).metadata?.filmScript, ...scriptPatch } as FilmScriptNodeData },
    };
    return {
        nodes: [...remainingNodes.filter((node) => node.id !== scriptNode.id), ...restoredNodes.filter((node) => node.id !== scriptNode.id), nextScriptNode],
        connections: [...remainingConnections, ...restoredConnections],
        scriptPatch,
    };
}

function shotPayload(shot: FilmShot): FilmShotNodeData {
    const copy = { ...shot } as Record<string, unknown>;
    for (const key of ["id", "characterBindings", "propBindings", "locationId", "locationVariantId"]) delete copy[key];
    return copy as FilmShotNodeData;
}
