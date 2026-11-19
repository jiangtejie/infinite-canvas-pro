import type { FilmAsset, FilmProject } from "@/lib/film/types";

export type FilmProjectSnapshot = { projects: FilmProject[] };
export type FilmLibrarySnapshot = {
    characters: FilmAsset[];
    locations: FilmAsset[];
    props: FilmAsset[];
    costumes: FilmAsset[];
    styles: FilmAsset[];
};

export const EMPTY_FILM_LIBRARY: FilmLibrarySnapshot = { characters: [], locations: [], props: [], costumes: [], styles: [] };

function mergeList<T extends { id: string; updatedAt?: string }>(remote: T[], local: T[]) {
    const items = new Map(remote.map((item) => [item.id, item]));
    let shouldPush = false;
    for (const item of local) {
        const previous = items.get(item.id);
        if (!previous || Date.parse(item.updatedAt || "") > Date.parse(previous.updatedAt || "")) {
            shouldPush = true;
            items.set(item.id, item);
        }
    }
    return {
        list: [...items.values()].sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || "")),
        shouldPush,
    };
}

/** 远端与本地按 id + updatedAt 合并；本地独有或更新时标记需要回传。 */
export function mergeFilmProjects(remote: FilmProject[], local: FilmProject[]): { projects: FilmProject[]; shouldPush: boolean } {
    const merged = mergeList(remote, local);
    return { projects: merged.list, shouldPush: merged.shouldPush };
}

export function mergeFilmLibrary(remote: FilmLibrarySnapshot, local: FilmLibrarySnapshot): { snapshot: FilmLibrarySnapshot; shouldPush: boolean } {
    const characters = mergeList(remote.characters, local.characters);
    const locations = mergeList(remote.locations, local.locations);
    const props = mergeList(remote.props, local.props);
    const costumes = mergeList(remote.costumes, local.costumes);
    const styles = mergeList(remote.styles, local.styles);
    return {
        snapshot: { characters: characters.list, locations: locations.list, props: props.list, costumes: costumes.list, styles: styles.list },
        shouldPush: characters.shouldPush || locations.shouldPush || props.shouldPush || costumes.shouldPush || styles.shouldPush,
    };
}
