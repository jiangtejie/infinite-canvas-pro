import type {
    ScriptConflict,
    ScriptEpisode,
    ScriptHeader,
    ScriptProjectDocument,
    ScriptScene,
} from "../types";
import { scriptDataHash } from "./script-canonical";

export type ScriptSyncBaseline = {
    revision: number;
    headerHash: string;
    scenes: Record<string, { revision: number; hash: string; episodeId: string }>;
};

export type ScriptMergeResult = {
    document: ScriptProjectDocument;
    conflicts: ScriptConflict[];
};

export type ScriptConflictResolution = {
    scope: "header" | "scene";
    id?: string;
    choice: "local" | "remote";
};

export type ScriptOutbox = {
    document: ScriptProjectDocument;
    base: ScriptSyncBaseline;
    conflicts?: ScriptConflict[];
    resolutions?: ScriptConflictResolution[];
};

function scriptHeader(document: ScriptProjectDocument): ScriptHeader {
    return {
        title: document.title,
        format: document.format,
        genre: document.genre,
        logline: document.logline,
        theme: document.theme,
        synopsis: document.synopsis,
        actOne: document.actOne,
        actTwo: document.actTwo,
        actThree: document.actThree,
        characters: structuredClone(document.characters),
        lockedVersionId: document.lockedVersionId,
        lockedVersionHash: document.lockedVersionHash,
        episodes: document.episodes.map((episode) => ({
            id: episode.id,
            no: episode.no,
            title: episode.title,
            sceneIds: episode.scenes.map((scene) => scene.id),
            lockedVersionId: episode.lockedVersionId,
            lockedVersionHash: episode.lockedVersionHash,
        })),
        publications: structuredClone(document.publications),
    };
}

function scriptSceneHash(scene: ScriptScene) {
    return scriptDataHash({
        id: scene.id,
        no: scene.no,
        interiorExterior: scene.interiorExterior,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        characters: scene.characters,
        goal: scene.goal,
        conflict: scene.conflict,
        turn: scene.turn,
        outcome: scene.outcome,
        summary: scene.summary,
        content: scene.content,
        notes: scene.notes,
    });
}

function sceneEntries(document: ScriptProjectDocument) {
    return document.episodes.flatMap((episode) => episode.scenes.map((scene) => ({
        scene,
        episodeId: episode.id,
        hash: scriptSceneHash(scene),
    })));
}

export function createSyncBaseline(document: ScriptProjectDocument, revision: number): ScriptSyncBaseline {
    return {
        revision,
        headerHash: scriptDataHash(scriptHeader(document)),
        scenes: Object.fromEntries(sceneEntries(document).map(({ scene, episodeId, hash }) => [
            scene.id,
            { revision: scene.revision, hash, episodeId },
        ])),
    };
}

function sameScene(local: ScriptScene, remote: ScriptScene) {
    return local.revision >= remote.revision ? local : remote;
}

function mergeHeader(
    base: ScriptSyncBaseline,
    local: ScriptHeader,
    remote: ScriptHeader,
    resolutions: ScriptConflictResolution[],
    conflicts: ScriptConflict[],
) {
    const localHash = scriptDataHash(local);
    const remoteHash = scriptDataHash(remote);
    if (localHash === remoteHash) return local;
    if (localHash === base.headerHash) return remote;
    if (remoteHash === base.headerHash) return local;

    const resolution = resolutions.find((item) => item.scope === "header");
    if (!resolution) conflicts.push({ scope: "header", local, remote });
    return resolution?.choice === "remote" ? remote : local;
}

function mergeScenes(
    base: ScriptSyncBaseline,
    local: ScriptProjectDocument,
    remote: ScriptProjectDocument,
    resolutions: ScriptConflictResolution[],
    conflicts: ScriptConflict[],
) {
    const localEntries = new Map(sceneEntries(local).map((entry) => [entry.scene.id, entry]));
    const remoteEntries = new Map(sceneEntries(remote).map((entry) => [entry.scene.id, entry]));
    const ids = new Set([...Object.keys(base.scenes), ...localEntries.keys(), ...remoteEntries.keys()]);
    const merged = new Map<string, ScriptScene>();

    for (const id of ids) {
        const localEntry = localEntries.get(id);
        const remoteEntry = remoteEntries.get(id);
        const baseEntry = base.scenes[id];
        const localHash = localEntry?.hash ?? null;
        const remoteHash = remoteEntry?.hash ?? null;
        const baseHash = baseEntry?.hash ?? null;
        let chosen: ScriptScene | null | undefined;

        if (localHash === remoteHash) {
            chosen = localEntry && remoteEntry
                ? sameScene(localEntry.scene, remoteEntry.scene)
                : localEntry?.scene ?? remoteEntry?.scene ?? null;
        } else if (localHash === baseHash) {
            chosen = remoteEntry?.scene ?? null;
        } else if (remoteHash === baseHash) {
            chosen = localEntry?.scene ?? null;
        } else {
            const localScene = localEntry?.scene ?? null;
            const remoteScene = remoteEntry?.scene ?? null;
            const resolution = resolutions.find((item) => item.scope === "scene" && item.id === id);
            if (!resolution) conflicts.push({ scope: "scene", id, local: localScene, remote: remoteScene });
            chosen = resolution?.choice === "local" ? localScene : remoteScene;
        }
        if (chosen) merged.set(id, structuredClone(chosen));
    }
    return merged;
}

function assembleEpisodes(
    header: ScriptHeader,
    scenes: Map<string, ScriptScene>,
    base: ScriptSyncBaseline,
    local: ScriptProjectDocument,
    remote: ScriptProjectDocument,
): ScriptEpisode[] {
    const episodes: ScriptEpisode[] = header.episodes.map((episode) => ({
        id: episode.id,
        no: episode.no,
        title: episode.title,
        lockedVersionId: episode.lockedVersionId,
        lockedVersionHash: episode.lockedVersionHash,
        scenes: [...new Set(episode.sceneIds)].flatMap((id) => {
            const scene = scenes.get(id);
            return scene ? [scene] : [];
        }),
    }));
    const referenced = new Set(episodes.flatMap((episode) => episode.scenes.map((scene) => scene.id)));
    const orphans = [...scenes.keys()].filter((id) => !referenced.has(id));
    if (!orphans.length) return episodes;

    if (!episodes.length) {
        const fallback = local.episodes[0] ?? remote.episodes[0];
        episodes.push({
            id: fallback?.id ?? "merged-episode",
            no: fallback?.no ?? 1,
            title: fallback?.title ?? "第 1 集",
            scenes: [],
        });
    }
    const localOwners = new Map(sceneEntries(local).map((entry) => [entry.scene.id, entry.episodeId]));
    const remoteOwners = new Map(sceneEntries(remote).map((entry) => [entry.scene.id, entry.episodeId]));
    for (const id of orphans) {
        const ownerId = base.scenes[id]?.episodeId ?? localOwners.get(id) ?? remoteOwners.get(id);
        const episode = episodes.find((item) => item.id === ownerId) ?? episodes[0];
        episode.scenes.push(scenes.get(id)!);
    }
    return episodes;
}

export function mergeScriptDocuments(
    base: ScriptSyncBaseline,
    local: ScriptProjectDocument,
    remote: ScriptProjectDocument,
    resolutions: ScriptConflictResolution[] = [],
): ScriptMergeResult {
    const conflicts: ScriptConflict[] = [];
    const header = mergeHeader(base, scriptHeader(local), scriptHeader(remote), resolutions, conflicts);
    const scenes = mergeScenes(base, local, remote, resolutions, conflicts);
    const document: ScriptProjectDocument = {
        ...remote,
        title: header.title,
        format: header.format,
        genre: header.genre,
        logline: header.logline,
        theme: header.theme,
        synopsis: header.synopsis,
        actOne: header.actOne,
        actTwo: header.actTwo,
        actThree: header.actThree,
        characters: header.characters,
        lockedVersionId: header.lockedVersionId,
        lockedVersionHash: header.lockedVersionHash,
        episodes: assembleEpisodes(header, scenes, base, local, remote),
        publications: header.publications,
    };
    return { document, conflicts };
}
