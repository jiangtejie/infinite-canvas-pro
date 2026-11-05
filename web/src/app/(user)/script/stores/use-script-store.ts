import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { ScriptProject } from "../types";
import { createScriptProject } from "../utils/script-project";

export const SCRIPT_STORE_KEY = "infinite-canvas:script_store";

type CreateScriptProjectInput = Parameters<typeof createScriptProject>[0];

type ScriptStore = {
    hydrated: boolean;
    projects: ScriptProject[];
    markHydrated: () => void;
    createProject: (input: CreateScriptProjectInput) => string;
    importProject: (project: ScriptProject) => string;
    updateProject: (id: string, patch: Partial<Omit<ScriptProject, "id" | "createdAt">>) => void;
    deleteProjects: (ids: string[]) => void;
};

export const useScriptStore = create<ScriptStore>()(
    persist(
        (set) => ({
            hydrated: false,
            projects: [],
            markHydrated: () => set({ hydrated: true }),
            createProject: (input) => {
                const project = createScriptProject(input);
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            importProject: (project) => {
                const now = new Date().toISOString();
                const next = { ...project, id: project.id, createdAt: project.createdAt || now, updatedAt: now };
                set((state) => ({ projects: [next, ...state.projects] }));
                return next.id;
            },
            updateProject: (id, patch) => set((state) => ({
                projects: state.projects.map((project) => project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project),
            })),
            deleteProjects: (ids) => set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) })),
        }),
        {
            name: SCRIPT_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ projects: state.projects }),
            onRehydrateStorage: () => (state) => {
                state?.markHydrated();
            },
        },
    ),
);
