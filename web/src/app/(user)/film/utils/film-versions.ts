import { nanoid } from "nanoid";

import type { FilmMediaVersion, FilmShot } from "../types";

export const MAX_MEDIA_VERSIONS = 6;

function appendVersion(versions: FilmMediaVersion[] | undefined, url: string, storageKey?: string): FilmMediaVersion[] {
    return [
        ...(versions || []),
        { id: nanoid(), url, storageKey: storageKey || "", createdAt: new Date().toISOString() },
    ].slice(-MAX_MEDIA_VERSIONS);
}

/** 生成成功后写入当前结果并保留历史版本，重新生成不再直接覆盖旧图。 */
export function withImageVersion(shot: FilmShot, imageUrl: string, storageKey?: string): Partial<FilmShot> {
    return {
        imageUrl,
        storageKey: storageKey || "",
        status: "image_ready",
        errorMessage: "",
        imageVersions: appendVersion(shot.imageVersions, imageUrl, storageKey),
    };
}

export function withVideoVersion(shot: FilmShot, videoUrl: string, storageKey?: string): Partial<FilmShot> {
    return {
        videoUrl,
        videoStorageKey: storageKey || "",
        status: "video_ready",
        errorMessage: "",
        videoVersions: appendVersion(shot.videoVersions, videoUrl, storageKey),
    };
}
