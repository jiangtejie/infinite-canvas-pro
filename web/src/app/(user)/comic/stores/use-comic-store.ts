import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";

import { createDebouncedJSONStorage } from "@/lib/persisted-store";
import { COMIC_STORE_KEY } from "@/lib/storage-keys";
import type { ComicProject } from "../types";
import { createComicProject, normalizeComicProject, type LegacyComicProject } from "../utils/comic-project";

type CreateComicProjectInput = Parameters<typeof createComicProject>[0];

type ComicStore = {
    hydrated: boolean;
    projects: ComicProject[];
    markHydrated: () => void;
    createProject: (input: CreateComicProjectInput) => string;
    importProject: (project: ComicProject) => string;
    updateProject: (id: string, patch: Partial<Omit<ComicProject, "id" | "createdAt">>) => void;
    deleteProjects: (ids: string[]) => void;
};

const comicStorage = createDebouncedJSONStorage<ComicStore>();

export const useComicStore = create<ComicStore>()(
    persist(
        (set) => ({
            hydrated: false,
            projects: [],
            markHydrated: () => set({ hydrated: true }),
            createProject: (input) => {
                const project = createComicProject(input);
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            importProject: (project) => {
                const now = new Date().toISOString();
                const id = project.id || crypto.randomUUID();
                const next = normalizeComicProject({ ...project, id, createdAt: project.createdAt || now, updatedAt: now }, id);
                set((state) => ({ projects: [next, ...state.projects] }));
                return next.id;
            },
            updateProject: (id, patch) => set((state) => ({
                projects: state.projects.map((project) => project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project),
            })),
            deleteProjects: (ids) => set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) })),
        }),
        {
            name: COMIC_STORE_KEY,
            storage: comicStorage,
            version: 1,
            migrate: (persistedState, version) => {
                const state = persistedState as { projects?: LegacyComicProject[] } | undefined;
                if (!state || version >= 1) return persistedState as StorageValue<ComicStore>["state"];
                return {
                    ...state,
                    projects: (state.projects || []).map((project, index) => normalizeComicProject(project, project.id || `legacy:project:${index}`)),
                } as StorageValue<ComicStore>["state"];
            },
            partialize: (state) => ({ projects: state.projects }) as StorageValue<ComicStore>["state"],
            onRehydrateStorage: () => (state) => state?.markHydrated(),
        },
    ),
);
