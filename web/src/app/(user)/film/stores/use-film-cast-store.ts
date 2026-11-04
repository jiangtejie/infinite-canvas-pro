import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { FilmAsset, FilmAssetKind } from "../types";

export const FILM_CAST_STORE_KEY = "infinite-canvas:film_cast_store";

type FilmCastStore = {
    hydrated: boolean;
    characters: FilmAsset[];
    locations: FilmAsset[];
    markHydrated: () => void;
    addAsset: (kind: FilmAssetKind, asset: FilmAsset) => void;
    updateAsset: (kind: FilmAssetKind, id: string, patch: Partial<FilmAsset>) => void;
    removeAsset: (kind: FilmAssetKind, id: string) => void;
};

export const useFilmCastStore = create<FilmCastStore>()(
    persist(
        (set) => ({
            hydrated: false,
            characters: [],
            locations: [],
            markHydrated: () => set({ hydrated: true }),
            addAsset: (kind, asset) => set((state) => {
                const next: FilmAsset = { ...asset, id: nanoid(), createdAt: new Date().toISOString() };
                return kind === "character"
                    ? { characters: [next, ...state.characters] }
                    : { locations: [next, ...state.locations] };
            }),
            updateAsset: (kind, id, patch) => set((state) => kind === "character"
                ? { characters: state.characters.map((item) => item.id === id ? { ...item, ...patch } : item) }
                : { locations: state.locations.map((item) => item.id === id ? { ...item, ...patch } : item) }),
            removeAsset: (kind, id) => set((state) => kind === "character"
                ? { characters: state.characters.filter((item) => item.id !== id) }
                : { locations: state.locations.filter((item) => item.id !== id) }),
        }),
        {
            name: FILM_CAST_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ characters: state.characters, locations: state.locations }),
            onRehydrateStorage: () => (state) => {
                state?.markHydrated();
            },
        },
    ),
);
