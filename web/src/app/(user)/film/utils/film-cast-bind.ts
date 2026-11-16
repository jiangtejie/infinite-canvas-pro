import type { FilmAsset, FilmEpisode, FilmShot, FilmShotCharacterBinding, FilmShotCharacterSuggestion } from "@/lib/film/types";
import { findFilmCharacterState } from "./film-character";

export type FilmCastBindResult = {
    episodes: FilmEpisode[];
    boundCharacters: number;
    boundLocations: number;
    suggestedCharacters: number;
};

function normalize(value: string) {
    return value.normalize("NFKC").trim();
}

function characterNames(asset: FilmAsset) {
    return [asset.name, ...asset.aliases].map(normalize).filter(Boolean);
}

function matchCharacterNames(text: string, characters: FilmAsset[]) {
    const owners = new Map<string, Set<string>>();
    for (const character of characters) {
        for (const name of characterNames(character)) {
            const ids = owners.get(name) || new Set<string>();
            ids.add(character.id);
            owners.set(name, ids);
        }
    }
    const matched = [...owners.entries()].filter(([name]) => text.includes(name));
    return matched
        .filter(([name]) => !matched.some(([other]) => other.length > name.length && other.includes(name)))
        .sort(([left], [right]) => text.indexOf(left) - text.indexOf(right));
}

function bindingFor(character: FilmAsset): FilmShotCharacterBinding {
    return { characterId: character.id, source: "ai", characterNameSnapshot: character.name, continuity: {} };
}

function suggestionsFor(matches: Array<[string, Set<string>]>, boundCharacterIds: Set<string>): FilmShotCharacterSuggestion[] {
    return matches
        .filter(([, ids]) => ids.size > 1 && ![...ids].some((id) => boundCharacterIds.has(id)))
        .map(([characterName]) => ({ characterName }));
}

export function bindFilmCast(episodes: FilmEpisode[], characters: FilmAsset[], locations: FilmAsset[]): FilmCastBindResult {
    let boundCharacters = 0;
    let boundLocations = 0;
    let suggestedCharacters = 0;
    const next = episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
                const text = normalize(`${shot.description} ${shot.dialogue}`);
                const matches = matchCharacterNames(text, characters);
                const suggestions = suggestionsFor(matches, new Set(shot.characterBindings.map((binding) => binding.characterId)));
                const characterBindings = shot.characterBindings.length
                    ? shot.characterBindings
                    : matches
                        .filter(([, ids]) => ids.size === 1)
                        .map(([, ids]) => characters.find((character) => character.id === [...ids][0])!)
                        .map(bindingFor);
                if (!shot.characterBindings.length && characterBindings.length) boundCharacters += 1;
                if (suggestions.length) suggestedCharacters += 1;
                const matchedLocation = locations
                    .filter((asset) => normalize(asset.name) && (text.includes(normalize(asset.name)) || scene.name.includes(normalize(asset.name))))
                    .sort((left, right) => right.name.length - left.name.length)[0];
                const locationId = shot.locationId || matchedLocation?.id || "";
                if (!shot.locationId && matchedLocation) boundLocations += 1;
                return { ...shot, characterBindings, characterSuggestions: suggestions.length ? suggestions : undefined, locationId };
            }),
        })),
    }));
    return { episodes: next, boundCharacters, boundLocations, suggestedCharacters };
}

export function setFilmShotCharacterBindings(shot: FilmShot, bindings: Array<{ characterId: string; stateId?: string; continuity?: FilmShotCharacterBinding["continuity"] }>, characters: FilmAsset[]): FilmShot {
    const normalized: FilmShotCharacterBinding[] = [];
    for (const item of bindings) {
        const character = characters.find((asset) => asset.id === item.characterId);
        if (!character) throw new Error("角色不存在或已被删除");
        const state = item.stateId ? findFilmCharacterState(character, item.stateId) : undefined;
        if (item.stateId && !state) throw new Error("状态不存在或不属于该角色");
        if (normalized.some((binding) => binding.characterId === character.id)) continue;
        normalized.push({
            characterId: character.id,
            stateId: state?.id,
            source: "manual",
            characterNameSnapshot: character.name,
            stateNameSnapshot: state?.name,
            continuity: item.continuity || {},
        });
    }
    const boundNames = new Set(normalized.flatMap((binding) => characterNames(characters.find((asset) => asset.id === binding.characterId)!)));
    const suggestions = (shot.characterSuggestions || []).filter((suggestion) => !boundNames.has(normalize(suggestion.characterName)));
    return { ...shot, characterBindings: normalized, characterSuggestions: suggestions.length ? suggestions : undefined };
}
