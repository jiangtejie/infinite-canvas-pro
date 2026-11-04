import { nanoid } from "nanoid";

import type { FilmEpisode, FilmScene, FilmShot } from "../types";

export const MAX_FILM_SHOTS = 500;

const EPISODE_PATTERNS: RegExp[] = [
    /^第\s*[0-9零一二三四五六七八九十百]+\s*集[：:\s]*(.*)$/,
    /^EP(?:ISODE)?\s*[0-9]+\s*[：:\s]*(.*)$/i,
];

const SCENE_PATTERNS: Array<{ re: RegExp; nameGroup: number }> = [
    { re: /^第\s*[0-9零一二三四五六七八九十百]+\s*场[：:\s]*(.*)$/, nameGroup: 1 },
    { re: /^场景\s*[0-9零一二三四五六七八九十百]*\s*[：:、\s]*(.*)$/, nameGroup: 1 },
    { re: /^(\d{1,2}[-－]\d{1,2})\s*[：:、\s]*(.*)$/, nameGroup: 2 },
    { re: /^(内景|外景|INT|EXT)[.：:\s]+(.*)$/i, nameGroup: 2 },
];

const SHOT_NUMBER_RE = /^(\d{1,3})[.、\s]+(.*)$/;
const SHOT_TYPE_RE = /^(ECU|MCU|CU|WS|MS|LS|OTS|POV)[.：:\s]+(.*)$/i;

export function parseScript(script: string): FilmEpisode[] {
    const lines = (script || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const episodes: FilmEpisode[] = [];
    let currentEpisode: FilmEpisode | null = null;
    let currentScene: FilmScene | null = null;

    const openEpisode = (title: string) => {
        currentEpisode = {
            id: nanoid(),
            title: (title || "").trim() || `第 ${episodes.length + 1} 集`,
            scenes: [],
        };
        episodes.push(currentEpisode);
        currentScene = null;
    };

    const openScene = (name: string) => {
        if (!currentEpisode) openEpisode("");
        currentScene = {
            id: nanoid(),
            name: (name || "").trim() || `场景 ${currentEpisode!.scenes.length + 1}`,
            location: "",
            time: "",
            mood: "",
            shots: [],
        };
        currentEpisode!.scenes.push(currentScene);
    };

    for (const line of lines) {
        const episodeTitle = matchEpisode(line);
        if (episodeTitle) {
            openEpisode(episodeTitle);
            continue;
        }
        const sceneName = matchScene(line);
        if (sceneName) {
            openScene(sceneName);
            continue;
        }
        if (!currentEpisode) openEpisode("");
        if (!currentScene) openScene("");
        if (currentScene!.shots.length >= MAX_FILM_SHOTS) break;
        const parsed = parseShotLine(line);
        const shotIndex = currentScene!.shots.length + 1;
        currentScene!.shots.push({
            id: nanoid(),
            shotNo: `${episodes.length}-${currentEpisode!.scenes.length}-${parsed.number || String(shotIndex).padStart(2, "0")}`,
            shotType: parsed.shotType,
            duration: 5,
            description: parsed.description,
            dialogue: parsed.dialogue,
            audio: "",
            prompt: "",
            status: "idle",
        });
    }

    return episodes;
}

function matchEpisode(line: string): string | null {
    for (const pattern of EPISODE_PATTERNS) {
        const match = line.match(pattern);
        if (!match) continue;
        const title = (match[1] || "").trim();
        return title || line.slice(0, 40);
    }
    return null;
}

function matchScene(line: string): string | null {
    for (const pattern of SCENE_PATTERNS) {
        const match = line.match(pattern.re);
        if (!match) continue;
        const name = (match[pattern.nameGroup] || "").trim();
        return name || line.slice(0, 40);
    }
    return null;
}

function parseShotLine(line: string): { number: string; shotType: string; description: string; dialogue: string } {
    let rest = line;
    let number = "";
    let shotType = "";
    const numberMatch = rest.match(SHOT_NUMBER_RE);
    if (numberMatch) {
        number = numberMatch[1].padStart(2, "0");
        rest = numberMatch[2].trim();
    }
    const typeMatch = rest.match(SHOT_TYPE_RE);
    if (typeMatch) {
        shotType = typeMatch[1].toUpperCase();
        rest = typeMatch[2].trim();
    }
    const dialogueMatch = rest.match(/^([^：:]{1,12})[：:]\s*(.+)$/);
    return {
        number,
        shotType,
        description: rest,
        dialogue: dialogueMatch ? `${dialogueMatch[1].trim()}：${dialogueMatch[2].trim()}` : "",
    };
}

export function flattenFilmShots(episodes: FilmEpisode[]): FilmShot[] {
    return episodes.flatMap((episode) => episode.scenes.flatMap((scene) => scene.shots));
}

export function countFilmScenes(episodes: FilmEpisode[]): number {
    return episodes.reduce((total, episode) => total + episode.scenes.length, 0);
}

export function countReadyShots(episodes: FilmEpisode[]): number {
    return flattenFilmShots(episodes).filter((shot) => shot.status !== "idle" && shot.status !== "failed").length;
}
