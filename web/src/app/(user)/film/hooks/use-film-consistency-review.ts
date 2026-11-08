"use client";

import { useState } from "react";
import { App } from "antd";

import type { FilmConsistencyReview, FilmProject } from "@/lib/film/types";
import { requestFilmConsistencyReview } from "../utils/film-ai-consistency";
import { useModelConfig } from "@/hooks/use-model-config";

/** 一致性代理：检查结构覆盖、连续性、风格漂移与绑定，把结论存回项目。 */
export function useFilmConsistencyReview(onReviewed: (review: FilmConsistencyReview) => void) {
    const { message } = App.useApp();
    const resolveModelConfig = useModelConfig();
    const [reviewing, setReviewing] = useState(false);

    const review = async (project: FilmProject) => {
        if (reviewing) return;
        const config = resolveModelConfig("text");
        if (!config) return;
        setReviewing(true);
        try {
            const result = await requestFilmConsistencyReview(config, project);
            onReviewed(result);
            message.success(result.issues.length ? "一致性检查完成：" + result.issues.length + " 条问题" : "一致性检查通过");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "一致性检查失败");
        } finally {
            setReviewing(false);
        }
    };

    return { reviewing, review };
}
