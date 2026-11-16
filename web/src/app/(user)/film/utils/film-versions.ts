import { nanoid } from "nanoid";

import type { FilmGenerationContext, FilmMediaVersion, FilmShot } from "@/lib/film/types";

export const MAX_MEDIA_VERSIONS = 6;

function appendVersion(versions: FilmMediaVersion[] | undefined, url: string, storageKey?: string, generationContext?: FilmGenerationContext): FilmMediaVersion[] {
    return [
        ...(versions || []),
        { id: nanoid(), url, storageKey: storageKey || "", createdAt: new Date().toISOString(), generationContext },
    ].slice(-MAX_MEDIA_VERSIONS);
}

/** 生成成功后写入当前结果并保留历史版本，每个版本携带提交时的生成上下文快照。 */
export function withImageVersion(shot: FilmShot, imageUrl: string, storageKey?: string, generationContext?: FilmGenerationContext): Partial<FilmShot> {
    return {
        imageUrl,
        storageKey: storageKey || "",
        errorMessage: "",
        imageVersions: appendVersion(shot.imageVersions, imageUrl, storageKey, generationContext),
    };
}

export function withVideoVersion(shot: FilmShot, videoUrl: string, storageKey?: string, generationContext?: FilmGenerationContext): Partial<FilmShot> {
    return {
        videoUrl,
        videoStorageKey: storageKey || "",
        errorMessage: "",
        videoVersions: appendVersion(shot.videoVersions, videoUrl, storageKey, generationContext),
    };
}
