import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";

export const FILM_LAYOUT = {
    /** 场次列宽：留给镜头链与右侧动作节拍通道。 */
    columnWidth: 1080,
    sceneHeight: 280,
    shotGap: 40,
    /** 单场镜头超过该数量时，列内按左右两列排布，避免一条超长竖链。 */
    shotGridThreshold: 6,
    /** 两列镜头之间的水平间距。 */
    shotColumnGap: 60,
    /** 上下文带位于所有场次列左侧，不遮挡主链。 */
    contextX: -880,
    contextRowHeight: 480,
    /** 动作节拍贴在其目标镜头右侧，避免打断 sequence 主链。 */
    beatOffsetX: 560,
    beatRowHeight: 460,
} as const;

export function shotHeight(node: CanvasNodeData) {
    return node.height || NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].height;
}

function shotWidth(node: CanvasNodeData) {
    return node.width || NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].width;
}

/**
 * 场次列内镜头位置：默认单列向下；两列时按列优先（左列前半、右列后半），
 * 全片 sequence 只会跨列一次，减少连线回折。
 */
export function layoutSceneShotColumns(sceneX: number, sceneY: number, shots: CanvasNodeData[], twoColumn: boolean): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    if (!twoColumn || shots.length < 2) {
        let y = sceneY + FILM_LAYOUT.sceneHeight;
        shots.forEach((shot) => {
            positions.set(shot.id, { x: sceneX, y });
            y += shotHeight(shot) + FILM_LAYOUT.shotGap;
        });
        return positions;
    }
    const leftCount = Math.ceil(shots.length / 2);
    const columnOffset = Math.max(...shots.map(shotWidth)) + FILM_LAYOUT.shotColumnGap;
    [0, 1].forEach((column) => {
        const start = column === 0 ? 0 : leftCount;
        const end = column === 0 ? leftCount : shots.length;
        let y = sceneY + FILM_LAYOUT.sceneHeight;
        for (let index = start; index < end; index += 1) {
            const shot = shots[index];
            positions.set(shot.id, { x: sceneX + column * columnOffset, y });
            y += shotHeight(shot) + FILM_LAYOUT.shotGap;
        }
    });
    return positions;
}

function byPosition(a: CanvasNodeData, b: CanvasNodeData) {
    return a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id);
}

function byColumn(a: CanvasNodeData, b: CanvasNodeData) {
    return a.position.x - b.position.x || a.position.y - b.position.y || a.id.localeCompare(b.id);
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

function groupShots(nodes: CanvasNodeData[], relations: FilmBoardRelations) {
    const groups = new Map<string, CanvasNodeData[]>();
    nodes.filter((node) => node.type === CanvasNodeType.FilmShot).forEach((shot) => {
        const owner = relations.ownerByShot.get(shot.id);
        if (owner) groups.set(owner, [...(groups.get(owner) || []), shot]);
    });
    return groups;
}

/** 增量放置：只给本次新增节点定位，已有节点保持原位；规则与整板布局一致。 */
export function placeFilmNodes(nodes: CanvasNodeData[], connections: CanvasConnection[], createdNodes: CanvasNodeData[]): CanvasNodeData[] {
    if (!createdNodes.length) return createdNodes;
    const positions = new Map<string, { x: number; y: number }>();
    const relations = buildFilmBoardRelations([...nodes, ...createdNodes], connections);
    const sceneById = new Map([...nodes, ...createdNodes].filter((node) => node.type === CanvasNodeType.FilmScene).map((node) => [node.id, node] as const));
    const existingScenes = nodes.filter((node) => node.type === CanvasNodeType.FilmScene).slice().sort(byColumn);
    const rightmostSceneX = existingScenes.length ? Math.max(...existingScenes.map((node) => node.position.x)) : -FILM_LAYOUT.columnWidth;
    let columnX = rightmostSceneX + FILM_LAYOUT.columnWidth;
    createdNodes.filter((node) => node.type === CanvasNodeType.FilmScene).forEach((scene) => {
        positions.set(scene.id, { x: columnX, y: 0 });
        columnX += FILM_LAYOUT.columnWidth;
    });

    const existingShotsByScene = groupShots(nodes, relations);
    groupShots(createdNodes, relations).forEach((shots, sceneId) => {
        const assigned = positions.get(sceneId);
        const scene = sceneById.get(sceneId);
        const sceneX = assigned?.x ?? scene?.position.x ?? 0;
        const sceneY = assigned?.y ?? scene?.position.y ?? 0;
        const existing = orderFilmShots(existingShotsByScene.get(sceneId) ?? [], connections);
        const existingTwoColumn = existing.some((shot) => Math.abs(shot.position.x - sceneX) > 1);
        const twoColumn = existing.length ? existingTwoColumn : shots.length > FILM_LAYOUT.shotGridThreshold;
        const createdIds = new Set(shots.map((shot) => shot.id));
        layoutSceneShotColumns(sceneX, sceneY, [...existing, ...shots], twoColumn).forEach((position, shotId) => {
            if (createdIds.has(shotId)) positions.set(shotId, position);
        });
    });

    const looseCreated = createdNodes.filter((node) => node.type === CanvasNodeType.FilmShot && !relations.ownerByShot.has(node.id));
    if (looseCreated.length) {
        const looseExisting = nodes.filter((node) => node.type === CanvasNodeType.FilmShot && !relations.ownerByShot.has(node.id)).slice().sort(byPosition);
        let y = looseExisting.length ? Math.max(...looseExisting.map((shot) => shot.position.y + shotHeight(shot))) + FILM_LAYOUT.shotGap : 0;
        const x = rightmostSceneX + FILM_LAYOUT.columnWidth;
        looseCreated.forEach((shot) => {
            positions.set(shot.id, { x, y });
            y += shotHeight(shot) + FILM_LAYOUT.shotGap;
        });
    }

    const existingContexts = nodes.filter((node) => contextRank(node) !== Number.MAX_SAFE_INTEGER);
    let bandY = existingContexts.length ? Math.max(...existingContexts.map((node) => node.position.y)) + FILM_LAYOUT.contextRowHeight : 0;
    const placeInBand = (node: CanvasNodeData) => {
        positions.set(node.id, { x: FILM_LAYOUT.contextX, y: bandY });
        bandY += FILM_LAYOUT.contextRowHeight;
    };
    createdNodes.filter((node) => contextRank(node) !== Number.MAX_SAFE_INTEGER).forEach(placeInBand);

    const beatRow = new Map<string, number>();
    createdNodes.filter((node) => node.type === CanvasNodeType.FilmBeat).forEach((beat) => {
        const target = relations.beatTargetByBeat.get(beat.id);
        const targetPosition = target ? positions.get(target) ?? nodes.find((node) => node.id === target)?.position : undefined;
        if (!target || !targetPosition) {
            placeInBand(beat);
            return;
        }
        const index = beatRow.get(target) ?? 0;
        beatRow.set(target, index + 1);
        positions.set(beat.id, { x: targetPosition.x + FILM_LAYOUT.beatOffsetX, y: targetPosition.y + index * FILM_LAYOUT.beatRowHeight });
    });

    return createdNodes.map((node) => {
        const next = positions.get(node.id);
        return next ? { ...node, position: next } : node;
    });
}

/**
 * 导演板布局：场次按当前列位置稳定分列，镜头按全片 sequence 落在所属场次列内，
 * 剧本/风格/角色/场景/道具进入左侧上下文带，动作节拍贴近其目标镜头。
 * 只返回节点位置，边数据保持原样，不产生持久化派生布局。
 */
export function arrangeFilmDirectorBoard(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const positions = new Map<string, { x: number; y: number }>();
    const scenes = nodes.filter((node) => node.type === CanvasNodeType.FilmScene).slice().sort(byColumn);
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
        layoutSceneShotColumns(x, 0, items, items.length > FILM_LAYOUT.shotGridThreshold).forEach((position, shotId) => positions.set(shotId, position));
    });
    let looseY = 0;
    looseShots.forEach((shot) => {
        positions.set(shot.id, { x: scenes.length * FILM_LAYOUT.columnWidth, y: looseY });
        looseY += shotHeight(shot) + FILM_LAYOUT.shotGap;
    });

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
