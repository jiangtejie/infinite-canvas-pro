import { nanoid } from "nanoid";

import type { FilmEpisode, FilmScene, FilmShot } from "@/lib/film/types";
import { scriptTextHash } from "@/lib/film/film-script-import";
import { NODE_DEFAULT_SIZE } from "@/app/(user)/canvas/constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmSceneNodeData, type FilmScriptNodeData, type FilmScriptSource, type FilmShotNodeData } from "@/app/(user)/canvas/types";
import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import type { ScriptContentSnapshot, ScriptEpisode, ScriptScene } from "../types";
import { canvasConnection } from "@/app/(user)/canvas/[id]/lib/canvas-connection";

const COLUMN_GAP = 60;
const SHOT_GAP = 32;
const START_GAP = 120;

function sceneHeading(scene: ScriptScene) {
    return [scene.interiorExterior, scene.location, scene.timeOfDay].filter(Boolean).join(" ") || `第 ${scene.no} 场`;
}

function shotDescription(scene: ScriptScene) {
    const paragraphs = scene.content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
    if (paragraphs.length) return paragraphs;
    return [[scene.summary, scene.goal, scene.conflict, scene.turn, scene.outcome].filter(Boolean).join("\n") || sceneHeading(scene)];
}

function compileScene(scene: ScriptScene, episode: ScriptEpisode, multiEpisode: boolean): FilmScene {
    return {
        id: scene.id,
        name: sceneHeading(scene),
        location: scene.location,
        time: scene.timeOfDay,
        mood: "",
        shots: shotDescription(scene).map((description, index): FilmShot => ({
            id: `${scene.id}:${index}`,
            shotNo: multiEpisode ? `${episode.no}-${scene.no}-${index + 1}` : `${scene.no}-${index + 1}`,
            shotType: "MS",
            cameraMovement: "",
            duration: 4,
            description,
            dialogue: "",
            audio: "",
            prompt: "",
            characterBindings: [],
            propBindings: [],
        })),
    };
}

export function compileScriptFilmPlan(snapshot: ScriptContentSnapshot): FilmEpisode[] {
    return snapshot.episodes.map((episode) => ({
        id: episode.id,
        title: episode.title || `第 ${episode.no} 集`,
        scenes: episode.scenes.map((scene) => compileScene(scene, episode, snapshot.episodes.length > 1)),
    }));
}

export function scriptFilmText(plan: FilmEpisode[]) {
    return plan.flatMap((episode) => [
        episode.title,
        ...episode.scenes.flatMap((scene) => [scene.name, ...scene.shots.flatMap((shot) => [shot.description, shot.dialogue].filter(Boolean))]),
    ]).join("\n\n");
}

function shotPayload(shot: FilmShot): FilmShotNodeData {
    const copy = { ...shot } as Record<string, unknown>;
    for (const key of ["id", "characterBindings", "propBindings", "locationId", "locationVariantId"]) delete copy[key];
    return copy as FilmShotNodeData;
}

export function buildInitialScriptFilmGraph(project: CanvasProject, plan: FilmEpisode[], source: FilmScriptSource): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } {
    const script = project.nodes.find((node) => node.type === CanvasNodeType.FilmScript && node.metadata?.filmScript);
    if (!script) throw new Error("影视项目缺少剧本节点");
    const templateId = `${project.id}-scene-1`;
    const nodes = project.nodes.filter((node) => node.id !== templateId);
    const connections = project.connections.filter((edge) => edge.fromNodeId !== templateId && edge.toNodeId !== templateId && !edge.id.startsWith(`script:${source.publicationId}:`));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const created: CanvasNodeData[] = [];
    const sourceConnections: CanvasConnection[] = [];
    const sceneWidth = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].width;
    const sceneHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmScene].height;
    const shotHeight = NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].height;
    const baseX = script.position.x + script.width + START_GAP;
    const baseY = script.position.y;
    let column = 0;
    let previousShotId = "";

    for (const episode of plan) {
        for (const scene of episode.scenes) {
            const existing = nodeById.get(scene.id);
            const sceneData: FilmSceneNodeData = {
                episodeId: episode.id,
                episodeTitle: episode.title,
                name: scene.name,
                location: scene.location,
                time: scene.time,
                mood: scene.mood,
                scriptSourceKey: scene.id,
            };
            const sceneNode: CanvasNodeData = existing ? {
                ...existing,
                title: scene.name || "场次",
                metadata: { ...existing.metadata, filmScene: sceneData },
            } : {
                id: scene.id,
                type: CanvasNodeType.FilmScene,
                title: scene.name || "场次",
                position: { x: baseX + column * (sceneWidth + COLUMN_GAP), y: baseY },
                width: sceneWidth,
                height: sceneHeight,
                metadata: { status: "idle", filmScene: sceneData },
            };
            if (!existing) {
                nodes.push(sceneNode);
                created.push(sceneNode);
            }
            nodeById.set(sceneNode.id, sceneNode);
            for (const [shotIndex, shot] of scene.shots.entries()) {
                const existingShot = nodeById.get(shot.id);
                const sourceFields = shotPayload(shot);
                const shotNode: CanvasNodeData = existingShot ? {
                    ...existingShot,
                    metadata: {
                        ...existingShot.metadata,
                        filmShot: {
                            ...existingShot.metadata?.filmShot,
                            ...sourceFields,
                            prompt: existingShot.metadata?.filmShot?.prompt || sourceFields.prompt,
                            scriptSourceKey: shot.id,
                            scriptSourcePromptHash: scriptTextHash(sourceFields.prompt),
                        } as FilmShotNodeData,
                    },
                } : {
                    id: shot.id,
                    type: CanvasNodeType.FilmShot,
                    title: shot.shotNo || "镜头",
                    position: { x: baseX + column * (sceneWidth + COLUMN_GAP), y: baseY + sceneHeight + 40 + shotIndex * (shotHeight + SHOT_GAP) },
                    width: NODE_DEFAULT_SIZE[CanvasNodeType.FilmShot].width,
                    height: shotHeight,
                    metadata: {
                        status: "idle",
                        filmShot: { ...sourceFields, scriptSourceKey: shot.id, scriptSourcePromptHash: scriptTextHash(sourceFields.prompt) },
                    },
                };
                if (!existingShot) {
                    nodes.push(shotNode);
                    created.push(shotNode);
                }
                nodeById.set(shotNode.id, shotNode);
                const composition = { ...canvasConnection(sceneNode.id, shotNode.id, { kind: "composition" }), id: `script:${source.publicationId}:${sceneNode.id}->${shotNode.id}` };
                sourceConnections.push(composition);
                if (previousShotId) sourceConnections.push({ ...canvasConnection(previousShotId, shotNode.id, { kind: "sequence" }), id: `script:${source.publicationId}:${previousShotId}->${shotNode.id}` });
                previousShotId = shotNode.id;
            }
            column += 1;
        }
    }

    const snapshot = {
        id: nanoid(),
        createdAt: source.publishedAt,
        mode: "overwrite" as const,
        nodes: created,
        connections: sourceConnections,
        removedNodes: project.nodes.filter((node) => node.id === templateId),
        removedConnections: project.connections.filter((edge) => edge.fromNodeId === templateId || edge.toNodeId === templateId),
    };
    const parsedScript: CanvasNodeData = {
        ...script,
        metadata: {
            ...script.metadata,
            filmScript: {
                ...script.metadata?.filmScript,
                text: scriptFilmText(plan),
                source: structuredClone(source),
                parseSnapshots: [...(script.metadata?.filmScript?.parseSnapshots ?? []), snapshot].slice(-3),
            } as FilmScriptNodeData,
        },
    };
    nodeById.set(parsedScript.id, parsedScript);
    return {
        nodes: nodes.map((node) => nodeById.get(node.id) ?? node),
        connections: [...connections, ...sourceConnections],
    };
}
