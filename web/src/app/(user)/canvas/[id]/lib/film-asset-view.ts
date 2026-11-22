import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { characterPackageImage } from "@/app/(user)/film/utils/film-character";
import { activeSlotImage } from "@/app/(user)/film/utils/film-image-slot";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../../types";
import { selectFilmSceneEntries } from "./film-selectors";

export type FilmAssetViewItem = {
    nodeId: string;
    kind: FilmAssetKind;
    asset: FilmAsset;
    name: string;
    description: string;
    ready: boolean;
    pending: boolean;
    sourceLibraryAssetId?: string;
    usedShots: number;
    usedScenes: number;
    updatedAt: string;
};

export type FilmAssetCoverageBinding = { id: string; name: string; ready: boolean };

export type FilmAssetCoverageItem = {
    sceneId: string;
    label: string;
    shotCount: number;
    characters: FilmAssetCoverageBinding[];
    locations: FilmAssetCoverageBinding[];
    props: FilmAssetCoverageBinding[];
    missing: string[];
};

export type FilmAssetView = {
    groups: Record<FilmAssetKind, FilmAssetViewItem[]>;
    coverage: FilmAssetCoverageItem[];
    totals: { assets: number; ready: number; missing: number; unused: number };
};

const KINDS: FilmAssetKind[] = ["character", "location", "prop", "costume", "style"];

export const EMPTY_FILM_ASSET_VIEW: FilmAssetView = {
    groups: { character: [], location: [], prop: [], costume: [], style: [] },
    coverage: [],
    totals: { assets: 0, ready: 0, missing: 0, unused: 0 },
};

function assetReady(kind: FilmAssetKind, asset: FilmAsset) {
    return kind === "character" ? Boolean(characterPackageImage(asset)) : Boolean(activeSlotImage(asset.concept));
}

function uniqueBindings(items: FilmAssetCoverageBinding[]) {
    return [...new Map(items.map((item) => [item.id, item])).values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function selectFilmAssetView(nodes: CanvasNodeData[], connections: CanvasConnection[]): FilmAssetView {
    const assetNodes = nodes.filter((node) => node.type === CanvasNodeType.FilmAsset && node.metadata?.filmAsset);
    const assetByNodeId = new Map(assetNodes.map((node) => [node.id, node.metadata!.filmAsset!]));
    const scenes = selectFilmSceneEntries(nodes, connections);
    const sceneByShotId = new Map<string, string>();
    scenes.forEach((scene) => scene.shots.forEach((entry) => sceneByShotId.set(entry.shot.id, scene.id)));

    const usage = new Map<string, { shots: Set<string>; scenes: Set<string> }>();
    connections.forEach((edge) => {
        if (edge.kind !== "binding" || !assetByNodeId.has(edge.fromNodeId) || !sceneByShotId.has(edge.toNodeId)) return;
        const current = usage.get(edge.fromNodeId) || { shots: new Set<string>(), scenes: new Set<string>() };
        current.shots.add(edge.toNodeId);
        current.scenes.add(sceneByShotId.get(edge.toNodeId)!);
        usage.set(edge.fromNodeId, current);
    });

    const groups: Record<FilmAssetKind, FilmAssetViewItem[]> = { character: [], location: [], prop: [], costume: [], style: [] };
    assetNodes.forEach((node) => {
        const payload = assetByNodeId.get(node.id)!;
        const uses = usage.get(node.id);
        groups[payload.kind].push({
            nodeId: node.id,
            kind: payload.kind,
            asset: payload.asset,
            name: payload.asset.name || node.title,
            description: payload.asset.description || "",
            ready: assetReady(payload.kind, payload.asset),
            pending: Boolean(payload.asset.pendingTask),
            sourceLibraryAssetId: payload.asset.sourceLibraryAssetId,
            usedShots: uses?.shots.size || 0,
            usedScenes: uses?.scenes.size || 0,
            updatedAt: payload.asset.updatedAt,
        });
    });
    KINDS.forEach((kind) => groups[kind].sort((left, right) => left.name.localeCompare(right.name)));

    const coverage: FilmAssetCoverageItem[] = scenes.map((scene) => {
        const characters: FilmAssetCoverageBinding[] = [];
        const locations: FilmAssetCoverageBinding[] = [];
        const props: FilmAssetCoverageBinding[] = [];
        let missingCharacters = 0;
        let missingLocations = 0;
        scene.shots.forEach((entry) => {
            const bound = connections
                .filter((edge) => edge.kind === "binding" && edge.toNodeId === entry.shot.id)
                .flatMap((edge) => {
                    const payload = assetByNodeId.get(edge.fromNodeId);
                    return payload ? [{ kind: payload.kind, payload }] : [];
                });
            const sceneCharacters = bound.filter((item) => item.kind === "character");
            const sceneLocations = bound.filter((item) => item.kind === "location");
            if (!sceneCharacters.length) missingCharacters += 1;
            if (!sceneLocations.length) missingLocations += 1;
            sceneCharacters.forEach((item) => characters.push({ id: item.payload.asset.id, name: item.payload.asset.name, ready: assetReady("character", item.payload.asset) }));
            sceneLocations.forEach((item) => locations.push({ id: item.payload.asset.id, name: item.payload.asset.name, ready: assetReady("location", item.payload.asset) }));
            bound.filter((item) => item.kind === "prop").forEach((item) => props.push({ id: item.payload.asset.id, name: item.payload.asset.name, ready: assetReady("prop", item.payload.asset) }));
        });
        return {
            sceneId: scene.id,
            label: scene.label,
            shotCount: scene.shots.length,
            characters: uniqueBindings(characters),
            locations: uniqueBindings(locations),
            props: uniqueBindings(props),
            missing: [
                missingCharacters ? `${missingCharacters} 镜未绑定角色` : "",
                missingLocations ? `${missingLocations} 镜未绑定场景` : "",
            ].filter(Boolean),
        };
    });

    const allItems = KINDS.flatMap((kind) => groups[kind]);
    return {
        groups,
        coverage,
        totals: {
            assets: allItems.length,
            ready: allItems.filter((item) => item.ready).length,
            missing: allItems.filter((item) => !item.ready).length,
            unused: allItems.filter((item) => !item.usedShots).length,
        },
    };
}
