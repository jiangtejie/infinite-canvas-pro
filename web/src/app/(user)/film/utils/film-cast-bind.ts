import type { FilmAsset, FilmEpisode } from "../types";

/** 按角色/场景名称匹配镜头文本，自动补上引用；已有手动绑定不覆盖。 */
export function bindFilmCast(episodes: FilmEpisode[], characters: FilmAsset[], locations: FilmAsset[]) {
    const namedCharacters = characters.filter((asset) => asset.name.trim().length >= 2);
    const namedLocations = locations.filter((asset) => asset.name.trim().length >= 2);
    let boundCharacters = 0;
    let boundLocations = 0;

    const next = episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            shots: scene.shots.map((shot) => {
                const text = `${shot.description} ${shot.dialogue}`;
                const matchedCharacters = namedCharacters.filter((asset) => text.includes(asset.name.trim()));
                const matchedLocation = namedLocations.find((asset) => text.includes(asset.name.trim()) || scene.name.includes(asset.name.trim()));
                const characterIds = shot.characterIds?.length ? shot.characterIds : matchedCharacters.map((asset) => asset.id);
                if (!shot.characterIds?.length && characterIds.length) boundCharacters += 1;
                const locationId = shot.locationId || matchedLocation?.id || "";
                if (!shot.locationId && matchedLocation) boundLocations += 1;
                return { ...shot, characterIds, locationId };
            }),
        })),
    }));

    return { episodes: next, boundCharacters, boundLocations };
}
