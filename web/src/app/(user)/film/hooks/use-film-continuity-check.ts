"use client";

import { useState } from "react";
import { App } from "antd";

import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { FilmShot } from "../types";
import { formatFilmContinuityValidation, requestFilmShotContinuityCheck } from "../utils/film-continuity-check";

export function useFilmContinuityCheck() {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [checkingShotId, setCheckingShotId] = useState("");
    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

    const buildConfig = () => {
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.textModel, "text");
        const config = { ...effectiveConfig, model } as AiConfig;
        if (!isAiConfigReady(config, model)) {
            openConfigDialog(true);
            return null;
        }
        return config;
    };

    const checkShot = async (shot: FilmShot): Promise<string | null> => {
        if (checkingShotId || batchProgress) return null;
        if (!shot.imageUrl && !shot.storageKey) {
            message.warning("先生成分镜图，再做场记校验");
            return null;
        }
        const config = buildConfig();
        if (!config) return null;
        setCheckingShotId(shot.id);
        try {
            const result = await requestFilmShotContinuityCheck(config, shot);
            const validation = formatFilmContinuityValidation(result);
            if (result.passed) message.success("场记校验通过");
            else message.warning(`场记校验发现问题：${result.issues.slice(0, 2).join("；") || result.summary}`);
            return validation;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "场记校验失败");
            return null;
        } finally {
            setCheckingShotId("");
        }
    };

    const checkShots = async (shots: FilmShot[]): Promise<Record<string, string> | null> => {
        if (checkingShotId || batchProgress) return null;
        const pending = shots.filter((shot) => shot.imageUrl || shot.storageKey);
        if (!pending.length) {
            message.warning("本集还没有可校验的分镜图");
            return null;
        }
        const config = buildConfig();
        if (!config) return null;
        setBatchProgress({ done: 0, total: pending.length });
        const results: Record<string, string> = {};
        let failed = 0;
        try {
            for (const [index, shot] of pending.entries()) {
                setCheckingShotId(shot.id);
                try {
                    const result = await requestFilmShotContinuityCheck(config, shot);
                    results[shot.id] = formatFilmContinuityValidation(result);
                } catch {
                    failed += 1;
                } finally {
                    setBatchProgress({ done: index + 1, total: pending.length });
                }
            }
        } finally {
            setCheckingShotId("");
            setBatchProgress(null);
        }
        const passed = Object.values(results).filter((value) => value.startsWith("通过")).length;
        message.success(`本集校验完成：通过 ${passed}/${pending.length}${failed ? `，失败 ${failed}` : ""}`);
        return results;
    };

    return { checkingShotId, batchProgress, checkShot, checkShots };
}
