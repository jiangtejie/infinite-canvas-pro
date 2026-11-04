"use client";

import { useState } from "react";
import { App } from "antd";

import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { FilmEpisode } from "../types";
import { requestFilmAiStoryboard, type FilmParseOptions } from "../utils/film-ai-parse";

export function useFilmAiParse(onParsed: (episodes: FilmEpisode[]) => void) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [parsing, setParsing] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const parseWithAi = async (script: string, options: FilmParseOptions = {}) => {
        if (parsing) return;
        if (!script.trim()) {
            message.warning("先粘贴剧本内容");
            return;
        }
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.textModel, "text");
        const config = { ...effectiveConfig, model } as AiConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return;
        }
        setParsing(true);
        setProgress(null);
        try {
            const episodes = await requestFilmAiStoryboard(config, script, options, (done, total) => setProgress({ done, total }));
            const total = episodes.reduce((sum, episode) => sum + episode.scenes.reduce((sceneSum, scene) => sceneSum + scene.shots.length, 0), 0);
            onParsed(episodes);
            message.success(`AI 拆出 ${total} 个分镜`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 解析失败");
        } finally {
            setParsing(false);
            setProgress(null);
        }
    };

    return { parsing, progress, parseWithAi };
}
