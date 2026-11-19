"use client";

import type { FilmAsset, FilmAssetKind, FilmProject, FilmShot } from "@/lib/film/types";
import { useFilmStore } from "@/stores/use-film-store";
import { filmAssetsOfKind, patchFilmAssetProject, updateFilmShot } from "./film-edits";
import { flattenFilmShots } from "./parse-script";

/** 读取 store 中的最新项目，避免异步任务用渲染期快照覆盖并发写入。 */
export function latestFilmProject(projectId?: string): FilmProject | undefined {
    if (!projectId) return undefined;
    return useFilmStore.getState().projects.find((project) => project.id === projectId);
}

export function latestFilmAssets(projectId: string | undefined, kind: FilmAssetKind): { project: FilmProject; assets: FilmAsset[] } | null {
    const project = latestFilmProject(projectId);
    return project ? { project, assets: filmAssetsOfKind(project, kind) } : null;
}

export function latestFilmAsset(projectId: string | undefined, kind: FilmAssetKind, assetId: string): { project: FilmProject; asset: FilmAsset } | null {
    const found = latestFilmAssets(projectId, kind);
    const asset = found?.assets.find((item) => item.id === assetId);
    return found && asset ? { project: found.project, asset } : null;
}

/** 基于最新资产内容生成单资产补丁，保留其他并发写入。 */
export function latestFilmAssetPatch(
    projectId: string | undefined,
    kind: FilmAssetKind,
    assetId: string,
    updater: (asset: FilmAsset, project: FilmProject) => Partial<FilmAsset>,
): Partial<FilmProject> | null {
    const found = latestFilmAsset(projectId, kind, assetId);
    if (!found) return null;
    return patchFilmAssetProject(found.project, kind, assetId, updater(found.asset, found.project));
}

/** 基于最新镜头内容生成单镜补丁，避免批量生成回写覆盖其他镜头的并发编辑。 */
export function latestFilmShotPatch(
    projectId: string | undefined,
    shotId: string,
    updater: (shot: FilmShot, project: FilmProject) => Partial<FilmShot>,
): Partial<FilmProject> | null {
    const project = latestFilmProject(projectId);
    const shot = project ? flattenFilmShots(project.episodes).find((item) => item.id === shotId) : undefined;
    if (!project || !shot) return null;
    return { episodes: updateFilmShot(project.episodes, shotId, updater(shot, project)) };
}
