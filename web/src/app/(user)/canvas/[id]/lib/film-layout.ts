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

/** 按全片 sequence 链排序；分叉/断链按位置确定性兜底，保证所有镜头可见。 */
export function orderFilmShots(shots: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const byId = new Map(shots.map((shot) => [shot.id, shot]));
    const incoming = new Set<string>();
    const outgoing = new Map<string, string[]>();
    connections.forEach((edge) => {
        if (edge.kind !== "sequence" || !byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) return;
        incoming.add(edge.toNodeId);
        outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) || []), edge.toNodeId]);
    });
    const byPositionId = (left: string, right: string) => {
        const a = byId.get(left);
        const b = byId.get(right);
        return a && b ? byPosition(a, b) : 0;
    };
    const ordered: CanvasNodeData[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
        let current: string | undefined = id;
        while (current && !seen.has(current)) {
            seen.add(current);
            const node = byId.get(current);
            if (node) ordered.push(node);
            current = [...(outgoing.get(current) || [])].sort(byPositionId)[0];
        }
    };
    shots.filter((shot) => !incoming.has(shot.id)).sort(byPosition).forEach((shot) => visit(shot.id));
    shots.slice().sort(byPosition).forEach((shot) => visit(shot.id));
    return ordered;
}

export function orderSceneShots(shots: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    return orderFilmShots(shots, connections);
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
    const globalIndex = new Map(orderFilmShots(shots, connections).map((node, index) => [node.id, index]));
    const byGlobalOrder = (a: CanvasNodeData, b: CanvasNodeData) =>
        (globalIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (globalIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER) || byPosition(a, b);
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
        sceneShots.slice().sort(byGlobalOrder).forEach((shot, shotIndex) => {
            positions.set(shot.id, {
                x: index * FILM_LAYOUT.columnWidth,
                y: FILM_LAYOUT.sceneHeight + shotIndex * FILM_LAYOUT.rowHeight,
            });
        });
    });
    const unassigned = shots.filter((shot) => !assigned.has(shot.id)).sort(byGlobalOrder);
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
