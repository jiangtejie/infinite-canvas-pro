import { nanoid } from "nanoid";

import type { FilmEpisode, FilmScene, FilmShot } from "@/lib/film/types";
import { scriptTextHash } from "@/lib/film/film-script-import";
import { NODE_DEFAULT_SIZE } from "@/app/(user)/canvas/constants";
import { scriptFilmText } from "@/app/(user)/script/utils/script-film-plan";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmSceneNodeData, type FilmScriptNodeData, type FilmScriptSource, type FilmShotNodeData } from "../../types";
import { canvasConnection } from "./canvas-connection";
import { placeFilmNodes } from "./film-layout";
import { isFilmAnalysisSourceKey } from "./film-landing-plan";
import type { FilmParseGraphResult } from "./film-script-parse";

export type ScriptFilmRefreshPlan = {
    added: string[];
    updated: string[];
    kept: string[];
    removed: string[];
    protected: string[];
};

type DesiredScene = { episode: FilmEpisode; scene: FilmScene };
type RefreshResult = FilmParseGraphResult & { plan: ScriptFilmRefreshPlan };

const SHOT_SOURCE_FIELDS = ["shotNo", "shotType", "cameraMovement", "duration", "description", "dialogue", "audio", "negativePrompt", "performance", "soundDesign", "coverage", "composition", "lighting", "colorTone", "lens", "transition", "videoMode", "videoPrompt"] as const;

function shotSourcePayload(shot: FilmShot): FilmShotNodeData {
    const copy = { ...shot } as Record<string, unknown>;
    for (const key of ["id", "characterBindings", "propBindings", "locationId", "locationVariantId"]) delete copy[key];
    return copy as FilmShotNodeData;
}

function sceneSourceData(episode: FilmEpisode, scene: FilmScene): FilmSceneNodeData {
    return {
        episodeId: episode.id,
        episodeTitle: episode.title,
        name: scene.name,
        location: scene.location,
        time: scene.time,
        mood: scene.mood,
        scriptSourceKey: scene.id,
    };
}

function sameSceneSource(node: CanvasNodeData, data: FilmSceneNodeData) {
    const current = node.metadata?.filmScene;
    return Boolean(current && Object.entries(data).every(([key, value]) => current[key as keyof FilmSceneNodeData] === value));
}

function sameShotSource(node: CanvasNodeData, shot: FilmShot, promptHash: string) {
    const current = node.metadata?.filmShot;
    return Boolean(current && SHOT_SOURCE_FIELDS.every((key) => current[key] === shot[key]) && current.scriptSourcePromptHash === promptHash);
}

function protectedShot(node: CanvasNodeData, connections: CanvasConnection[]) {
    const shot = node.metadata?.filmShot;
    if (!shot) return false;
    return Boolean(
        shot.imageUrl || shot.videoUrl || shot.storageKey || shot.videoStorageKey
        || shot.firstFrame || shot.lastFrame || shot.imageVersions?.length || shot.videoVersions?.length
        || shot.videoSegments?.length || shot.pendingTask
        || node.metadata?.status !== "idle"
        || connections.some((edge) => edge.kind === "context" && edge.toNodeId === node.id)
        || scriptTextHash(shot.prompt || "") !== shot.scriptSourcePromptHash,
    );
}

function buildRefresh(nodes: CanvasNodeData[], connections: CanvasConnection[], plan: FilmEpisode[], source: FilmScriptSource): RefreshResult {
    const script = nodes.find((node) => node.type === CanvasNodeType.FilmScript && node.metadata?.filmScript?.source?.publicationId === source.publicationId);
    if (!script?.metadata?.filmScript) throw new Error("影视项目缺少对应来源的剧本节点");
    const prefix = `script:${source.publicationId}:`;
    const removedConnections = connections.filter((edge) => edge.id.startsWith(prefix));
    const baseConnections = connections.filter((edge) => !edge.id.startsWith(prefix));
    const ownedScenes = nodes.filter((node) => node.type === CanvasNodeType.FilmScene && node.metadata?.filmScene?.scriptSourceKey && !isFilmAnalysisSourceKey(node.metadata.filmScene.scriptSourceKey));
    const ownedShots = nodes.filter((node) => node.type === CanvasNodeType.FilmShot && node.metadata?.filmShot?.scriptSourceKey && !isFilmAnalysisSourceKey(node.metadata.filmShot.scriptSourceKey));
    const sceneByKey = new Map(ownedScenes.map((node) => [node.metadata!.filmScene!.scriptSourceKey!, node]));
    const shotByKey = new Map(ownedShots.map((node) => [node.metadata!.filmShot!.scriptSourceKey!, node]));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const desiredScenes: DesiredScene[] = plan.flatMap((episode) => episode.scenes.map((scene) => ({ episode, scene })));
    const desiredShotKeys = new Set(desiredScenes.flatMap(({ scene }) => scene.shots.map((shot) => shot.id)));
    const desiredSceneKeys = new Set(desiredScenes.map(({ scene }) => scene.id));
    const shotOwner = new Map(connections.flatMap((edge) => edge.kind === "composition" && sceneByKey.has(edge.fromNodeId) && shotByKey.has(edge.toNodeId) ? [[edge.toNodeId, edge.fromNodeId] as const] : []));
    const removedNodeIds = new Set<string>();
    const detachedNodes: CanvasNodeData[] = [];
    const protectedIds: string[] = [];

    for (const shot of ownedShots) {
        const key = shot.metadata!.filmShot!.scriptSourceKey!;
        if (desiredShotKeys.has(key) || !protectedShot(shot, connections)) continue;
        detachedNodes.push(structuredClone(shot));
        protectedIds.push(shot.id);
    }
    for (const scene of ownedScenes) {
        const key = scene.metadata!.filmScene!.scriptSourceKey!;
        if (desiredSceneKeys.has(key)) continue;
        const protectedChild = ownedShots.some((shot) => shotOwner.get(shot.id) === scene.id && protectedIds.includes(shot.id));
        const manualConnection = connections.some((edge) => !edge.id.startsWith(prefix) && (edge.fromNodeId === scene.id || edge.toNodeId === scene.id));
        if (protectedChild || manualConnection) {
            detachedNodes.push(structuredClone(scene));
            protectedIds.push(scene.id);
        }
    }
    for (const shot of ownedShots) {
        const key = shot.metadata!.filmShot!.scriptSourceKey!;
        if (!desiredShotKeys.has(key) && !protectedIds.includes(shot.id)) removedNodeIds.add(shot.id);
    }
    for (const scene of ownedScenes) {
        const key = scene.metadata!.filmScene!.scriptSourceKey!;
        if (!desiredSceneKeys.has(key) && !protectedIds.includes(scene.id)) removedNodeIds.add(scene.id);
    }

    const updatedNodes: CanvasNodeData[] = [];
    const createdNodes: CanvasNodeData[] = [];
    const sourceConnections: CanvasConnection[] = [];
    const replacements = new Map<string, CanvasNodeData>();
    const added: string[] = [];
    const updated: string[] = [];
    const kept: string[] = [];
    const sceneWidth = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].width;
    const sceneHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].height;
    const shotHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].height;
    let previousShotId = "";

    for (const { episode, scene } of desiredScenes) {
        const existingScene = sceneByKey.get(scene.id);
        const sceneId = existingScene?.id ?? (nodeById.has(scene.id) ? `${prefix}${scene.id}` : scene.id);
        const data = sceneSourceData(episode, scene);
        const sceneNode: CanvasNodeData = existingScene ? {
            ...existingScene,
            title: scene.name || "场次",
            metadata: { ...existingScene.metadata, filmScene: { ...existingScene.metadata?.filmScene, ...data } },
        } : {
            id: sceneId,
            type: CanvasNodeType.FilmScene,
            title: scene.name || "场次",
            position: { x: 0, y: 0 },
            width: sceneWidth,
            height: sceneHeight,
            metadata: { status: "idle", filmScene: data },
        };
        if (existingScene && sameSceneSource(existingScene, data)) kept.push(existingScene.id);
        else if (existingScene) { updated.push(existingScene.id); updatedNodes.push(structuredClone(existingScene)); }
        else { added.push(sceneNode.id); createdNodes.push(sceneNode); }
        replacements.set(sceneNode.id, sceneNode);
        nodeById.set(sceneNode.id, sceneNode);

        for (const shot of scene.shots) {
            const existingShot = shotByKey.get(shot.id);
            const shotId = existingShot?.id ?? (nodeById.has(shot.id) ? `${prefix}${shot.id}` : shot.id);
            const sourceFields = shotSourcePayload(shot);
            const prompt = existingShot?.metadata?.filmShot?.prompt || sourceFields.prompt;
            const promptHash = existingShot?.metadata?.filmShot?.scriptSourcePromptHash ?? scriptTextHash(prompt);
            const shotNode: CanvasNodeData = existingShot ? {
                ...existingShot,
                title: shot.shotNo || "镜头",
                metadata: {
                    ...existingShot.metadata,
                    filmShot: { ...existingShot.metadata?.filmShot, ...sourceFields, prompt, scriptSourceKey: shot.id, scriptSourcePromptHash: promptHash } as FilmShotNodeData,
                },
            } : {
                id: shotId,
                type: CanvasNodeType.FilmShot,
                title: shot.shotNo || "镜头",
                position: { x: 0, y: 0 },
                width: NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].width,
                height: shotHeight,
                metadata: { status: "idle", filmShot: { ...sourceFields, scriptSourceKey: shot.id, scriptSourcePromptHash: scriptTextHash(prompt) } },
            };
            if (existingShot && sameShotSource(existingShot, shot, promptHash)) kept.push(existingShot.id);
            else if (existingShot) { updated.push(existingShot.id); updatedNodes.push(structuredClone(existingShot)); }
            else { added.push(shotNode.id); createdNodes.push(shotNode); }
            replacements.set(shotNode.id, shotNode);
            nodeById.set(shotNode.id, shotNode);
            sourceConnections.push({ ...canvasConnection(sceneNode.id, shotNode.id, { kind: "composition" }), id: `${prefix}${sceneNode.id}->${shotNode.id}` });
            if (previousShotId) sourceConnections.push({ ...canvasConnection(previousShotId, shotNode.id, { kind: "sequence" }), id: `${prefix}${previousShotId}->${shotNode.id}` });
            previousShotId = shotNode.id;
        }
    }

    const survivingNodes = nodes.filter((node) => !removedNodeIds.has(node.id));
    const placedCreatedNodes = placeFilmNodes(survivingNodes, [...connections, ...sourceConnections], createdNodes);
    const detachedIds = new Set(detachedNodes.map((node) => node.id));
    const nextNodes = nodes.filter((node) => !removedNodeIds.has(node.id)).map((node) => {
        if (detachedIds.has(node.id)) {
            const metadata = structuredClone(node.metadata)!;
            if (metadata.filmScene) delete metadata.filmScene.scriptSourceKey;
            if (metadata.filmShot) {
                delete metadata.filmShot.scriptSourceKey;
                delete metadata.filmShot.scriptSourcePromptHash;
            }
            return { ...node, metadata };
        }
        return replacements.get(node.id) ?? node;
    });
    const snapshot = {
        id: nanoid(),
        createdAt: new Date().toISOString(),
        mode: "refresh" as const,
        nodes: placedCreatedNodes,
        connections: sourceConnections,
        removedNodes: nodes.filter((node) => removedNodeIds.has(node.id)),
        removedConnections,
        updatedNodes: [...updatedNodes, ...detachedNodes, structuredClone(script)],
        detachedNodes,
    };
    const parsedScript: CanvasNodeData = {
        ...script,
        metadata: {
            ...script.metadata,
            filmScript: {
                ...script.metadata.filmScript,
                text: scriptFilmText(plan),
                source: structuredClone(source),
                parseSnapshots: [...(script.metadata.filmScript.parseSnapshots ?? []), snapshot].slice(-3),
            } as FilmScriptNodeData,
        },
    };
    return {
        nodes: [...nextNodes.map((node) => node.id === script.id ? parsedScript : node), ...placedCreatedNodes],
        connections: [...baseConnections, ...sourceConnections],
        scriptPatch: { parseSnapshots: parsedScript.metadata!.filmScript!.parseSnapshots },
        shotCount: desiredScenes.reduce((total, { scene }) => total + scene.shots.length, 0),
        sceneCount: desiredScenes.length,
        removedNodeIds: [...removedNodeIds],
        plan: { added, updated, kept, removed: [...removedNodeIds], protected: protectedIds },
    };
}

export function previewScriptFilmRefresh(nodes: CanvasNodeData[], connections: CanvasConnection[], plan: FilmEpisode[], source: FilmScriptSource): ScriptFilmRefreshPlan {
    return buildRefresh(nodes, connections, plan, source).plan;
}

export function applyScriptFilmRefresh(nodes: CanvasNodeData[], connections: CanvasConnection[], plan: FilmEpisode[], source: FilmScriptSource): FilmParseGraphResult {
    const { plan: _plan, ...result } = buildRefresh(nodes, connections, plan, source);
    return result;
}
