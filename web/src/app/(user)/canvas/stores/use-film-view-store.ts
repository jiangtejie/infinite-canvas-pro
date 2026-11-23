import { create } from "zustand";

import type { FilmShotMediaFilter } from "../[id]/lib/film-shot-views";

export type FilmViewState = {
    tableSceneId: string;
    tableStatus: FilmShotMediaFilter;
    tableQuery: string;
    boardColumns: 4 | 9;
    selectedShotIds: Set<string>;
    expandedShotIds: Set<string>;
    panelWidth: number;
    stripOpen: boolean;
    openShotSections: Set<string>;
};

const EMPTY_FILM_VIEW_STATE: FilmViewState = {
    tableSceneId: "all",
    tableStatus: "all",
    tableQuery: "",
    boardColumns: 4,
    selectedShotIds: new Set(),
    expandedShotIds: new Set(),
    panelWidth: 320,
    stripOpen: true,
    openShotSections: new Set(["visual", "language", "context", "generation"]),
};

type FilmViewStore = {
    states: Record<string, FilmViewState>;
    update: (projectId: string, updater: (state: FilmViewState) => FilmViewState) => void;
};

export const useFilmViewStore = create<FilmViewStore>((set) => ({
    states: {},
    update: (projectId, updater) => set((store) => ({ states: { ...store.states, [projectId]: updater(store.states[projectId] ?? EMPTY_FILM_VIEW_STATE) } })),
}));

export function useFilmViewState(projectId: string) {
    return useFilmViewStore((state) => state.states[projectId] ?? EMPTY_FILM_VIEW_STATE);
}
