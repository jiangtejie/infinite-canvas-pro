import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { createCanvasNode } from "./canvas-node-factory";
import { layoutSceneShotColumns, orderFilmShots } from "./film-layout";
import { moveFilmShotAcrossScenes } from "./film-shot-reorder";

export type FilmShotCreateResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    shotId: string;
};

export function appendFilmShot(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    sceneId: string,
    options: { nodeId?: string } = {},
): FilmShotCreateResult | null {
    const scene = nodes.find((node) => node.id === sceneId && node.type === CanvasNodeType.FilmScene);
    if (!scene) return null;
    const shots = nodes.filter((node) => node.type === CanvasNodeType.FilmShot);
    const sceneShotIds = new Set(
        connections
            .filter((edge) => edge.kind === "composition" && edge.fromNodeId === sceneId)
            .map((edge) => edge.toNodeId),
    );
    const sceneShots = orderFilmShots(shots.filter((shot) => sceneShotIds.has(shot.id)), connections);
    const last = sceneShots[sceneShots.length - 1];
    const shotNo = String(shots.length + 1).padStart(2, "0");
    const shot = createCanvasNode(CanvasNodeType.FilmShot, {
        x: scene.position.x,
        y: scene.position.y + scene.height + 60,
    }, {
        filmShot: {
            shotNo,
            shotType: "",
            cameraMovement: "",
            duration: 4,
            description: "",
            dialogue: "",
            audio: "",
            prompt: "",
        },
    }, options.nodeId);
    const existingTwoColumn = sceneShots.some((item) => Math.abs(item.position.x - scene.position.x) > 1);
    const layout = layoutSceneShotColumns(scene.position.x, scene.position.y, [...sceneShots, shot], existingTwoColumn);
    const positioned = { ...shot, position: layout.get(shot.id) ?? shot.position };
    const moved = moveFilmShotAcrossScenes([...nodes, positioned], connections, shot.id, sceneId, last?.id ?? null, true);
    return moved ? { ...moved, shotId: shot.id } : null;
}
