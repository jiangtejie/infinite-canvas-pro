"use client";

import { useState } from "react";
import { App } from "antd";

import type { FilmContinuitySheet, FilmEpisode } from "../types";
import { requestFilmContinuity } from "../utils/film-continuity-sheet";
import { useModelConfig } from "@/hooks/use-model-config";

export function useFilmContinuity() {
    const { message } = App.useApp();
    const resolveModelConfig = useModelConfig();
    const [analyzingEpisodeId, setAnalyzingEpisodeId] = useState("");

    const analyzeEpisode = async (episode: FilmEpisode): Promise<FilmContinuitySheet[] | null> => {
        if (analyzingEpisodeId) return null;
        const config = resolveModelConfig("text");
        if (!config) return null;
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
