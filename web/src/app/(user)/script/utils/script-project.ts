import { nanoid } from "nanoid";

import type { ScriptCharacter, ScriptDraft, ScriptFormat, ScriptProject, ScriptScene } from "../types";

export const SCRIPT_FORMAT_OPTIONS: Array<{ value: ScriptFormat; label: string }> = [
    { value: "film", label: "电影" },
    { value: "tv", label: "剧集" },
    { value: "short", label: "短剧" },
];

export const SCRIPT_TIME_OPTIONS = ["日", "夜", "清晨", "黄昏", "深夜"];

export function createScriptProject(input: { title: string; format?: ScriptFormat; genre?: string; logline?: string }): ScriptProject {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        title: input.title.trim() || "未命名剧本",
        status: "draft",
        format: input.format || "film",
        genre: input.genre?.trim() || "",
        logline: input.logline?.trim() || "",
        theme: "",
        synopsis: "",
        actOne: "",
        actTwo: "",
        actThree: "",
        characters: [],
        scenes: [],
        drafts: [],
        createdAt: now,
        updatedAt: now,
    };
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

export function collectScriptCharacterNames(project: ScriptProject) {
    return [...new Set([...project.characters.map((character) => character.name.trim()).filter(Boolean), ...project.scenes.flatMap((scene) => scene.characters)])];
}

export function scriptWordCount(project: ScriptProject) {
    return project.scenes.reduce((total, scene) => total + scene.content.replace(/\s/g, "").length, 0);
}

export function scriptPageCount(project: ScriptProject) {
    return Math.max(project.scenes.length ? 1 : 0, Math.ceil(scriptWordCount(project) / 1200));
}

export function scriptSceneText(scene: ScriptScene) {
    return [scriptSceneHeading(scene), scene.content.trim()].filter(Boolean).join("\n\n");
}

export function exportScriptText(project: ScriptProject) {
    const header = [project.title, project.logline ? `Logline：${project.logline}` : "", project.theme ? `主题：${project.theme}` : ""].filter(Boolean).join("\n");
    const body = project.scenes.map((scene) => `${String(scene.no).padStart(2, "0")}. ${scriptSceneText(scene)}`).join("\n\n");
    return [header, body].filter(Boolean).join("\n\n");
}


export type ScriptSceneDiffStatus = "added" | "removed" | "changed" | "same";

export type ScriptSceneDiff = {
    id: string;
    no: number;
    heading: string;
    status: ScriptSceneDiffStatus;
    changedFields: string[];
    wordDelta: number;
};

export type ScriptDraftDiff = {
    scenes: ScriptSceneDiff[];
    added: number;
    removed: number;
    changed: number;
    same: number;
    wordDelta: number;
    characterChanges: string[];
};

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

function sceneWords(scene: ScriptScene) {
    return scene.content.replace(/\s/g, "").length;
}

function sceneFieldText(scene: ScriptScene, key: keyof ScriptScene) {
    const value = scene[key];
    return Array.isArray(value) ? value.join("、") : String(value || "");
}

export function createScriptDraft(project: ScriptProject, label?: string): ScriptDraft {
    return {
        id: nanoid(),
        label: label?.trim() || `v${(project.drafts || []).length + 1}`,
        createdAt: new Date().toISOString(),
        logline: project.logline,
        theme: project.theme,
        synopsis: project.synopsis,
        actOne: project.actOne,
        actTwo: project.actTwo,
        actThree: project.actThree,
        characters: project.characters.map((character) => ({ ...character })),
        scenes: project.scenes.map((scene) => ({ ...scene, characters: [...scene.characters] })),
    };
}

export function draftWords(draft: ScriptDraft) {
    return draft.scenes.reduce((total, scene) => total + sceneWords(scene), 0);
}

export function diffScriptDraft(project: ScriptProject, draft: ScriptDraft): ScriptDraftDiff {
    const draftById = new Map(draft.scenes.map((scene) => [scene.id, scene]));
    const currentIds = new Set(project.scenes.map((scene) => scene.id));
    const scenes: ScriptSceneDiff[] = project.scenes.map((scene) => {
        const previous = draftById.get(scene.id);
        if (!previous) {
            return { id: scene.id, no: scene.no, heading: scriptSceneHeading(scene), status: "added", changedFields: [], wordDelta: sceneWords(scene) };
        }
        const changedFields = SCENE_DIFF_FIELDS.filter((field) => sceneFieldText(scene, field.key) !== sceneFieldText(previous, field.key)).map((field) => field.label);
        return {
            id: scene.id,
            no: scene.no,
            heading: scriptSceneHeading(scene),
            status: changedFields.length ? "changed" : "same",
            changedFields,
            wordDelta: sceneWords(scene) - sceneWords(previous),
        };
    });
    for (const scene of draft.scenes) {
        if (currentIds.has(scene.id)) continue;
        scenes.push({ id: scene.id, no: scene.no, heading: scriptSceneHeading(scene), status: "removed", changedFields: [], wordDelta: -sceneWords(scene) });
    }

    const characterChanges: string[] = [];
    const currentNames = new Set(project.characters.map((character) => character.name.trim()).filter(Boolean));
    const draftNames = new Set(draft.characters.map((character) => character.name.trim()).filter(Boolean));
    for (const name of currentNames) if (!draftNames.has(name)) characterChanges.push(`新增角色：${name}`);
    for (const name of draftNames) if (!currentNames.has(name)) characterChanges.push(`删除角色：${name}`);
    for (const character of project.characters) {
        const previous = draft.characters.find((item) => item.name.trim() === character.name.trim());
        if (!previous) continue;
        const changed = (["role", "want", "need", "flaw", "arc", "description"] as const)
            .filter((key) => character[key] !== previous[key])
            .map((key) => ({ role: "定位", want: "目标", need: "需要", flaw: "缺陷", arc: "变化", description: "小传" })[key]);
        if (changed.length) characterChanges.push(`${character.name || "未命名角色"}：${changed.join("、")}变化`);
    }

    return {
        scenes,
        added: scenes.filter((scene) => scene.status === "added").length,
        removed: scenes.filter((scene) => scene.status === "removed").length,
        changed: scenes.filter((scene) => scene.status === "changed").length,
        same: scenes.filter((scene) => scene.status === "same").length,
        wordDelta: scriptWordCount(project) - draftWords(draft),
        characterChanges,
    };
}

export function scriptSceneMissingFields(scene: ScriptScene) {
    return [
        ["目标", scene.goal],
        ["冲突", scene.conflict],
        ["转折", scene.turn],
        ["结果", scene.outcome],
    ].filter(([, value]) => !value.trim()).map(([label]) => label);
}
