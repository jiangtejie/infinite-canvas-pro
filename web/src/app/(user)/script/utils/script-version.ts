import { nanoid } from "nanoid";

import { scriptTextHash } from "@/lib/film/film-script-import";

import type {
    ScriptContentSnapshot,
    ScriptEpisode,
    ScriptProjectDocument,
    ScriptScene,
    ScriptSnapshotDiff,
    ScriptVersion,
} from "../types";
import { exportScriptText, snapshotScriptContent } from "./script-document";
import { scriptSceneHeading } from "./script-project";

type CreateScriptVersionInput = {
    scope: "project" | "episode";
    episodeId?: string;
    label: string;
    kind: "manual" | "locked" | "safety";
};

export function createScriptVersion(document: ScriptProjectDocument, input: CreateScriptVersionInput): ScriptVersion {
    if (input.scope === "episode" && !document.episodes.some((episode) => episode.id === input.episodeId)) {
        throw new Error("剧集不存在");
    }
    const data = snapshotScriptContent(document);
    if (input.scope === "episode") data.episodes = data.episodes.filter((episode) => episode.id === input.episodeId);
    return {
        id: nanoid(),
        projectId: document.id,
        scope: input.scope,
        episodeId: input.scope === "episode" ? input.episodeId : undefined,
        label: input.label.trim() || "未命名版本",
        kind: input.kind,
        hash: scriptTextHash(exportScriptText(data)),
        data,
        createdAt: new Date().toISOString(),
    };
}

export function activateScriptVersion(document: ScriptProjectDocument, version: ScriptVersion): ScriptProjectDocument {
    if (version.kind !== "locked") throw new Error("只有锁定版本可以激活");
    if (version.projectId !== document.id) throw new Error("版本不属于当前项目");
    if (version.scope === "project") {
        return { ...document, lockedVersionId: version.id, lockedVersionHash: version.hash };
    }
    if (!document.episodes.some((episode) => episode.id === version.episodeId)) throw new Error("剧集不存在");
    return {
        ...document,
        episodes: document.episodes.map((episode) => episode.id === version.episodeId
            ? { ...episode, lockedVersionId: version.id, lockedVersionHash: version.hash }
            : episode),
    };
}

function restoredEpisode(episode: ScriptEpisode, current?: ScriptEpisode): ScriptEpisode {
    const next: ScriptEpisode = {
        id: episode.id,
        no: episode.no,
        title: episode.title,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            revision: scene.revision + 1,
            updatedAt: new Date().toISOString(),
        })),
    };
    if (current?.lockedVersionId && current.lockedVersionHash) {
        next.lockedVersionId = current.lockedVersionId;
        next.lockedVersionHash = current.lockedVersionHash;
    }
    return next;
}

export function restoreScriptVersion(
    document: ScriptProjectDocument,
    version: ScriptVersion,
): { document: ScriptProjectDocument; safety: ScriptVersion } {
    if (version.projectId !== document.id) throw new Error("版本不属于当前项目");
    const safety = createScriptVersion(document, {
        scope: version.scope,
        episodeId: version.episodeId,
        label: "恢复前",
        kind: "safety",
    });
    const data = structuredClone(version.data);

    if (version.scope === "episode") {
        const current = document.episodes.find((episode) => episode.id === version.episodeId);
        const snapshot = data.episodes.find((episode) => episode.id === version.episodeId);
        if (!current || !snapshot) throw new Error("剧集不存在");
        const next = restoredEpisode(snapshot);
        if (current.lockedVersionId === version.id && current.lockedVersionHash === version.hash) {
            next.lockedVersionId = version.id;
            next.lockedVersionHash = version.hash;
        }
        return {
            document: {
                ...document,
                episodes: document.episodes.map((episode) => episode.id === version.episodeId ? next : episode),
                updatedAt: new Date().toISOString(),
            },
            safety,
        };
    }

    const currentById = new Map(document.episodes.map((episode) => [episode.id, episode]));
    const next: ScriptProjectDocument = {
        ...document,
        title: data.title,
        format: data.format,
        genre: data.genre,
        logline: data.logline,
        theme: data.theme,
        synopsis: data.synopsis,
        actOne: data.actOne,
        actTwo: data.actTwo,
        actThree: data.actThree,
        characters: structuredClone(data.characters),
        episodes: data.episodes.map((episode) => restoredEpisode(episode, currentById.get(episode.id))),
        updatedAt: new Date().toISOString(),
    };
    if (document.lockedVersionId === version.id && document.lockedVersionHash === version.hash) {
        next.lockedVersionId = version.id;
        next.lockedVersionHash = version.hash;
    } else {
        delete next.lockedVersionId;
        delete next.lockedVersionHash;
    }
    return { document: next, safety };
}

export function canDeleteScriptVersion(
    document: ScriptProjectDocument,
    version: ScriptVersion,
): { allowed: boolean; reason?: string } {
    if (version.projectId !== document.id) return { allowed: false, reason: "版本不属于当前项目" };
    if (document.lockedVersionId === version.id) return { allowed: false, reason: "当前项目锁定版本不能删除" };
    if (document.episodes.some((episode) => episode.lockedVersionId === version.id)) {
        return { allowed: false, reason: "当前本集锁定版本不能删除" };
    }
    if (document.publications.some((publication) => publication.sourceVersionIds.includes(version.id))) {
        return { allowed: false, reason: "已发布来源版本不能删除" };
    }
    return { allowed: true };
}

const SCENE_DIFF_FIELDS: Array<{ key: keyof ScriptScene; label: string }> = [
    { key: "interiorExterior", label: "内/外景" },
    { key: "location", label: "地点" },
    { key: "timeOfDay", label: "时间" },
    { key: "characters", label: "人物" },
    { key: "goal", label: "目标" },
    { key: "conflict", label: "冲突" },
    { key: "turn", label: "转折" },
    { key: "outcome", label: "结果" },
    { key: "summary", label: "剧情" },
    { key: "content", label: "正文" },
    { key: "notes", label: "备注" },
];

function snapshotScenes(snapshot: ScriptContentSnapshot) {
    return snapshot.episodes.flatMap((episode) => episode.scenes);
}

function sceneWords(scene: ScriptScene) {
    return scene.content.replace(/\s/g, "").length;
}

function sceneFieldText(scene: ScriptScene, key: keyof ScriptScene) {
    const value = scene[key];
    return Array.isArray(value) ? value.join("、") : String(value || "");
}

export function diffScriptSnapshots(current: ScriptContentSnapshot, previous: ScriptContentSnapshot): ScriptSnapshotDiff {
    const currentScenes = snapshotScenes(current);
    const previousScenes = snapshotScenes(previous);
    const previousById = new Map(previousScenes.map((scene) => [scene.id, scene]));
    const currentIds = new Set(currentScenes.map((scene) => scene.id));
    const scenes: ScriptSnapshotDiff["scenes"] = currentScenes.map((scene) => {
        const old = previousById.get(scene.id);
        if (!old) {
            return { id: scene.id, no: scene.no, heading: scriptSceneHeading(scene), status: "added", changedFields: [], wordDelta: sceneWords(scene) };
        }
        const changedFields = SCENE_DIFF_FIELDS
            .filter((field) => sceneFieldText(scene, field.key) !== sceneFieldText(old, field.key))
            .map((field) => field.label);
        return {
            id: scene.id,
            no: scene.no,
            heading: scriptSceneHeading(scene),
            status: changedFields.length ? "changed" : "same",
            changedFields,
            wordDelta: sceneWords(scene) - sceneWords(old),
        };
    });
    for (const scene of previousScenes) {
        if (currentIds.has(scene.id)) continue;
        scenes.push({ id: scene.id, no: scene.no, heading: scriptSceneHeading(scene), status: "removed", changedFields: [], wordDelta: -sceneWords(scene) });
    }

    const characterChanges: string[] = [];
    const currentCharacters = new Map(current.characters.map((character) => [character.name.trim(), character]));
    const previousCharacters = new Map(previous.characters.map((character) => [character.name.trim(), character]));
    for (const name of currentCharacters.keys()) if (name && !previousCharacters.has(name)) characterChanges.push(`新增角色：${name}`);
    for (const name of previousCharacters.keys()) if (name && !currentCharacters.has(name)) characterChanges.push(`删除角色：${name}`);
    const characterFields = [
        ["role", "定位"],
        ["want", "目标"],
        ["need", "需要"],
        ["flaw", "缺陷"],
        ["arc", "变化"],
        ["description", "小传"],
    ] as const;
    for (const [name, character] of currentCharacters) {
        const old = previousCharacters.get(name);
        if (!old || !name) continue;
        const changed = characterFields.filter(([key]) => character[key] !== old[key]).map(([, label]) => label);
        if (changed.length) characterChanges.push(`${name}：${changed.join("、")}变化`);
    }

    return {
        scenes,
        added: scenes.filter((scene) => scene.status === "added").length,
        removed: scenes.filter((scene) => scene.status === "removed").length,
        changed: scenes.filter((scene) => scene.status === "changed").length,
        same: scenes.filter((scene) => scene.status === "same").length,
        wordDelta: currentScenes.reduce((total, scene) => total + sceneWords(scene), 0)
            - previousScenes.reduce((total, scene) => total + sceneWords(scene), 0),
        characterChanges,
    };
}
