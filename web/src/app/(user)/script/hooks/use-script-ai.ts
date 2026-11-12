"use client";

import { useState } from "react";
import { App } from "antd";

import { useModelConfig } from "@/hooks/use-model-config";
import type { ScriptProject, ScriptScene } from "../types";
import { requestScriptRewrite, requestScriptSceneDiagnosis, type ScriptRewriteMode, type ScriptSceneDiagnosis } from "../utils/script-ai";
import { errorMessage } from "@/lib/utils";

export function useScriptAi() {
    const { message } = App.useApp();
    const resolveModelConfig = useModelConfig();
    const [diagnosing, setDiagnosing] = useState(false);
    const [rewriting, setRewriting] = useState(false);

    const diagnoseScene = async (project: ScriptProject, scene: ScriptScene): Promise<ScriptSceneDiagnosis | null> => {
        if (diagnosing) return null;
        const config = resolveModelConfig("text");
        if (!config) return null;
        setDiagnosing(true);
        try {
            return await requestScriptSceneDiagnosis(config, project, scene);
        } catch (error) {
            message.error(errorMessage(error, "AI 场景诊断失败"));
            return null;
        } finally {
            setDiagnosing(false);
        }
    };

    const rewriteScene = async (project: ScriptProject, scene: ScriptScene, mode: ScriptRewriteMode, instruction: string, selectedText: string): Promise<string | null> => {
        if (rewriting) return null;
        const config = resolveModelConfig("text");
        if (!config) return null;
        setRewriting(true);
        try {
            return await requestScriptRewrite(config, project, scene, { mode, instruction, selectedText });
        } catch (error) {
            message.error(errorMessage(error, "AI 改写失败"));
            return null;
        } finally {
            setRewriting(false);
        }
    };

    return { diagnosing, rewriting, diagnoseScene, rewriteScene };
}
