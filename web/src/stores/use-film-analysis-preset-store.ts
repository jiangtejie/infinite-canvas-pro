import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { accountLocalStorage } from "@/lib/account-storage";
import type { FilmAnalysisOptions } from "@/app/(user)/canvas/types";

export type FilmAnalysisPreset = { id: string; name: string; options: FilmAnalysisOptions };

export const DEFAULT_FILM_ANALYSIS_OPTIONS: FilmAnalysisOptions = {
    pacing: "normal",
    shotDensity: "normal",
    extractAssets: true,
};

type FilmAnalysisPresetStore = {
    presets: FilmAnalysisPreset[];
    defaultPresetId: string | null;
    options: FilmAnalysisOptions;
    setOptions: (patch: Partial<FilmAnalysisOptions>) => void;
    replaceOptions: (options: FilmAnalysisOptions) => void;
    selectPreset: (id: string | null) => void;
    savePreset: (name: string) => FilmAnalysisPreset;
    setDefaultPreset: (id: string) => void;
    removePreset: (id: string) => void;
};

export const FILM_ANALYSIS_PRESET_KEY = "infinite-canvas:film_analysis_presets";

/** 分析预设保存在账号分区本地存储，与 AI 配置同一层级，不新增后端表。 */
export const useFilmAnalysisPresetStore = create<FilmAnalysisPresetStore>()(
    persist(
        (set, get) => ({
            presets: [],
            defaultPresetId: null,
            options: DEFAULT_FILM_ANALYSIS_OPTIONS,
            setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
            replaceOptions: (options) => set({ options: { ...DEFAULT_FILM_ANALYSIS_OPTIONS, ...options } }),
            selectPreset: (id) => {
                if (!id) return;
                const preset = get().presets.find((item) => item.id === id);
                if (preset) set({ options: { ...DEFAULT_FILM_ANALYSIS_OPTIONS, ...preset.options } });
            },
            savePreset: (name) => {
                const preset: FilmAnalysisPreset = { id: nanoid(), name: name.trim() || `预设 ${get().presets.length + 1}`, options: { ...get().options } };
                set((state) => ({ presets: [...state.presets, preset] }));
                return preset;
            },
            setDefaultPreset: (id) => {
                const preset = get().presets.find((item) => item.id === id);
                set({ defaultPresetId: preset ? preset.id : null, ...(preset ? { options: { ...DEFAULT_FILM_ANALYSIS_OPTIONS, ...preset.options } } : {}) });
            },
            removePreset: (id) => set((state) => ({
                presets: state.presets.filter((item) => item.id !== id),
                defaultPresetId: state.defaultPresetId === id ? null : state.defaultPresetId,
            })),
        }),
        {
            name: FILM_ANALYSIS_PRESET_KEY,
            storage: createJSONStorage(() => accountLocalStorage),
            partialize: (state) => ({ presets: state.presets, defaultPresetId: state.defaultPresetId, options: state.options }),
        },
    ),
);
