import type { CanvasConnection } from "../../types";
import { canvasConnection } from "./canvas-connection";

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
