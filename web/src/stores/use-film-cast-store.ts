import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";

import { createDebouncedJSONStorage } from "@/lib/persisted-store";
import { FILM_CAST_STORE_KEY } from "@/lib/storage-keys";
import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";
import { upsertFilmLibraryAsset } from "@/app/(user)/film/utils/film-library";

type FilmCastListKey = "characters" | "locations" | "props" | "costumes" | "styles";

const LIST_KEYS: Record<FilmAssetKind, FilmCastListKey> = {
    character: "characters",
    location: "locations",
    prop: "props",
    costume: "costumes",
    style: "styles",
};

type FilmCastStore = {
    hydrated: boolean;
    characters: FilmAsset[];
    locations: FilmAsset[];
    props: FilmAsset[];
    costumes: FilmAsset[];
    styles: FilmAsset[];
    markHydrated: () => void;
    /** 按来源去重存入：命中已有条目则原地更新并保留库 id。 */
    saveAsset: (kind: FilmAssetKind, asset: FilmAsset) => "created" | "updated";
    updateAsset: (kind: FilmAssetKind, id: string, patch: Partial<FilmAsset>) => void;
    removeAsset: (kind: FilmAssetKind, id: string) => void;
};

const castStorage = createDebouncedJSONStorage<FilmCastStore>();

export const useFilmCastStore = create<FilmCastStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            characters: [],
            locations: [],
            props: [],
            costumes: [],
            styles: [],
            markHydrated: () => set({ hydrated: true }),
            saveAsset: (kind, asset) => {
                const key = LIST_KEYS[kind];
                const result = upsertFilmLibraryAsset(get()[key], asset);
                set({ [key]: result.library } as Partial<FilmCastStore>);
                return result.mode;
            },
            updateAsset: (kind, id, patch) => set((state) => {
                const key = LIST_KEYS[kind];
                return { [key]: state[key].map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) } as Partial<FilmCastStore>;
            }),
            removeAsset: (kind, id) => set((state) => {
                const key = LIST_KEYS[kind];
                return { [key]: state[key].filter((item) => item.id !== id) } as Partial<FilmCastStore>;
            }),
        }),
        {
            name: FILM_CAST_STORE_KEY,
            storage: castStorage,
            partialize: (state) => ({
                characters: state.characters,
                locations: state.locations,
                props: state.props,
                costumes: state.costumes,
                styles: state.styles,
            }) as StorageValue<FilmCastStore>["state"],
            onRehydrateStorage: () => (state) => {
                state?.markHydrated();
            },
        },
    ),
);
