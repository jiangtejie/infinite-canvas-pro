import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";

export const FILM_LAYOUT = {
    /** 场次列宽：留给镜头链与右侧动作节拍通道。 */
    columnWidth: 1080,
    rowHeight: 400,
    sceneHeight: 280,
    /** 上下文带位于所有场次列左侧，不遮挡主链。 */
    contextX: -880,
    contextRowHeight: 480,
    /** 动作节拍贴在其目标镜头右侧，避免打断 sequence 主链。 */
    beatOffsetX: 560,
    beatRowHeight: 460,
} as const;

function byPosition(a: CanvasNodeData, b: CanvasNodeData) {
    return a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id);
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

export type FilmBoardRelations = {
    /** 镜头所属场次；异常重复 composition 时与布局背景统一采用首个。 */
    ownerByShot: Map<string, string>;
    beatTargetByBeat: Map<string, string>;
    beatsByShot: Map<string, CanvasNodeData[]>;
};

/** 导演板布局与背景共用的场次归属、节拍目标投影，避免两套派生漂移。 */
export function buildFilmBoardRelations(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmBoardRelations {
    const sceneIds = new Set(nodes.filter((node) => node.type === CanvasNodeType.FilmScene).map((node) => node.id));
    const shotIds = new Set(nodes.filter((node) => node.type === CanvasNodeType.FilmShot).map((node) => node.id));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const relations: FilmBoardRelations = { ownerByShot: new Map(), beatTargetByBeat: new Map(), beatsByShot: new Map() };
    connections.forEach((edge) => {
        if (edge.kind === "composition" && sceneIds.has(edge.fromNodeId) && shotIds.has(edge.toNodeId) && !relations.ownerByShot.has(edge.toNodeId)) {
            relations.ownerByShot.set(edge.toNodeId, edge.fromNodeId);
        }
        if (edge.kind !== "context" || edge.data.role !== "beat" || !shotIds.has(edge.toNodeId)) return;
        if (!relations.beatTargetByBeat.has(edge.fromNodeId)) relations.beatTargetByBeat.set(edge.fromNodeId, edge.toNodeId);
        const beat = nodeById.get(edge.fromNodeId);
        if (beat) relations.beatsByShot.set(edge.toNodeId, [...(relations.beatsByShot.get(edge.toNodeId) || []), beat]);
    });
    return relations;
}

function byScene(a: CanvasNodeData, b: CanvasNodeData) {
    const left = a.metadata?.filmScene?.episodeId || "";
    const right = b.metadata?.filmScene?.episodeId || "";
    return left.localeCompare(right) || byPosition(a, b);
}

const CONTEXT_RANK: Partial<Record<CanvasNodeType, number>> = {
    [CanvasNodeType.FilmScript]: 0,
    [CanvasNodeType.FilmStyle]: 1,
    [CanvasNodeType.FilmCharacter]: 2,
    [CanvasNodeType.FilmLocation]: 3,
    [CanvasNodeType.FilmProp]: 4,
};

function contextRank(node: CanvasNodeData): number {
    return CONTEXT_RANK[node.type] ?? Number.MAX_SAFE_INTEGER;
}

function contextName(node: CanvasNodeData) {
    return node.metadata?.filmCharacter?.asset.name
        || node.metadata?.filmLocation?.asset.name
        || node.metadata?.filmProp?.asset.name
        || node.metadata?.filmStyle?.asset.name
        || node.title
        || "";
}

/**
 * 导演板布局：场次按集与位置分列，镜头按全片 sequence 落在所属场次列内，
 * 剧本/风格/角色/场景/道具进入左侧上下文带，动作节拍贴近其目标镜头。
 * 只返回节点位置，边数据保持原样，不产生持久化派生布局。
 */
export function arrangeFilmDirectorBoard(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const positions = new Map<string, { x: number; y: number }>();
    const scenes = nodes.filter((node) => node.type === CanvasNodeType.FilmScene).slice().sort(byScene);
    const sceneColumn = new Map(scenes.map((scene, index) => [scene.id, index] as const));
    scenes.forEach((scene, index) => positions.set(scene.id, { x: index * FILM_LAYOUT.columnWidth, y: 0 }));

    const shots = nodes.filter((node) => node.type === CanvasNodeType.FilmShot);
    const relations = buildFilmBoardRelations(nodes, connections);
    const columnShots = new Map<string, CanvasNodeData[]>();
    const looseShots: CanvasNodeData[] = [];
    orderFilmShots(shots, connections).forEach((shot) => {
        const sceneId = relations.ownerByShot.get(shot.id);
        if (sceneId) columnShots.set(sceneId, [...(columnShots.get(sceneId) || []), shot]);
        else looseShots.push(shot);
    });
    columnShots.forEach((items, sceneId) => {
        const x = (sceneColumn.get(sceneId) ?? 0) * FILM_LAYOUT.columnWidth;
        items.forEach((shot, index) => positions.set(shot.id, { x, y: FILM_LAYOUT.sceneHeight + index * FILM_LAYOUT.rowHeight }));
    });
    looseShots.forEach((shot, index) => positions.set(shot.id, { x: scenes.length * FILM_LAYOUT.columnWidth, y: index * FILM_LAYOUT.rowHeight }));

    const contexts = nodes
        .filter((node) => contextRank(node) !== Number.MAX_SAFE_INTEGER)
        .slice()
        .sort((a, b) => contextRank(a) - contextRank(b) || contextName(a).localeCompare(contextName(b)) || byPosition(a, b));
    contexts.forEach((context, index) => positions.set(context.id, { x: FILM_LAYOUT.contextX, y: index * FILM_LAYOUT.contextRowHeight }));

    let bandRow = contexts.length;
    const beatCount = new Map<string, number>();
    nodes
        .filter((node) => node.type === CanvasNodeType.FilmBeat)
        .slice()
        .sort(byPosition)
        .forEach((beat) => {
            const target = relations.beatTargetByBeat.get(beat.id);
            const targetPosition = target ? positions.get(target) : undefined;
            if (targetPosition) {
                const index = beatCount.get(target!) ?? 0;
                beatCount.set(target!, index + 1);
                positions.set(beat.id, { x: targetPosition.x + FILM_LAYOUT.beatOffsetX, y: targetPosition.y + index * FILM_LAYOUT.beatRowHeight });
                return;
            }
            positions.set(beat.id, { x: FILM_LAYOUT.contextX, y: bandRow * FILM_LAYOUT.contextRowHeight });
            bandRow += 1;
        });

    return nodes.map((node) => {
        const next = positions.get(node.id);
        return next ? { ...node, position: next } : node;
    });
}
