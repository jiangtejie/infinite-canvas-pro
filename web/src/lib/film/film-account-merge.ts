import type { FilmAsset } from "@/lib/film/types";

export type FilmLibrarySnapshot = {
    characters: FilmAsset[];
    locations: FilmAsset[];
    props: FilmAsset[];
    costumes: FilmAsset[];
    styles: FilmAsset[];
};

export const EMPTY_FILM_LIBRARY: FilmLibrarySnapshot = { characters: [], locations: [], props: [], costumes: [], styles: [] };
