import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { FilmAspect, FilmProject, FilmStylePresetId } from "../types";
import { DEFAULT_FILM_ASPECT } from "../utils/film-aspects";
import { DEFAULT_FILM_STYLE } from "../utils/film-styles";

export const FILM_STORE_KEY = "infinite-canvas:film_store";

type FilmStore = {
    hydrated: boolean;
    projects: FilmProject[];
    markHydrated: () => void;
    createProject: (title: string, visualStyle?: string, aspect?: FilmAspect, stylePreset?: FilmStylePresetId) => string;
    importProject: (project: FilmProject) => string;
    updateProject: (id: string, patch: Partial<Omit<FilmProject, "id" | "createdAt">>) => void;
    deleteProjects: (ids: string[]) => void;
};

export const useFilmStore = create<FilmStore>()(
    persist(
        (set) => ({
            hydrated: false,
            projects: [],
            markHydrated: () => set({ hydrated: true }),
            createProject: (title, visualStyle = "", aspect = DEFAULT_FILM_ASPECT, stylePreset = DEFAULT_FILM_STYLE) => {
                const id = nanoid();
                const now = new Date().toISOString();
                const project: FilmProject = {
                    id,
                    title: title.trim() || "未命名影视项目",
                    visualStyle: visualStyle.trim(),
                    aspect,
                    stylePreset,
                    stage: "script",
                    scriptText: "",
                    episodes: [],
                    characters: [],
                    locations: [],
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (project) => {
                const id = nanoid();
                const now = new Date().toISOString();
                const next: FilmProject = { ...project, id, createdAt: project.createdAt || now, updatedAt: now };
                set((state) => ({ projects: [next, ...state.projects] }));
                return id;
            },
            updateProject: (id, patch) => set((state) => ({
                projects: state.projects.map((project) => project.id === id
                    ? { ...project, ...patch, updatedAt: new Date().toISOString() }
                    : project),
            })),
            deleteProjects: (ids) => set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) })),
        }),
        {
            name: FILM_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ projects: state.projects }),
            onRehydrateStorage: () => (state) => {
                state?.markHydrated();
            },
        },
    ),
);
