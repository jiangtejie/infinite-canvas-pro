import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { createCanvasNode } from "./canvas-node-factory";
import { orderSceneShots } from "./film-layout";

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
    const scene = nodes.find((node) => node.id === sceneId && node.type === CanvasNodeType.Scene);
    if (!scene) return null;
    const shots = nodes.filter((node) => node.type === CanvasNodeType.Shot);
    const sceneShotIds = new Set(
        connections
            .filter((edge) => edge.kind === "composition" && edge.fromNodeId === sceneId)
            .map((edge) => edge.toNodeId),
    );
    const sceneShots = orderSceneShots(shots.filter((shot) => sceneShotIds.has(shot.id)), connections);
    const last = sceneShots[sceneShots.length - 1];
    const shotNo = String(shots.length + 1).padStart(2, "0");
    const shot = createCanvasNode(CanvasNodeType.Shot, {
        x: scene.position.x,
        y: last ? last.position.y + 380 : scene.position.y + scene.height + 60,
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
    const nextConnections = [
        ...connections,
        canvasConnection(scene.id, shot.id, { kind: "composition" }),
        ...(last ? [canvasConnection(last.id, shot.id, { kind: "sequence" })] : []),
    ];
    return { nodes: [...nodes, shot], connections: nextConnections, shotId: shot.id };
}
