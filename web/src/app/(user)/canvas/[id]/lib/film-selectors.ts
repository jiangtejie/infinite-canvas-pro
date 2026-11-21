import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { orderSceneShots } from "./film-layout";
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

export function selectFilmSceneEntries(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmSceneEntry[] {
    const shotNodes = nodes.filter((node) => node.type === CanvasNodeType.Shot);
    const shotById = new Map(shotNodes.map((node) => [node.id, node]));
    const shotIds = new Set(shotNodes.map((node) => node.id));
    const scenes = nodes
        .filter((node) => node.type === CanvasNodeType.Scene)
        .slice()
        .sort((a, b) => {
            const left = sceneMeta(a)?.episodeId || "";
            const right = sceneMeta(b)?.episodeId || "";
            return left.localeCompare(right) || byPosition(a, b);
        });
    const composition = new Map<string, string[]>();
    connections.forEach((edge) => {
        if (edge.kind !== "composition" || !shotIds.has(edge.toNodeId)) return;
        composition.set(edge.fromNodeId, [...(composition.get(edge.fromNodeId) || []), edge.toNodeId]);
    });
    const assigned = new Set<string>();
    let index = 0;
    const entries: FilmSceneEntry[] = scenes.map((sceneNode) => {
        const meta = sceneMeta(sceneNode);
        const episodeTitle = meta?.episodeTitle || "";
        const name = meta?.name || "";
        const label = labelFor(sceneNode);
        const directShots = (composition.get(sceneNode.id) || [])
            .map((id) => shotById.get(id))
            .filter((node): node is CanvasNodeData => Boolean(node) && !assigned.has(node!.id));
        directShots.forEach((node) => assigned.add(node.id));
        const ordered = orderSceneShots(directShots, connections);
        return {
            id: sceneNode.id,
            label,
            episodeTitle,
            name,
            scene: sceneNode,
            shots: ordered.map((shot) => ({
                shot,
                sceneId: sceneNode.id,
                sceneLabel: label,
                episodeTitle,
                index: index++,
            })),
        };
    });
    const unassigned = shotNodes.filter((node) => !assigned.has(node.id));
    if (unassigned.length) {
        const ordered = orderSceneShots(unassigned, connections);
        entries.push({
            id: UNASSIGNED_SCENE_ID,
            label: "未分场",
            episodeTitle: "",
            name: "未分场",
            scene: null,
            shots: ordered.map((shot) => ({
                shot,
                sceneId: UNASSIGNED_SCENE_ID,
                sceneLabel: "未分场",
                episodeTitle: "",
                index: index++,
            })),
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
