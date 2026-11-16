"use client";

import { useMemo } from "react";

import { resolveModelForCapability, useEffectiveConfig } from "@/stores/use-config-store";
import type { FilmGenerationContext, FilmMediaVersion, FilmProject, FilmShot } from "@/lib/film/types";
import { buildFilmShotGenerationContext, FILM_IMAGE_REFERENCE_LIMIT, resolveFilmMediaContextState, type FilmMediaContextState } from "../utils/film-shot-generation";
import { filmVideoReferenceLimit } from "../utils/film-video-limits";
import { previousFilmShot } from "../utils/film-continuity-sheet";
import { flattenFilmShots } from "../utils/parse-script";

/** 按当前项目状态重算镜头生成上下文，并为每个媒体版本派生当前性（旧版本按自身上下文判断）。 */
export function useFilmShotGeneration(project: FilmProject, shot: FilmShot, medium: "image" | "video") {
    const effectiveConfig = useEffectiveConfig();
    return useMemo(() => {
        const flat = flattenFilmShots(project.episodes || []);
        const videoMode = shot.videoMode === "frames" ? "frames" : "reference";
        const model = resolveModelForCapability(effectiveConfig, effectiveConfig.videoModel, "video") || effectiveConfig.videoModel;
        const maxReferences = medium === "image" ? FILM_IMAGE_REFERENCE_LIMIT : filmVideoReferenceLimit(model);
        const compile = (previousShot?: FilmShot, anchorShot?: FilmShot): FilmGenerationContext | null => {
            try {
                return buildFilmShotGenerationContext(project, shot, {
                    medium,
                    maxReferences,
                    previousShot,
                    anchorShot,
                    videoMode: medium === "video" ? videoMode : undefined,
                    includeStoryboard: medium === "video" && videoMode === "reference",
                });
            } catch {
                return null;
            }
        };
        const wantsPrevious = medium === "image" || videoMode === "reference";
        const context = compile(wantsPrevious ? previousFilmShot(project.episodes || [], shot.id) : undefined);
        const stateForVersion = (version: FilmMediaVersion): FilmMediaContextState => {
            const stored = version.generationContext;
            if (!stored) return "unrecorded";
            const current = compile(
                stored.previousShotId ? flat.find((item) => item.id === stored.previousShotId) : undefined,
                stored.anchorShotId ? flat.find((item) => item.id === stored.anchorShotId) : undefined,
            );
            return current ? resolveFilmMediaContextState(version, current.inputSignature) : "stale";
        };
        return { context, stateForVersion };
    }, [project, shot, medium, effectiveConfig]);
}