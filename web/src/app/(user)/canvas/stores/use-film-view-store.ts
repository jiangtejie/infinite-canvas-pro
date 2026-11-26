import { create } from "zustand";

import type { FilmShotMediaFilter } from "../[id]/lib/film-shot-views";

export type FilmTableColumn = "dialogue" | "characters" | "props" | "location" | "imageNotes" | "soundNotes" | "transition";

export type FilmViewState = {
    tableSceneId: string;
    tableStatus: FilmShotMediaFilter;
    tableQuery: string;
    /** 镜头表在核心 8 列之外额外显示的列。 */
    tableExtraColumns: FilmTableColumn[];
    boardColumns: 4 | 9;
    selectedShotIds: Set<string>;
    expandedShotId: string | null;
    panelWidth: number;
    stripOpen: boolean;
    openShotSections: Set<string>;
};

const EMPTY_FILM_VIEW_STATE: FilmViewState = {
    tableSceneId: "all",
    tableStatus: "all",
    tableQuery: "",
    tableExtraColumns: [],
    boardColumns: 4,
    selectedShotIds: new Set(),
    expandedShotId: null,
    panelWidth: 420,
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
