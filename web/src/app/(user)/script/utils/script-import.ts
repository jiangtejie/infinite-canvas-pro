import { parseFilmScriptDocument, readFilmScriptFile } from "@/lib/film/film-script-import";
import type { FilmScriptDocument, FilmScriptScene } from "@/lib/film/types";
import { nanoid } from "nanoid";
import type { ScriptEpisode, ScriptProjectDocument } from "../types";
import { createScriptCharacter, createScriptProject, createScriptScene } from "./script-project";

function sceneContent(scene: FilmScriptScene) {
    return scene.blocks.map((block) => {
        if (block.type === "dialogue") return `${block.character}${block.parenthetical ? `（${block.parenthetical}）` : ""}：${block.text}`;
        return block.text;
    }).filter(Boolean).join("\n\n");
}

export function scriptProjectFromDocument(document: FilmScriptDocument, title: string): ScriptProjectDocument {
    const project = createScriptProject({ title });
    project.episodes = document.episodes.length ? document.episodes.map((episode, episodeIndex): ScriptEpisode => ({
        id: nanoid(),
        no: episodeIndex + 1,
        title: episode.title || `第 ${episodeIndex + 1} 集`,
        scenes: episode.scenes.map((scene, sceneIndex) => ({
            ...createScriptScene(sceneIndex + 1),
            interiorExterior: scene.interiorExterior,
            location: scene.location || scene.heading,
            timeOfDay: scene.timeOfDay,
            characters: scene.characters,
            summary: scene.blocks.find((block) => block.type === "action")?.text.slice(0, 80) || scene.heading,
            content: sceneContent(scene),
        })),
    })) : [{
        id: nanoid(), no: 1, title: "第 1 集", scenes: [createScriptScene(1)],
    }];
    const names = [...new Set(project.episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.characters)))];
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
