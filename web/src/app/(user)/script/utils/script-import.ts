import { parseFilmScriptDocument, readFilmScriptFile } from "@/lib/film/film-script-import";
import type { FilmScriptDocument, FilmScriptScene } from "@/lib/film/types";
import type { ScriptProject } from "../types";
import { createScriptCharacter, createScriptProject, createScriptScene } from "./script-project";

function sceneContent(scene: FilmScriptScene) {
    return scene.blocks.map((block) => {
        if (block.type === "dialogue") return `${block.character}${block.parenthetical ? `（${block.parenthetical}）` : ""}：${block.text}`;
        return block.text;
    }).filter(Boolean).join("\n\n");
}

function firstActionText(scene: FilmScriptScene) {
    const action = scene.blocks.find((block) => block.type === "action");
    return action ? action.text.slice(0, 80) : "";
}

export function scriptProjectFromDocument(document: FilmScriptDocument, title: string): ScriptProject {
    const project = createScriptProject({ title });
    const parsedScenes = document.episodes.flatMap((episode) => episode.scenes);
    project.scenes = parsedScenes.map((scene, index) => ({
        ...createScriptScene(index + 1),
        interiorExterior: scene.interiorExterior,
        location: scene.location || scene.heading,
        timeOfDay: scene.timeOfDay,
        characters: scene.characters,
        summary: firstActionText(scene) || scene.heading,
        content: sceneContent(scene),
    }));
    const names = [...new Set(project.scenes.flatMap((scene) => scene.characters))];
    project.characters = names.map((name) => ({ ...createScriptCharacter(), name }));
    return project;
}

export function scriptProjectFromText(text: string, title: string) {
    return scriptProjectFromDocument(parseFilmScriptDocument(text), title);
}

export async function scriptProjectFromFile(file: File, title: string) {
    const { text, format } = await readFilmScriptFile(file);
    return scriptProjectFromDocument(parseFilmScriptDocument(text, format), title || file.name.replace(/\.[^.]+$/, ""));
}
