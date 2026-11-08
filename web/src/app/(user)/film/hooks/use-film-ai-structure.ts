"use client";

import { useState } from "react";
import { App } from "antd";

import type { FilmProject, FilmStructurePlan } from "@/lib/film/types";
import { requestFilmStructurePlan, requestFilmStructureScenePlan } from "../utils/film-ai-structure";
import { useModelConfig } from "@/hooks/use-model-config";

/** 结构代理：只生成场次计划（purpose/beats/coverage），不生成画面。 */
export function useFilmAiStructure(onGenerated: (plan: FilmStructurePlan) => void) {
    const { message } = App.useApp();
    const resolveModelConfig = useModelConfig();
    const [generating, setGenerating] = useState(false);
    const [regeneratingScene, setRegeneratingScene] = useState<number | null>(null);

    const generate = async (project: FilmProject) => {
        if (generating) return;
        const config = resolveModelConfig("text");
        if (!config) return;
        setGenerating(true);
        try {
            const plan = await requestFilmStructurePlan(config, project);
            onGenerated(plan);
            message.success("已生成 " + plan.scenes.length + " 场结构计划");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "结构计划生成失败");
        } finally {
            setGenerating(false);
        }
    };

    const regenerateScene = async (project: FilmProject, index: number) => {
        const plan = project.structurePlan;
        if (!plan || regeneratingScene !== null || generating) return;
        const config = resolveModelConfig("text");
        if (!config) return;
        setRegeneratingScene(index);
        try {
            const scene = await requestFilmStructureScenePlan(config, project, plan, index);
            onGenerated({
                ...plan,
                scenes: plan.scenes.map((item, itemIndex) => itemIndex === index ? scene : item),
                createdAt: new Date().toISOString(),
            });
            message.success("已重生成「" + scene.sceneName + "」");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "单场结构重生成失败");
        } finally {
            setRegeneratingScene(null);
        }
    };

    return { generating, regeneratingScene, generate, regenerateScene };
}
