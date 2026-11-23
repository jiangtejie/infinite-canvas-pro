import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmContextRole } from "../../types";
import { orderFilmShots } from "./film-layout";
import { filmContextRoleOfNode } from "./film-node-kind";
import type { FilmSceneEntry, FilmShotContextChip, FilmShotEntry } from "./film-studio-types";

export const UNASSIGNED_SCENE_ID = "unassigned";

function sceneMeta(node: CanvasNodeData) {
    return node.metadata?.filmScene;
}

function labelFor(scene: CanvasNodeData) {
    const meta = sceneMeta(scene);
    return [meta?.episodeTitle, meta?.name].filter(Boolean).join(" · ") || "未命名场次";
}

function byPosition(a: CanvasNodeData, b: CanvasNodeData) {
    return a.position.y - b.position.y || a.position.x - b.position.x;
}

function sceneOwnerMap(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const shotIds = new Set(nodes.filter((node) => node.type === CanvasNodeType.FilmShot).map((node) => node.id));
    const sceneIds = new Set(nodes.filter((node) => node.type === CanvasNodeType.FilmScene).map((node) => node.id));
    const owners = new Map<string, string>();
    connections.forEach((edge) => {
        if (edge.kind !== "composition" || !shotIds.has(edge.toNodeId) || !sceneIds.has(edge.fromNodeId) || owners.has(edge.toNodeId)) return;
        owners.set(edge.toNodeId, edge.fromNodeId);
    });
    return owners;
}

/** 全片顺序投影：跨场交错时仍按唯一 sequence 链输出。 */
export function selectFilmShotEntries(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmShotEntry[] {
    const owners = sceneOwnerMap(nodes, connections);
    const sceneById = new Map(nodes.filter((node) => node.type === CanvasNodeType.FilmScene).map((node) => [node.id, node]));
    const shots = nodes.filter((node) => node.type === CanvasNodeType.FilmShot);
    return orderFilmShots(shots, connections).map((shot, index) => {
        const scene = owners.get(shot.id) ? sceneById.get(owners.get(shot.id)!) : undefined;
        return {
            shot,
            sceneId: scene?.id ?? UNASSIGNED_SCENE_ID,
            sceneLabel: scene ? labelFor(scene) : "未分场",
            episodeTitle: sceneMeta(scene ?? shot)?.episodeTitle || "",
            index,
        };
    });
}

/** 按场分组投影；场次内镜头顺序始终来自全片链，而不是各场独立数组。 */
export function selectFilmSceneEntries(nodes: CanvasNodeData[], connections: CanvasConnection[], shotEntries?: FilmShotEntry[]): FilmSceneEntry[] {
    const globalEntries = shotEntries ?? selectFilmShotEntries(nodes, connections);
    const shotsByScene = new Map<string, FilmShotEntry[]>();
    globalEntries.forEach((entry) => {
        shotsByScene.set(entry.sceneId, [...(shotsByScene.get(entry.sceneId) || []), entry]);
    });
    const scenes = nodes
        .filter((node) => node.type === CanvasNodeType.FilmScene)
        .slice()
        .sort((a, b) => {
            const left = sceneMeta(a)?.episodeId || "";
            const right = sceneMeta(b)?.episodeId || "";
            return left.localeCompare(right) || byPosition(a, b);
        });
    const entries: FilmSceneEntry[] = scenes.map((sceneNode) => {
        const meta = sceneMeta(sceneNode);
        return {
            id: sceneNode.id,
            label: labelFor(sceneNode),
            episodeTitle: meta?.episodeTitle || "",
            name: meta?.name || "",
            scene: sceneNode,
            shots: shotsByScene.get(sceneNode.id) ?? [],
        };
    });
    const unassigned = shotsByScene.get(UNASSIGNED_SCENE_ID) ?? [];
    if (unassigned.length) {
        entries.push({
            id: UNASSIGNED_SCENE_ID,
            label: "未分场",
            episodeTitle: "",
            name: "未分场",
            scene: null,
            shots: unassigned,
        });
    }
    return entries;
}

export function selectActiveFilmShot(
    scenes: FilmSceneEntry[],
    preferredSceneId: string | null,
    preferredShotId: string | null,
): { scene: FilmSceneEntry | null; shot: FilmShotEntry | null } {
    let scene = preferredSceneId ? scenes.find((item) => item.id === preferredSceneId) ?? null : null;
    if (!scene && preferredShotId) {
        scene = scenes.find((item) => item.shots.some((entry) => entry.shot.id === preferredShotId)) ?? null;
    }
    scene = scene ?? scenes[0] ?? null;
    if (!scene) return { scene: null, shot: null };
    const shot = (preferredShotId ? scene.shots.find((entry) => entry.shot.id === preferredShotId) : undefined) ?? scene.shots[0] ?? null;
    return { scene, shot };
}

/** 镜头聚焦只跟随唯一 active shot；上一镜/下一镜始终来自全片顺序链。 */
export function selectFilmShotFocus(entries: FilmShotEntry[], activeShotId: string | null): { entry: FilmShotEntry | null; index: number; prev: FilmShotEntry | null; next: FilmShotEntry | null } {
    const index = activeShotId ? entries.findIndex((entry) => entry.shot.id === activeShotId) : -1;
    return {
        entry: index >= 0 ? entries[index] : null,
        index,
        prev: index > 0 ? entries[index - 1] : null,
        next: index >= 0 && index < entries.length - 1 ? entries[index + 1] : null,
    };
}

function shotContextChip(edge: Extract<CanvasConnection, { kind: "context" }>, node: CanvasNodeData, role: FilmContextRole): FilmShotContextChip {
    const asset = node.metadata?.filmCharacter?.asset
        ?? node.metadata?.filmLocation?.asset
        ?? node.metadata?.filmProp?.asset
        ?? node.metadata?.filmStyle?.asset;
    const states = asset?.character?.states.map((state) => ({ id: state.id, name: state.name })) ?? [];
    const variants = asset?.location?.variants.map((variant) => ({ id: variant.id, name: variant.name })) ?? [];
    return {
        id: node.id,
        edgeId: edge.id,
        role,
        name: asset?.name || node.metadata?.filmBeat?.title || node.title,
        stateId: edge.data.stateId,
        stateName: states.find((state) => state.id === edge.data.stateId)?.name,
        variantId: edge.data.variantId,
        variantName: variants.find((variant) => variant.id === edge.data.variantId)?.name,
        continuity: edge.data.continuity,
        states,
        variants,
    };
}

/** 全片 context 投影：一次建立节点索引并扫描连线，供镜头表、检查器与聚焦共用。 */
export function selectFilmShotContextsByShot(nodes: CanvasNodeData[], connections: CanvasConnection[], shotIds?: Iterable<string>): Record<string, FilmShotContextChip[]> {
    const allowed = shotIds ? new Set(shotIds) : null;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const seen = new Set<string>();
    const result: Record<string, FilmShotContextChip[]> = {};
    for (const edge of connections) {
        if (edge.kind !== "context" || (allowed && !allowed.has(edge.toNodeId))) continue;
        const node = nodeById.get(edge.fromNodeId);
        const role = filmContextRoleOfNode(node);
        if (!node || !role || role !== edge.data.role) continue;
        const key = `${edge.toNodeId}:${node.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        (result[edge.toNodeId] ||= []).push(shotContextChip(edge, node, role));
    }
    return result;
}

export function selectFilmShotContexts(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string): FilmShotContextChip[] {
    return selectFilmShotContextsByShot(nodes, connections, [shotId])[shotId] ?? [];
}

export function selectFilmStyleName(nodes: CanvasNodeData[]): string | null {
    const style = nodes.find((node) => node.type === CanvasNodeType.FilmStyle && node.metadata?.filmStyle);
    return style ? style.metadata?.filmStyle?.asset.name || style.title || null : null;
}
