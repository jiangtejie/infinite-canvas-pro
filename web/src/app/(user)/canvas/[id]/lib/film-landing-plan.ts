import { nanoid } from "nanoid";

import type { FilmEpisode, FilmScene, FilmShot } from "@/lib/film/types";
import { NODE_DEFAULT_SIZE } from "../../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmParseSnapshot, type FilmSceneNodeData, type FilmScriptNodeData, type FilmShotNodeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { placeFilmNodes } from "./film-layout";
import type { FilmParseGraphResult } from "./film-script-parse";

export type FilmAnalysisLandingMode = "merge" | "replace";

export type FilmLandingTarget = { key: string; nodeId: string; protected?: boolean };

export type FilmAnalysisLandingPlan = {
    added: FilmLandingTarget[];
    updated: FilmLandingTarget[];
    kept: FilmLandingTarget[];
    protected: FilmLandingTarget[];
    removed: FilmLandingTarget[];
};

const SHOT_EDIT_FIELDS = ["shotNo", "shotType", "cameraMovement", "duration", "description", "dialogue", "audio", "prompt", "negativePrompt", "performance", "soundDesign", "coverage", "composition", "lighting", "colorTone", "lens", "transition", "videoMode", "videoPrompt"] as const;

function normalizeKey(value: string) {
    return (value || "").trim().toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function filmAnalysisSceneKey(episodeTitle: string, sceneName: string) {
    return `ai:${normalizeKey(episodeTitle)}::${normalizeKey(sceneName)}`;
}

export function filmAnalysisShotKey(sceneKey: string, index: number) {
    return `${sceneKey}#${index}`;
}

/** AI 来源键以 ai: 开头，来源刷新只处理工作台键，不接管 AI 节点。 */
export function isFilmAnalysisSourceKey(key: string | undefined) {
    return Boolean(key?.startsWith("ai:"));
}

function shotSourcePayload(shot: FilmShot): FilmShotNodeData {
    const copy = { ...shot } as Record<string, unknown>;
    for (const key of ["id", "characterBindings", "propBindings", "locationId", "locationVariantId"]) delete copy[key];
    return copy as FilmShotNodeData;
}

function sceneSourceData(episode: FilmEpisode, scene: FilmScene, key: string): FilmSceneNodeData {
    return {
        episodeId: episode.id,
        episodeTitle: episode.title,
        name: scene.name,
        location: scene.location,
        time: scene.time,
        mood: scene.mood,
        scriptSourceKey: key,
    };
}

function hasMedia(shot: FilmShotNodeData | undefined) {
    return Boolean(shot && (
        shot.imageUrl || shot.videoUrl || shot.storageKey || shot.videoStorageKey
        || shot.firstFrame || shot.lastFrame || shot.imageVersions?.length || shot.videoVersions?.length
        || shot.videoSegments?.length || shot.pendingTask
    ));
}

function lastLandedShots(scriptNode: CanvasNodeData) {
    const snapshot = [...(scriptNode.metadata?.filmScript?.parseSnapshots ?? [])].reverse().find((item) => item.mode !== "refresh");
    const map = new Map<string, FilmShotNodeData>();
    [...(snapshot?.nodes ?? []), ...(snapshot?.updatedNodes ?? [])].forEach((node) => {
        if (node.type === CanvasNodeType.FilmShot && node.metadata?.filmShot) map.set(node.id, node.metadata.filmShot);
    });
    return map;
}

function protectedShot(node: CanvasNodeData, connections: CanvasConnection[], landedShots: Map<string, FilmShotNodeData>) {
    const shot = node.metadata?.filmShot;
    if (!shot) return false;
    if (hasMedia(shot) || node.metadata?.status !== "idle") return true;
    if (connections.some((edge) => edge.kind === "context" && edge.toNodeId === node.id && edge.data.source !== "ai")) return true;
    const landed = landedShots.get(node.id);
    return Boolean(landed && SHOT_EDIT_FIELDS.some((key) => JSON.stringify(shot[key]) !== JSON.stringify(landed[key])));
}

function pushTarget(list: FilmLandingTarget[], key: string, nodeId: string, isProtected = false) {
    list.push(isProtected ? { key, nodeId, protected: true } : { key, nodeId });
}

/** 追加模式不匹配现有节点，只预览将新增与保留的数量。 */
export function planFilmAppendLanding(nodes: CanvasNodeData[], episodes: FilmEpisode[]): FilmAnalysisLandingPlan {
    const added: FilmLandingTarget[] = [];
    episodes.forEach((episode) => episode.scenes.forEach((scene) => {
        const sceneKey = filmAnalysisSceneKey(episode.title, scene.name);
        added.push({ key: sceneKey, nodeId: sceneKey });
        scene.shots.forEach((_, index) => {
            const key = filmAnalysisShotKey(sceneKey, index);
            added.push({ key, nodeId: key });
        });
    }));
    const kept = nodes
        .filter((node) => node.type === CanvasNodeType.FilmScene || node.type === CanvasNodeType.FilmShot)
        .map((node) => ({
            key: (node.type === CanvasNodeType.FilmScene ? node.metadata?.filmScene?.scriptSourceKey : node.metadata?.filmShot?.scriptSourceKey) || node.id,
            nodeId: node.id,
        }));
    return { added, updated: [], kept, protected: [], removed: [] };
}

/**
 * 导演分析落图：replace 重建全部场次/镜头；merge 按 AI 来源键复用场次与镜头，
 * 受保护镜头保留媒体与人工修改，未匹配的现有 AI 节点保留。
 */
export function buildFilmAnalysisLandingGraph(
    episodes: FilmEpisode[],
    scriptNode: CanvasNodeData,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    mode: FilmAnalysisLandingMode,
): FilmParseGraphResult & { plan: FilmAnalysisLandingPlan } {
    const replace = mode === "replace";
    const removableNodes = replace ? nodes.filter((node) => node.type === CanvasNodeType.FilmScene || node.type === CanvasNodeType.FilmShot) : [];
    const removedNodeIds = new Set(removableNodes.map((node) => node.id));
    const removedConnections = connections.filter((edge) => removedNodeIds.has(edge.fromNodeId) || removedNodeIds.has(edge.toNodeId));
    const removedConnectionIds = new Set(removedConnections.map((edge) => edge.id));
    const landedShots = lastLandedShots(scriptNode);
    const existingScenes = new Map<string, CanvasNodeData>();
    const existingShots = new Map<string, CanvasNodeData>();
    if (!replace) {
        nodes.forEach((node) => {
            if (node.type === CanvasNodeType.FilmScene) {
                const key = node.metadata?.filmScene?.scriptSourceKey;
                if (isFilmAnalysisSourceKey(key)) existingScenes.set(key!, node);
            } else if (node.type === CanvasNodeType.FilmShot) {
                const key = node.metadata?.filmShot?.scriptSourceKey;
                if (isFilmAnalysisSourceKey(key)) existingShots.set(key!, node);
            }
        });
    }

    const plan: FilmAnalysisLandingPlan = { added: [], updated: [], kept: [], protected: [], removed: [] };
    if (replace) {
        removableNodes.forEach((node) => {
            const key = (node.type === CanvasNodeType.FilmScene ? node.metadata?.filmScene?.scriptSourceKey : node.metadata?.filmShot?.scriptSourceKey) || node.id;
            pushTarget(plan.removed, key, node.id);
            if (node.type === CanvasNodeType.FilmShot && protectedShot(node, connections, landedShots)) pushTarget(plan.protected, key, node.id, true);
        });
    }

    const createdNodes: CanvasNodeData[] = [];
    const createdConnections: CanvasConnection[] = [];
    const replacements = new Map<string, CanvasNodeData>();
    const updatedNodes: CanvasNodeData[] = [];
    const desiredShots: string[] = [];
    const desiredSceneShots: { sceneId: string; shotIds: string[] }[] = [];
    const desiredSceneKeys = new Set<string>();
    const desiredShotKeys = new Set<string>();
    const sceneWidth = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].width;
    const sceneHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].height;
    const shotWidth = NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].width;
    const shotHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].height;

    for (const episode of episodes) {
        for (const scene of episode.scenes) {
            const sceneKey = filmAnalysisSceneKey(episode.title, scene.name);
            desiredSceneKeys.add(sceneKey);
            const existingScene = existingScenes.get(sceneKey);
            const data = sceneSourceData(episode, scene, sceneKey);
            let sceneNode: CanvasNodeData;
            if (existingScene) {
                sceneNode = {
                    ...existingScene,
                    title: scene.name || "场次",
                    metadata: { ...existingScene.metadata, filmScene: { ...existingScene.metadata?.filmScene, ...data } },
                };
                replacements.set(existingScene.id, sceneNode);
                updatedNodes.push(structuredClone(existingScene));
                pushTarget(plan.updated, sceneKey, existingScene.id);
            } else {
                sceneNode = {
                    id: nanoid(),
                    type: CanvasNodeType.FilmScene,
                    title: scene.name || "场次",
                    position: { x: 0, y: 0 },
                    width: sceneWidth,
                    height: sceneHeight,
                    metadata: { status: "idle", filmScene: data },
                };
                createdNodes.push(sceneNode);
                pushTarget(plan.added, sceneKey, sceneNode.id);
            }
            const sceneShots: string[] = [];
            for (const [index, shot] of scene.shots.entries()) {
                const shotKey = filmAnalysisShotKey(sceneKey, index);
                desiredShotKeys.add(shotKey);
                const sourceFields = shotSourcePayload(shot);
                const existingShot = existingShots.get(shotKey);
                let shotId: string;
                if (existingShot) {
                    shotId = existingShot.id;
                    if (protectedShot(existingShot, connections, landedShots)) {
                        pushTarget(plan.protected, shotKey, existingShot.id, true);
                    } else {
                        const shotNode = {
                            ...existingShot,
                            title: shot.shotNo || "镜头",
                            metadata: {
                                ...existingShot.metadata,
                                filmShot: { ...existingShot.metadata?.filmShot, ...sourceFields, scriptSourceKey: shotKey } as FilmShotNodeData,
                            },
                        };
                        replacements.set(existingShot.id, shotNode);
                        updatedNodes.push(structuredClone(existingShot));
                        pushTarget(plan.updated, shotKey, existingShot.id);
                    }
                } else {
                    shotId = nanoid();
                    createdNodes.push({
                        id: shotId,
                        type: CanvasNodeType.FilmShot,
                        title: shot.shotNo || "镜头",
                        position: { x: 0, y: 0 },
                        width: shotWidth,
                        height: shotHeight,
                        metadata: { status: "idle", filmShot: { ...sourceFields, scriptSourceKey: shotKey } },
                    });
                    pushTarget(plan.added, shotKey, shotId);
                }
                desiredShots.push(shotId);
                sceneShots.push(shotId);
            }
            desiredSceneShots.push({ sceneId: sceneNode.id, shotIds: sceneShots });
        }
    }

    if (!replace) {
        existingScenes.forEach((node, key) => { if (!desiredSceneKeys.has(key)) pushTarget(plan.kept, key, node.id); });
        existingShots.forEach((node, key) => { if (!desiredShotKeys.has(key)) pushTarget(plan.kept, key, node.id); });
    }

    const connectionKeys = new Set(connections.map((edge) => `${edge.kind}:${edge.fromNodeId}:${edge.toNodeId}`));
    desiredSceneShots.forEach(({ sceneId, shotIds }) => shotIds.forEach((shotId) => {
        const key = `composition:${sceneId}:${shotId}`;
        if (connectionKeys.has(key)) return;
        createdConnections.push(canvasConnection(sceneId, shotId, { kind: "composition" }));
        connectionKeys.add(key);
    }));

    const desiredSet = new Set(desiredShots);
    const firstShot = desiredShots[0];
    const lastShot = desiredShots.at(-1);
    const predecessor = firstShot ? connections.find((edge) => edge.kind === "sequence" && edge.toNodeId === firstShot && !desiredSet.has(edge.fromNodeId))?.fromNodeId : undefined;
    const successor = lastShot ? connections.find((edge) => edge.kind === "sequence" && edge.fromNodeId === lastShot && !desiredSet.has(edge.toNodeId))?.toNodeId : undefined;
    const replacedSequenceEdges = replace ? [] : connections.filter((edge) => edge.kind === "sequence" && (desiredSet.has(edge.fromNodeId) || desiredSet.has(edge.toNodeId)));
    replacedSequenceEdges.forEach((edge) => removedConnectionIds.add(edge.id));
    const sequencePairs: Array<[string, string]> = [];
    if (predecessor && firstShot) sequencePairs.push([predecessor, firstShot]);
    for (let index = 0; index < desiredShots.length - 1; index += 1) sequencePairs.push([desiredShots[index], desiredShots[index + 1]]);
    if (lastShot && successor) sequencePairs.push([lastShot, successor]);
    sequencePairs.forEach(([fromNodeId, toNodeId]) => {
        const key = `sequence:${fromNodeId}:${toNodeId}`;
        if (connectionKeys.has(key)) return;
        createdConnections.push(canvasConnection(fromNodeId, toNodeId, { kind: "sequence" }));
        connectionKeys.add(key);
    });

    const nextConnections = [...connections.filter((edge) => !removedConnectionIds.has(edge.id)), ...createdConnections];
    const survivingNodes = nodes.filter((node) => !removedNodeIds.has(node.id)).map((node) => replacements.get(node.id) ?? node);
    const placedCreatedNodes = placeFilmNodes(survivingNodes, nextConnections, createdNodes);
    const snapshot: FilmParseSnapshot = {
        id: nanoid(),
        createdAt: new Date().toISOString(),
        mode: replace ? "overwrite" : "merge",
        nodes: placedCreatedNodes,
        connections: createdConnections,
        removedNodes: removableNodes,
        removedConnections: [...removedConnections, ...replacedSequenceEdges],
        ...(updatedNodes.length ? { updatedNodes } : {}),
    };
    const snapshots = [...(scriptNode.metadata?.filmScript?.parseSnapshots ?? []), snapshot].slice(-3);
    const scriptPatch: Partial<FilmScriptNodeData> = { parseSnapshots: snapshots };
    const parsedScriptNode: CanvasNodeData = {
        ...scriptNode,
        metadata: { ...scriptNode.metadata, filmScript: { ...scriptNode.metadata?.filmScript, ...scriptPatch } as FilmScriptNodeData },
    };
    return {
        nodes: [...survivingNodes.map((node) => node.id === scriptNode.id ? parsedScriptNode : node), ...placedCreatedNodes],
        connections: nextConnections,
        scriptPatch,
        shotCount: desiredShots.length,
        sceneCount: desiredSceneShots.length,
        removedNodeIds: [...removedNodeIds],
        plan,
    };
}
