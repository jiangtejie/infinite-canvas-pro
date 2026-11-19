"use client";

import { App } from "antd";

import { useConfirm } from "@/components/ui/confirm-dialog";
import type { FilmAsset, FilmAssetKind, FilmProject } from "@/lib/film/types";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
import { useFilmStore } from "@/stores/use-film-store";
import { FILM_ASSET_KIND_LABELS } from "@/lib/film/film-asset-kinds";
import { applyFilmLibraryEntry, filmLibraryEntryIsNewer, filmLibraryUsage, findFilmLibraryEntry } from "../utils/film-library";
import { filmAssetsOfKind } from "../utils/film-edits";
import { latestFilmAsset, latestFilmAssetPatch, latestFilmAssets } from "../utils/film-live-project";

const LIST_KEYS = {
    character: "characters",
    location: "locations",
    prop: "props",
    costume: "costumes",
    style: "styles",
} as const;

type FilmLibraryPatch = Partial<Omit<FilmProject, "id" | "createdAt">>;

function projectPatch(kind: FilmAssetKind, assets: FilmAsset[]): FilmLibraryPatch {
    if (kind === "character") return { characters: assets };
    if (kind === "location") return { locations: assets };
    if (kind === "prop") return { props: assets };
    if (kind === "costume") return { costumes: assets };
    return { style: assets[0] };
}

/** 工作台与母版库的存取闭环：按钮语义、使用统计、从库更新与库有更新判断。 */
export function useFilmAssetLibrary(projectId: string, kind: FilmAssetKind, assets: FilmAsset[], onUpdate: (patch: FilmLibraryPatch) => void) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const library = useFilmCastStore((state) => state[LIST_KEYS[kind]]);
    const saveAsset = useFilmCastStore((state) => state.saveAsset);
    const label = FILM_ASSET_KIND_LABELS[kind];

    const entryFor = (asset: FilmAsset) => findFilmLibraryEntry(library, asset);
    const isOutdated = (asset: FilmAsset) => filmLibraryEntryIsNewer(entryFor(asset), asset);

    const save = async (asset: FilmAsset) => {
        const source = latestFilmAsset(projectId, kind, asset.id)?.asset || asset;
        const entry = entryFor(source);
        if (entry) {
            const usage = filmLibraryUsage(useFilmStore.getState().projects || [], entry.id, kind);
            const confirmed = await confirm({
                title: `更新${label}库中的「${entry.name}」？`,
                description: `会用当前项目副本覆盖库条目。该条目已在 ${usage.projects} 个项目中使用、${usage.bindings} 处镜头 / 造型引用。`,
                confirmText: `更新${label}库`,
            });
            if (!confirmed) return;
        }
        const mode = saveAsset(kind, source);
        // 刚推送的副本与库内容一致，刷新副本时间戳避免立即提示「库有更新」。
        const patch = latestFilmAssetPatch(projectId, kind, source.id, () => ({}));
        if (patch) onUpdate(patch);
        message.success(mode === "updated" ? `已更新${label}库` : `已存入${label}库`);
    };

    const pull = async (asset: FilmAsset) => {
        const found = latestFilmAsset(projectId, kind, asset.id);
        if (!found) return;
        const entry = findFilmLibraryEntry(library, found.asset);
        if (!entry) return;
        const confirmed = await confirm({
            title: `从库更新「${entry.name}」？`,
            description: "会覆盖项目副本的设定内容并保留副本 id；引用该资产的镜头会显示设定已变。",
            confirmText: "从库更新",
        });
        if (!confirmed) return;
        const latest = latestFilmAsset(projectId, kind, asset.id);
        if (!latest) return;
        onUpdate(projectPatch(kind, filmAssetsOfKind(latest.project, kind).map((item) => item.id === latest.asset.id ? applyFilmLibraryEntry(item, entry) : item)));
        message.success("已从库更新");
    };

    const importToProject = (entry: FilmAsset, onImported?: (assets: FilmAsset[]) => void) => {
        const now = new Date().toISOString();
        const next = { ...structuredClone(entry), id: crypto.randomUUID(), sourceLibraryAssetId: entry.id, createdAt: now, updatedAt: now };
        const current = latestFilmAssets(projectId, kind)?.assets || assets;
        const all = kind === "style" ? [next] : [...current, next];
        onUpdate(projectPatch(kind, all));
        onImported?.(all);
        message.success(`已导入当前项目`);
    };

    return { library, entryFor, isOutdated, save, pull, importToProject, label };
}
