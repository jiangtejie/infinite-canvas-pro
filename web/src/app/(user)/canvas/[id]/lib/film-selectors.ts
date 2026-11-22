import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { orderFilmShots } from "./film-layout";
import type { FilmSceneEntry, FilmShotBindingChip, FilmShotEntry } from "./film-studio-types";

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
    const shotIds = new Set(nodes.filter((node) => node.type === CanvasNodeType.Shot).map((node) => node.id));
    const sceneIds = new Set(nodes.filter((node) => node.type === CanvasNodeType.Scene).map((node) => node.id));
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
    const sceneById = new Map(nodes.filter((node) => node.type === CanvasNodeType.Scene).map((node) => [node.id, node]));
    const shots = nodes.filter((node) => node.type === CanvasNodeType.Shot);
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
export function selectFilmSceneEntries(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmSceneEntry[] {
    const globalEntries = selectFilmShotEntries(nodes, connections);
    const shotsByScene = new Map<string, FilmShotEntry[]>();
    globalEntries.forEach((entry) => {
        shotsByScene.set(entry.sceneId, [...(shotsByScene.get(entry.sceneId) || []), entry]);
    });
    const scenes = nodes
        .filter((node) => node.type === CanvasNodeType.Scene)
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

export function selectFilmShotBindings(nodes: CanvasNodeData[], connections: CanvasConnection[], shotId: string): FilmShotBindingChip[] {
    const seen = new Set<string>();
    return connections
        .filter((edge) => edge.kind === "binding" && edge.toNodeId === shotId)
        .flatMap((edge) => {
            if (seen.has(edge.fromNodeId)) return [];
            const node = nodes.find((item) => item.id === edge.fromNodeId);
            const payload = node?.metadata?.filmAsset;
            if (!node || !payload) return [];
            seen.add(edge.fromNodeId);
            const asset = payload.asset;
            return [{
                id: node.id,
                edgeId: edge.id,
                kind: payload.kind,
                name: asset.name || node.title,
                stateId: edge.data?.stateId,
                stateName: asset.character?.states.find((state) => state.id === edge.data?.stateId)?.name,
                variantId: edge.data?.variantId,
                variantName: asset.location?.variants.find((variant) => variant.id === edge.data?.variantId)?.name,
                continuity: edge.data?.continuity,
                states: asset.character?.states.map((state) => ({ id: state.id, name: state.name })) ?? [],
                variants: asset.location?.variants.map((variant) => ({ id: variant.id, name: variant.name })) ?? [],
            }];
        });
}

export function selectFilmStyleName(nodes: CanvasNodeData[]): string | null {
    const style = nodes.find((node) => node.type === CanvasNodeType.FilmAsset && node.metadata?.filmAsset?.kind === "style");
    return style ? style.metadata?.filmAsset?.asset.name || style.title || null : null;
}
