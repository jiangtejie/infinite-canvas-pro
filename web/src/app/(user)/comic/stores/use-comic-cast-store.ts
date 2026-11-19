import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";

import { createDebouncedJSONStorage } from "@/lib/persisted-store";
import { COMIC_CAST_STORE_KEY } from "@/lib/storage-keys";
import type { ComicCharacter, ComicLibraryCharacter, ComicLibraryLocation, ComicLocation } from "../types";
import { normalizeComicCharacter, type LegacyComicCharacter } from "../utils/comic-project";

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
            addCharacter: (character) => set((state) => {
                const now = new Date().toISOString();
                return { characters: [{ ...character, id: nanoid(), createdAt: now, updatedAt: now }, ...state.characters] };
            }),
            addLocation: (location) => set((state) => {
                const now = new Date().toISOString();
                return { locations: [{ ...location, id: nanoid(), createdAt: now, updatedAt: now }, ...state.locations] };
            }),
            updateCharacter: (id, patch) => set((state) => ({ characters: state.characters.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) })),
            updateLocation: (id, patch) => set((state) => ({ locations: state.locations.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) })),
            removeCharacter: (id) => set((state) => ({ characters: state.characters.filter((item) => item.id !== id) })),
            removeLocation: (id) => set((state) => ({ locations: state.locations.filter((item) => item.id !== id) })),
        }),
        {
            name: COMIC_CAST_STORE_KEY,
            storage: castStorage,
            version: 1,
            migrate: (persistedState, version) => {
                const state = persistedState as { characters?: Array<LegacyComicCharacter & { createdAt?: string }>; locations?: ComicLibraryLocation[] } | undefined;
                if (!state || version >= 1) return persistedState as StorageValue<ComicCastStore>["state"];
                return {
                    ...state,
                    characters: (state.characters || []).map((character, index) => ({
                        ...normalizeComicCharacter(character, character.id || `legacy:cast:${index}`),
                        createdAt: character.createdAt || "",
                    })),
                } as StorageValue<ComicCastStore>["state"];
            },
            partialize: (state) => ({ characters: state.characters, locations: state.locations }) as StorageValue<ComicCastStore>["state"],
            onRehydrateStorage: () => (state) => state?.markHydrated(),
        },
    ),
);
