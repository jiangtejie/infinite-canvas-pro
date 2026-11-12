"use client";

import { useState } from "react";
import { App } from "antd";

import type { FilmEpisode } from "@/lib/film/types";
import { requestFilmAiStoryboard, type FilmParseOptions } from "../utils/film-ai-parse";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";

export function useFilmAiParse(onParsed: (episodes: FilmEpisode[]) => void) {
    const { message } = App.useApp();
    const resolveModelConfig = useModelConfig();
    const [parsing, setParsing] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const parseWithAi = async (script: string, options: FilmParseOptions = {}) => {
        if (parsing) return;
        if (!script.trim()) {
            message.warning("先粘贴剧本内容");
            return;
        }
        const config = resolveModelConfig("text");
        if (!config) return;
        setParsing(true);
        setProgress(null);
        try {
            const episodes = await requestFilmAiStoryboard(config, script, options, (done, total) => setProgress({ done, total }));
            const total = episodes.reduce((sum, episode) => sum + episode.scenes.reduce((sceneSum, scene) => sceneSum + scene.shots.length, 0), 0);
            onParsed(episodes);
            message.success(`AI 拆出 ${total} 个分镜`);
        } catch (error) {
            message.error(errorMessage(error, "AI 解析失败"));
        } finally {
            setParsing(false);
            setProgress(null);
        }
    };

    return { parsing, progress, parseWithAi };
}
