"use client";

import { useState } from "react";
import { App } from "antd";

import type { FilmScriptAnalysis } from "@/lib/film/types";
import { requestFilmScriptAnalysis, type FilmScriptAnalysisIssue } from "../utils/film-script-analysis";
import type { FilmScriptDocument } from "@/lib/film/film-script-import";
import { useModelConfig } from "@/hooks/use-model-config";
import { errorMessage } from "@/lib/utils";

export function useFilmScriptAnalysis() {
    const { message } = App.useApp();
    const resolveModelConfig = useModelConfig();
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const analyzeDocument = async (document: FilmScriptDocument, previousAnalysis?: FilmScriptAnalysis | null): Promise<{ analysis: FilmScriptAnalysis; issues: FilmScriptAnalysisIssue[]; reusedScenes: number } | null> => {
        if (analyzing) return null;
        const config = resolveModelConfig("text");
        if (!config) return null;
        setAnalyzing(true);
        try {
            const result = await requestFilmScriptAnalysis(config, document, (done, total) => setProgress({ done, total }), previousAnalysis);
            message.success(`AI 语义分析完成：${result.analysis.characters.length} 个角色、${result.analysis.relationships.length} 条关系${result.reusedScenes ? `（复用 ${result.reusedScenes} 场未变化内容）` : ""}`);
            return result;
        } catch (error) {
            message.error(errorMessage(error, "AI 语义分析失败"));
            return null;
        } finally {
            setAnalyzing(false);
            setProgress(null);
        }
    };

    return { analyzing, progress, analyzeDocument };
}
