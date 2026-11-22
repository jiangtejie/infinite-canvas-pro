import type { FilmMediaVersion } from "@/lib/film/types";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type FilmShotNodeData } from "../../types";
import { orderFilmShots } from "./film-layout";

export type FilmVersionKind = "image" | "video";

export type FilmVersionShot = {
    shotId: string;
    shotNo: string;
    title: string;
    kind: FilmVersionKind;
    versions: FilmMediaVersion[];
    currentVersionId: string | null;
};

export type FilmVersionSelection = { shotId: string; kind: FilmVersionKind; versionId: string };

/** 全片链顺序下的版本镜头投影；默认包含所有有版本的镜头。 */
export function selectFilmVersionShots(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    kind: FilmVersionKind,
    options: { minVersions?: number } = {},
): FilmVersionShot[] {
    const minVersions = options.minVersions ?? 1;
    return orderFilmShots(nodes.filter((node) => node.type === CanvasNodeType.Shot), connections).flatMap((node) => {
        const payload = node.metadata?.filmShot;
        if (!payload) return [];
        const versions = kind === "image" ? payload.imageVersions : payload.videoVersions;
        if (!versions?.length || versions.length < minVersions) return [];
        const currentUrl = kind === "image" ? payload.imageUrl : payload.videoUrl;
        const currentStorage = kind === "image" ? payload.storageKey : payload.videoStorageKey;
        const current = versions.find((version) => (currentUrl && version.url === currentUrl) || (currentStorage && version.storageKey === currentStorage)) ?? versions.at(-1);
        return [{
            shotId: node.id,
            shotNo: payload.shotNo || node.title || node.id,
            title: node.title || payload.shotNo || node.id,
            kind,
            versions,
            currentVersionId: current?.id ?? null,
        }];
    });
}

/** 默认左侧为当前版本，右侧为最新其他版本。 */
export function defaultFilmVersionPair(shot: FilmVersionShot): { leftId: string | null; rightId: string | null } {
    const leftId = shot.currentVersionId ?? shot.versions.at(-1)?.id ?? null;
    const rightId = [...shot.versions].reverse().find((version) => version.id !== leftId)?.id ?? leftId;
    return { leftId, rightId };
}

/** 只更新当前引用，保留全部历史版本。 */
export function applyFilmVersionSelections(nodes: CanvasNodeData[], selections: FilmVersionSelection[]): CanvasNodeData[] {
    const byShot = new Map<string, FilmVersionSelection[]>();
    selections.forEach((selection) => byShot.set(selection.shotId, [...(byShot.get(selection.shotId) || []), selection]));
    return nodes.map((node) => {
        const picks = byShot.get(node.id);
        const payload = node.metadata?.filmShot;
        if (!picks?.length || !payload) return node;
        let image: FilmMediaVersion | undefined;
        let video: FilmMediaVersion | undefined;
        for (const pick of picks) {
            const versions = pick.kind === "image" ? payload.imageVersions : payload.videoVersions;
            const version = versions?.find((item) => item.id === pick.versionId);
            if (!version) continue;
            if (pick.kind === "image") image = version;
            else video = version;
        }
        if (!image && !video) return node;
        const patch: Partial<FilmShotNodeData> = {};
        if (image) {
            patch.imageUrl = image.url;
            patch.storageKey = image.storageKey || "";
        }
        if (video) {
            patch.videoUrl = video.url;
            patch.videoStorageKey = video.storageKey || "";
        }
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: "success",
                errorDetails: undefined,
                filmShotTaskKind: undefined,
                filmShot: { ...payload, ...patch, errorMessage: "" },
            },
        };
    });
}

export function filmVersionSummary(version: FilmMediaVersion) {
    const context = version.generationContext;
    return {
        prompt: context?.prompt || "",
        compilerVersion: context?.compilerVersion || "",
        characters: context?.characters.length ?? 0,
        references: context?.references.length ?? 0,
        warnings: context?.warnings.length ?? 0,
        missing: context?.missingReferenceIds.length ?? 0,
    };
}
