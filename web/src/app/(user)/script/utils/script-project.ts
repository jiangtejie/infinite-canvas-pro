import { nanoid } from "nanoid";

import type { ScriptCharacter, ScriptEpisode, ScriptFormat, ScriptProjectDocument, ScriptScene } from "../types";

export const SCRIPT_FORMAT_OPTIONS: Array<{ value: ScriptFormat; label: string }> = [
    { value: "film", label: "电影" },
    { value: "tv", label: "剧集" },
    { value: "short", label: "短剧" },
];

export function createScriptProject(input: { title: string; format?: ScriptFormat; genre?: string; logline?: string }): ScriptProjectDocument {
    const now = new Date().toISOString();
    return {
        schemaVersion: 2,
        id: nanoid(),
        title: input.title.trim() || "未命名剧本",
        format: input.format || "film",
        genre: input.genre?.trim() || "",
        logline: input.logline?.trim() || "",
        theme: "",
        synopsis: "",
        actOne: "",
        actTwo: "",
        actThree: "",
        characters: [],
        episodes: [createScriptEpisode(1)],
        publications: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function createScriptEpisode(no: number, title?: string): ScriptEpisode {
    return { id: nanoid(), no, title: title?.trim() || `第 ${no} 集`, scenes: [] };
}

export function createScriptScene(no: number): ScriptScene {
    return {
        id: nanoid(),
        no,
        interiorExterior: "内景",
        location: "",
        timeOfDay: "日",
        characters: [],
        goal: "",
        conflict: "",
        turn: "",
        outcome: "",
        summary: "",
        content: "",
        notes: "",
        revision: 1,
        updatedAt: new Date().toISOString(),
    };
}

export function createScriptCharacter(): ScriptCharacter {
    return { id: nanoid(), name: "", role: "", want: "", need: "", flaw: "", arc: "", description: "" };
}

export function scriptSceneHeading(scene: ScriptScene) {
    return [scene.interiorExterior, scene.location, scene.timeOfDay].filter(Boolean).join(" · ") || "未命名场景";
}

export function scriptSceneCompleteness(scene: ScriptScene) {
    const checks = [scene.location, scene.goal, scene.conflict, scene.turn, scene.outcome].filter((value) => value.trim()).length;
    return Math.round((checks / 5) * 100);
}

export function normalizeScriptCharacters(value: string) {
    return [...new Set(value.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean))];
}

export function collectScriptCharacterNames(document: ScriptProjectDocument) {
    return [...new Set([
        ...document.characters.map((character) => character.name.trim()).filter(Boolean),
        ...document.episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.characters)),
    ])];
}

export function scriptWordCount(document: ScriptProjectDocument) {
    return document.episodes.reduce((total, episode) => total + episode.scenes.reduce((count, scene) => count + scene.content.replace(/\s/g, "").length, 0), 0);
}

export function scriptPageCount(document: ScriptProjectDocument) {
    const sceneCount = document.episodes.reduce((total, episode) => total + episode.scenes.length, 0);
    return Math.max(sceneCount ? 1 : 0, Math.ceil(scriptWordCount(document) / 1200));
}

export function scriptSceneText(scene: ScriptScene) {
    return [scriptSceneHeading(scene), scene.content.trim()].filter(Boolean).join("\n\n");
}

export function scriptSceneMissingFields(scene: ScriptScene) {
    return [
        ["目标", scene.goal],
        ["冲突", scene.conflict],
        ["转折", scene.turn],
        ["结果", scene.outcome],
    ].filter(([, value]) => !value.trim()).map(([label]) => label);
}
