"use client";

import { useState } from "react";
import { App } from "antd";

import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { FilmContinuitySheet, FilmEpisode } from "../types";
import { requestFilmContinuity } from "../utils/film-continuity-sheet";

export function useFilmContinuity() {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [analyzingEpisodeId, setAnalyzingEpisodeId] = useState("");

    const analyzeEpisode = async (episode: FilmEpisode): Promise<FilmContinuitySheet[] | null> => {
        if (analyzingEpisodeId) return null;
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.textModel, "text");
        const config = { ...effectiveConfig, model } as AiConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        setAnalyzingEpisodeId(episode.id);
        try {
            const sheets = await requestFilmContinuity(config, episode);
            message.success(`已生成 ${sheets.length} 份场记交接单`);
            return sheets;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 场记分析失败");
            return null;
        } finally {
            setAnalyzingEpisodeId("");
        }
    };

    return { analyzingEpisodeId, analyzeEpisode };
}
