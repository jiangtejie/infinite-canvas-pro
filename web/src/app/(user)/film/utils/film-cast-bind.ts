import type { FilmAsset, FilmEpisode, FilmShot, FilmShotCharacterBinding, FilmShotCharacterSuggestion, FilmShotPropBinding, FilmShotVariantSuggestion } from "@/lib/film/types";
import { findFilmCharacterState } from "./film-character";

export type FilmCastBindResult = {
    episodes: FilmEpisode[];
    boundCharacters: number;
    boundLocations: number;
    boundProps: number;
    boundVariants: number;
    suggestedCharacters: number;
    suggestedVariants: number;
};

function normalize(value: string) {
    return value.normalize("NFKC").trim();
}

function assetNames(asset: FilmAsset) {
    return [asset.name, ...asset.aliases].map(normalize).filter(Boolean);
}

/** 最长唯一名称匹配：短名称不抢长名称，同名资产保留歧义。 */
function matchAssetNames(text: string, assets: FilmAsset[]) {
    const owners = new Map<string, Set<string>>();
    for (const asset of assets) {
        for (const name of assetNames(asset)) {
            const ids = owners.get(name) || new Set<string>();
            ids.add(asset.id);
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

function propBindingFor(prop: FilmAsset): FilmShotPropBinding {
    return { propId: prop.id, propNameSnapshot: prop.name, source: "ai" };
}

function suggestionsFor(matches: Array<[string, Set<string>]>, boundCharacterIds: Set<string>): FilmShotCharacterSuggestion[] {
    return matches
        .filter(([, ids]) => ids.size > 1 && ![...ids].some((id) => boundCharacterIds.has(id)))
        .map(([characterName]) => ({ characterName }));
}

function matchesVariant(variant: { timeOfDay?: string; mood?: string }, sceneTime: string, sceneMood: string) {
    const time = normalize(sceneTime);
    const mood = normalize(sceneMood);
    const variantTime = normalize(variant.timeOfDay || "");
    const variantMood = normalize(variant.mood || "");
    return Boolean(time && variantTime && (time.includes(variantTime) || variantTime.includes(time)))
        || Boolean(mood && variantMood && (mood.includes(variantMood) || variantMood.includes(mood)));
}

export function bindFilmCast(episodes: FilmEpisode[], characters: FilmAsset[], locations: FilmAsset[], props: FilmAsset[] = []): FilmCastBindResult {
    let boundCharacters = 0;
    let boundLocations = 0;
    let boundProps = 0;
    let boundVariants = 0;
    let suggestedCharacters = 0;
    let suggestedVariants = 0;
    const next = episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
                const text = normalize(`${shot.description} ${shot.dialogue}`);
                const matches = matchAssetNames(text, characters);
                const suggestions = suggestionsFor(matches, new Set(shot.characterBindings.map((binding) => binding.characterId)));
                const characterBindings = shot.characterBindings.length
                    ? shot.characterBindings
                    : matches
                        .filter(([, ids]) => ids.size === 1)
                        .map(([, ids]) => characters.find((character) => character.id === [...ids][0])!)
                        .map(bindingFor);
                if (!shot.characterBindings.length && characterBindings.length) boundCharacters += 1;
                if (suggestions.length) suggestedCharacters += 1;

                const existingPropBindings = shot.propBindings || [];
                const propBindings = existingPropBindings.length
                    ? existingPropBindings
                    : matchAssetNames(text, props)
                        .filter(([, ids]) => ids.size === 1)
                        .map(([, ids]) => props.find((prop) => prop.id === [...ids][0])!)
                        .map(propBindingFor);
                if (!existingPropBindings.length && propBindings.length) boundProps += 1;

                const matchedLocation = locations
                    .filter((asset) => normalize(asset.name) && (text.includes(normalize(asset.name)) || scene.name.includes(normalize(asset.name)) || scene.location.includes(normalize(asset.name))))
                    .sort((left, right) => right.name.length - left.name.length)[0];
                const locationId = shot.locationId || matchedLocation?.id || "";
                if (!shot.locationId && matchedLocation) boundLocations += 1;

                const locationAsset = locations.find((asset) => asset.id === locationId);
                const variantCandidates = (locationAsset?.location?.variants || []).filter((variant) => matchesVariant(variant, scene.time, scene.mood));
                let locationVariantId = shot.locationVariantId;
                let variantSuggestions: FilmShotVariantSuggestion[] | undefined = shot.variantSuggestions;
                if (!locationVariantId) {
                    if (variantCandidates.length === 1) {
                        locationVariantId = variantCandidates[0].id;
                        variantSuggestions = undefined;
                        if (shot.locationVariantId !== locationVariantId) boundVariants += 1;
                    } else if (variantCandidates.length > 1) {
                        variantSuggestions = variantCandidates.map((variant) => ({ variantId: variant.id, variantName: variant.name }));
                        suggestedVariants += 1;
                    }
                }

                return { ...shot, characterBindings, characterSuggestions: suggestions.length ? suggestions : undefined, propBindings, locationId, locationVariantId, variantSuggestions };
            }),
        })),
    }));
    return { episodes: next, boundCharacters, boundLocations, boundProps, boundVariants, suggestedCharacters, suggestedVariants };
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
    const boundNames = new Set(normalized.flatMap((binding) => assetNames(characters.find((asset) => asset.id === binding.characterId)!)));
    const suggestions = (shot.characterSuggestions || []).filter((suggestion) => !boundNames.has(normalize(suggestion.characterName)));
    return { ...shot, characterBindings: normalized, characterSuggestions: suggestions.length ? suggestions : undefined };
}

export function setFilmShotPropBindings(shot: FilmShot, propIds: string[], props: FilmAsset[]): FilmShot {
    const bindings: FilmShotPropBinding[] = [];
    for (const propId of propIds) {
        const prop = props.find((asset) => asset.id === propId);
        if (!prop || bindings.some((binding) => binding.propId === prop.id)) continue;
        bindings.push({ propId: prop.id, propNameSnapshot: prop.name, source: "manual" });
    }
    return { ...shot, propBindings: bindings };
}

export function setFilmShotLocationVariant(shot: FilmShot, locationVariantId?: string): FilmShot {
    return { ...shot, locationVariantId: locationVariantId || undefined, variantSuggestions: undefined };
}
