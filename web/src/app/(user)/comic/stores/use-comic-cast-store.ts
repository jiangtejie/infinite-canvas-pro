import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";

import { createDebouncedJSONStorage } from "@/lib/persisted-store";
import { COMIC_CAST_STORE_KEY } from "@/lib/storage-keys";
import type { ComicCharacter, ComicLibraryCharacter, ComicLibraryLocation, ComicLocation } from "../types";

type ComicCastStore = {
    hydrated: boolean;
    characters: ComicLibraryCharacter[];
    locations: ComicLibraryLocation[];
    markHydrated: () => void;
    addCharacter: (character: ComicCharacter) => void;
    addLocation: (location: ComicLocation) => void;
    updateCharacter: (id: string, patch: Partial<ComicCharacter>) => void;
    updateLocation: (id: string, patch: Partial<ComicLocation>) => void;
    removeCharacter: (id: string) => void;
    removeLocation: (id: string) => void;
};

const castStorage = createDebouncedJSONStorage<ComicCastStore>();

export const useComicCastStore = create<ComicCastStore>()(
    persist(
        (set) => ({
            hydrated: false,
            characters: [],
            locations: [],
            markHydrated: () => set({ hydrated: true }),
            addCharacter: (character) => set((state) => ({ characters: [{ ...character, id: nanoid(), createdAt: new Date().toISOString() }, ...state.characters] })),
            addLocation: (location) => set((state) => ({ locations: [{ ...location, id: nanoid(), createdAt: new Date().toISOString() }, ...state.locations] })),
            updateCharacter: (id, patch) => set((state) => ({ characters: state.characters.map((item) => item.id === id ? { ...item, ...patch } : item) })),
            updateLocation: (id, patch) => set((state) => ({ locations: state.locations.map((item) => item.id === id ? { ...item, ...patch } : item) })),
            removeCharacter: (id) => set((state) => ({ characters: state.characters.filter((item) => item.id !== id) })),
            removeLocation: (id) => set((state) => ({ locations: state.locations.filter((item) => item.id !== id) })),
        }),
        {
            name: COMIC_CAST_STORE_KEY,
            storage: castStorage,
            partialize: (state) => ({ characters: state.characters, locations: state.locations }) as StorageValue<ComicCastStore>["state"],
            onRehydrateStorage: () => (state) => state?.markHydrated(),
        },
    ),
);
