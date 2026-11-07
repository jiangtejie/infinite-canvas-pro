import { isSeedanceVideoModel } from "@/lib/seedance-video";
import { normalizeFilmAspect } from "@/lib/film/film-aspects";

export type FilmVideoLimits = {
    isSeedance: boolean;
    min: number;
    max: number;
    label: string;
};

export function filmVideoLimits(videoModel: string): FilmVideoLimits {
    if (!isSeedanceVideoModel(videoModel || "")) {
        return { isSeedance: false, min: 1, max: 30, label: "" };
    }
    const key = (videoModel || "").toLowerCase();
    const isSeedance25 = /seedance[-_ ]?2[._-]?5|sd2[-_]?5/.test(key);
    return {
        isSeedance: true,
        min: 4,
        max: isSeedance25 ? 30 : 15,
        label: isSeedance25 ? "Seedance 2.5" : "Seedance 2.0",
    };
}

export function clampFilmVideoDuration(duration: number, videoModel: string) {
    const limits = filmVideoLimits(videoModel);
    return Math.min(limits.max, Math.max(limits.min, Math.round(duration)));
}

/** Seedance 不支持 2.39:1，映射到它支持的 21:9。 */
export function filmVideoAspect(aspect: string, videoModel: string) {
    const normalized = normalizeFilmAspect(aspect);
    if (isSeedanceVideoModel(videoModel || "") && normalized === "2.39:1") return "21:9";
    return normalized;
}

export function filmVideoReferenceLimit(videoModel: string) {
    return isSeedanceVideoModel(videoModel || "") ? 10 : 8;
}

/** 粗略估算：单条视频按 1.5 分钟计（含排队与轮询），用于批量生成前的确认提示。 */
export function estimateFilmVideoMinutes(count: number) {
    return Math.max(1, Math.ceil(count * 1.5));
}
