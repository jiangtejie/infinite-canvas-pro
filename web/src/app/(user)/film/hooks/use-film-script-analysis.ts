"use client";

import { useState } from "react";
import { App } from "antd";

import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { FilmScriptAnalysis } from "../types";
import { requestFilmScriptAnalysis, type FilmScriptAnalysisIssue } from "../utils/film-script-analysis";
import type { FilmScriptDocument } from "../utils/film-script-import";

export function useFilmScriptAnalysis() {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const analyzeDocument = async (document: FilmScriptDocument): Promise<{ analysis: FilmScriptAnalysis; issues: FilmScriptAnalysisIssue[] } | null> => {
        if (analyzing) return null;
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.textModel, "text");
        const config = { ...effectiveConfig, model } as AiConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        setAnalyzing(true);
        try {
            const result = await requestFilmScriptAnalysis(config, document, (done, total) => setProgress({ done, total }));
            message.success(`AI 语义分析完成：${result.analysis.characters.length} 个角色、${result.analysis.relationships.length} 条关系`);
            return result;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 语义分析失败");
            return null;
        } finally {
            setAnalyzing(false);
            setProgress(null);
        }
    };

    return { analyzing, progress, analyzeDocument };
}
