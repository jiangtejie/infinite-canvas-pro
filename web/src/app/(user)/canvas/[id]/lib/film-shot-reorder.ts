import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { orderFilmShots } from "./film-layout";

export function moveFilmShot(shotIds: string[], draggedId: string, targetId: string, after: boolean) {
    if (draggedId === targetId) return null;
    if (!shotIds.includes(draggedId) || !shotIds.includes(targetId)) return null;
    const next = shotIds.filter((id) => id !== draggedId);
    next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, draggedId);
    return next;
}

export function reorderFilmShotSequence(orderedShotIds: string[], connections: CanvasConnection[]) {
    const ids = new Set(orderedShotIds);
    const kept = connections.filter((edge) => edge.kind !== "sequence" || !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId));
    const chain = orderedShotIds.slice(0, -1).map((id, index) => canvasConnection(id, orderedShotIds[index + 1], { kind: "sequence" }));
    return [...kept, ...chain];
}

/** 跨场移动：一次操作同时改写场次归属与全片镜头链。 */
export function moveFilmShotAcrossScenes(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    shotId: string,
    targetSceneId: string,
    targetShotId: string | null,
    after: boolean,
): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } | null {
    const shot = nodes.find((node) => node.id === shotId && node.type === CanvasNodeType.Shot);
    const targetScene = nodes.find((node) => node.id === targetSceneId && node.type === CanvasNodeType.Scene);
    if (!shot || !targetScene || targetShotId === shotId) return null;
    if (targetShotId && !nodes.find((node) => node.id === targetShotId && node.type === CanvasNodeType.Shot)) return null;
    const shots = nodes.filter((node) => node.type === CanvasNodeType.Shot);
    const shotIds = new Set(shots.map((node) => node.id));
    const orderedIds = orderFilmShots(shots, connections).map((node) => node.id).filter((id) => id !== shotId);
    const sceneOf = new Map<string, string>();
    connections.forEach((edge) => {
        if (edge.kind !== "composition" || !shotIds.has(edge.toNodeId) || sceneOf.has(edge.toNodeId)) return;
        sceneOf.set(edge.toNodeId, edge.fromNodeId);
    });
    let insertIndex = orderedIds.length;
    if (targetShotId) {
        const targetIndex = orderedIds.indexOf(targetShotId);
        if (targetIndex === -1) return null;
        insertIndex = targetIndex + (after ? 1 : 0);
    } else {
        for (let index = orderedIds.length - 1; index >= 0; index -= 1) {
            if (sceneOf.get(orderedIds[index]) === targetSceneId) {
                insertIndex = index + 1;
                break;
            }
        }
    }
    orderedIds.splice(insertIndex, 0, shotId);
    const kept = connections.filter((edge) => {
        if (edge.kind === "sequence" && shotIds.has(edge.fromNodeId) && shotIds.has(edge.toNodeId)) return false;
        return !(edge.kind === "composition" && edge.toNodeId === shotId);
    });
    const chain = orderedIds.slice(0, -1).map((id, index) => canvasConnection(id, orderedIds[index + 1], { kind: "sequence" }));
    return {
        nodes,
        connections: [...kept, canvasConnection(targetSceneId, shotId, { kind: "composition" }), ...chain],
    };
}
