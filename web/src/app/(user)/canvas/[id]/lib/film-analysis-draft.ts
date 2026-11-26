import { nanoid } from "nanoid";

import type { FilmAssetSuggestion } from "@/lib/film/film-asset-suggestions";
import type { FilmShot } from "@/lib/film/types";
import type { FilmAnalysisSessionDraft } from "../../types";

export type FilmAnalysisScenePatch = Partial<Pick<NonNullable<FilmAnalysisSessionDraft["episodes"][number]["scenes"][number]>, "name" | "location" | "time" | "mood">>;
export type FilmAnalysisShotPatch = Partial<Pick<NonNullable<FilmAnalysisSessionDraft["episodes"][number]["scenes"][number]["shots"][number]>, "shotNo" | "shotType" | "cameraMovement" | "duration" | "description" | "dialogue" | "prompt">>;
export type FilmAnalysisAssetPatch = Partial<Pick<FilmAssetSuggestion, "name" | "aliases" | "description" | "visualPrompt" | "kind" | "forceNew">>;

export type FilmAnalysisDraftCommand =
    | { type: "scene"; sceneKey: string; patch: FilmAnalysisScenePatch }
    | { type: "shot"; sceneKey: string; index: number; patch: FilmAnalysisShotPatch }
    | { type: "add-shot"; sceneKey: string }
    | { type: "remove-shot"; sceneKey: string; index: number }
    | { type: "move-shot"; sceneKey: string; index: number; direction: -1 | 1 }
    | { type: "merge-shot"; sceneKey: string; index: number }
    | { type: "split-shot"; sceneKey: string; index: number }
    | { type: "asset"; key: string; patch: FilmAnalysisAssetPatch }
    | { type: "merge-asset"; sourceKey: string; targetKey: string };

function sceneAt(draft: FilmAnalysisSessionDraft, sceneKey: string) {
    const [episodeIndex, sceneIndex] = sceneKey.split(":").map(Number);
    return draft.episodes[episodeIndex]?.scenes[sceneIndex];
}

function newShot(index: number): FilmShot {
    return {
        id: nanoid(),
        shotNo: String(index + 1).padStart(2, "0"),
        shotType: "MS",
        cameraMovement: "固定",
        duration: 4,
        description: "",
        dialogue: "",
        audio: "",
        prompt: "",
        characterBindings: [],
        propBindings: [],
    };
}

function splitDescription(text: string): [string, string] {
    const trimmed = text.trim();
    if (!trimmed) return ["", ""];
    const parts = trimmed.split(/(?<=[。！？!?；;])/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
        const middle = Math.ceil(parts.length / 2);
        return [parts.slice(0, middle).join(""), parts.slice(middle).join("")];
    }
    const middle = Math.ceil(trimmed.length / 2);
    return [trimmed.slice(0, middle), trimmed.slice(middle)];
}

/** 提案编辑命令：纯函数，未编辑的场次/镜头保持原对象。 */
export function applyFilmAnalysisDraftCommand(draft: FilmAnalysisSessionDraft, command: FilmAnalysisDraftCommand): FilmAnalysisSessionDraft {
    if (command.type === "asset") {
        return {
            ...draft,
            suggestions: draft.suggestions.map((item) => item.key === command.key ? { ...item, ...command.patch } : item),
        };
    }
    if (command.type === "merge-asset") {
        const source = draft.suggestions.find((item) => item.key === command.sourceKey);
        const target = draft.suggestions.find((item) => item.key === command.targetKey);
        if (!source || !target || source.key === target.key) return draft;
        const names = new Set([target.name, ...target.aliases].map((name) => name.trim()).filter(Boolean));
        const aliases = [...new Set([...target.aliases, source.name, ...source.aliases].filter((name) => name.trim() && !names.has(name)))];
        return {
            ...draft,
            suggestions: draft.suggestions
                .filter((item) => item.key !== command.sourceKey)
                .map((item) => item.key === command.targetKey ? {
                    ...item,
                    aliases: [...new Set([...item.aliases, ...aliases])],
                    description: item.description || source.description,
                    visualPrompt: item.visualPrompt || source.visualPrompt,
                    kind: item.kind,
                } : item),
        };
    }
    const [episodeIndex, sceneIndex] = command.sceneKey.split(":").map(Number);
    const episode = draft.episodes[episodeIndex];
    const scene = sceneAt(draft, command.sceneKey);
    if (!episode || !scene) return draft;
    const nextScene = { ...scene, shots: [...scene.shots] };
    switch (command.type) {
        case "scene":
            Object.assign(nextScene, command.patch);
            break;
        case "shot":
            if (!nextScene.shots[command.index]) return draft;
            nextScene.shots[command.index] = { ...nextScene.shots[command.index], ...command.patch };
            break;
        case "add-shot":
            nextScene.shots.push(newShot(nextScene.shots.length));
            break;
        case "remove-shot":
            nextScene.shots.splice(command.index, 1);
            break;
        case "move-shot": {
            const target = command.index + command.direction;
            if (target < 0 || target >= nextScene.shots.length) return draft;
            [nextScene.shots[command.index], nextScene.shots[target]] = [nextScene.shots[target], nextScene.shots[command.index]];
            break;
        }
        case "merge-shot": {
            const current = nextScene.shots[command.index];
            const next = nextScene.shots[command.index + 1];
            if (!current || !next) return draft;
            nextScene.shots[command.index] = {
                ...current,
                description: [current.description, next.description].filter(Boolean).join("\n"),
                dialogue: [current.dialogue, next.dialogue].filter(Boolean).join("\n"),
                prompt: [current.prompt, next.prompt].filter(Boolean).join("\n"),
                duration: Math.max(1, current.duration + next.duration),
            };
            nextScene.shots.splice(command.index + 1, 1);
            break;
        }
        case "split-shot": {
            const current = nextScene.shots[command.index];
            if (!current) return draft;
            const [first, second] = splitDescription(current.description || current.prompt);
            const firstDuration = Math.max(1, Math.ceil(current.duration / 2));
            nextScene.shots[command.index] = { ...current, description: first, duration: firstDuration };
            nextScene.shots.splice(command.index + 1, 0, {
                ...current,
                id: nanoid(),
                shotNo: current.shotNo ? `${current.shotNo}-2` : "",
                description: second,
                duration: Math.max(1, current.duration - firstDuration),
            });
            break;
        }
    }
    const episodes = draft.episodes.map((item, index) => index === episodeIndex ? {
        ...item,
        scenes: item.scenes.map((itemScene, indexScene) => indexScene === sceneIndex ? nextScene : itemScene),
    } : item);
    return { ...draft, episodes };
}
