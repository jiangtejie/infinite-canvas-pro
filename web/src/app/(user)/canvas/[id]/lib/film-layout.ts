import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";

export const FILM_LAYOUT = {
    columnWidth: 620,
    rowHeight: 380,
    sceneHeight: 260,
    assetX: -620,
    scriptY: 360,
    assetGap: 460,
} as const;

function byPosition(a: CanvasNodeData, b: CanvasNodeData) {
    return a.position.y - b.position.y || a.position.x - b.position.x;
}

export function orderSceneShots(shots: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const ids = new Set(shots.map((shot) => shot.id));
    const byId = new Map(shots.map((shot) => [shot.id, shot]));
    const sequence = connections.filter((edge) => edge.kind === "sequence" && ids.has(edge.fromNodeId) && ids.has(edge.toNodeId));
    const incoming = new Set(sequence.map((edge) => edge.toNodeId));
    const outgoing = new Map<string, string[]>();
    sequence.forEach((edge) => outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) || []), edge.toNodeId]));
    const ordered: CanvasNodeData[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        const node = byId.get(id);
        if (node) ordered.push(node);
        const next = [...(outgoing.get(id) || [])].sort((left, right) => {
            const a = byId.get(left);
            const b = byId.get(right);
            return a && b ? byPosition(a, b) : 0;
        });
        next.forEach(visit);
    };
    shots.filter((shot) => !incoming.has(shot.id)).sort(byPosition).forEach((shot) => visit(shot.id));
    shots.slice().sort(byPosition).forEach((shot) => visit(shot.id));
    return ordered;
}

export function arrangeFilmNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const scenes = nodes
        .filter((node) => node.type === CanvasNodeType.Scene)
        .slice()
        .sort((a, b) => {
            const left = a.metadata?.filmScene?.episodeId || "";
            const right = b.metadata?.filmScene?.episodeId || "";
            return left.localeCompare(right) || byPosition(a, b);
        });
    const shots = nodes.filter((node) => node.type === CanvasNodeType.Shot);
    const shotById = new Map(shots.map((shot) => [shot.id, shot]));
    const composition = new Map<string, string[]>();
    connections.forEach((edge) => {
        if (edge.kind !== "composition") return;
        composition.set(edge.fromNodeId, [...(composition.get(edge.fromNodeId) || []), edge.toNodeId]);
    });
    const positions = new Map<string, { x: number; y: number }>();
    const assigned = new Set<string>();
    scenes.forEach((scene, index) => {
        positions.set(scene.id, { x: index * FILM_LAYOUT.columnWidth, y: 0 });
        const sceneShots = (composition.get(scene.id) || [])
            .map((id) => shotById.get(id))
            .filter((shot): shot is CanvasNodeData => Boolean(shot));
        sceneShots.forEach((shot) => assigned.add(shot.id));
        orderSceneShots(sceneShots, connections).forEach((shot, shotIndex) => {
            positions.set(shot.id, {
                x: index * FILM_LAYOUT.columnWidth,
                y: FILM_LAYOUT.sceneHeight + shotIndex * FILM_LAYOUT.rowHeight,
            });
        });
    });
    const unassigned = orderSceneShots(shots.filter((shot) => !assigned.has(shot.id)), connections);
    const unassignedX = scenes.length * FILM_LAYOUT.columnWidth;
    unassigned.forEach((shot, index) => {
        positions.set(shot.id, { x: unassignedX, y: index * FILM_LAYOUT.rowHeight });
    });
    const assets = nodes
        .filter((node) => node.type === CanvasNodeType.FilmAsset && node.metadata?.filmAsset?.kind !== "style")
        .slice()
        .sort((a, b) => (a.title || "").localeCompare(b.title || "") || byPosition(a, b));
    assets.forEach((asset, index) => {
        positions.set(asset.id, { x: FILM_LAYOUT.assetX, y: index * FILM_LAYOUT.assetGap });
    });
    const style = nodes.find((node) => node.metadata?.filmAsset?.kind === "style");
    if (style) positions.set(style.id, { x: FILM_LAYOUT.assetX, y: -420 });
    const script = nodes.find((node) => node.type === CanvasNodeType.Script);
    if (script) positions.set(script.id, { x: FILM_LAYOUT.assetX, y: FILM_LAYOUT.scriptY });
    return nodes.map((node) => {
        const next = positions.get(node.id);
        return next ? { ...node, position: next } : node;
    });
}
