import { isSeedance25Model, isSeedanceVideoModel, normalizeSeedanceDuration } from "@/lib/seedance-video";
import { videoDurationOptionsForModel } from "@/lib/video-model-capabilities";

/** 通用时长：保留智能时长 -1，其余夹到 1-30 秒。 */
export function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(30, seconds)));
}

/** 模型时长：支持智能时长的模型保留 -1，其余模型回落到合法档位。 */
export function normalizeVideoSecondsForModel(model: string, value: string) {
    if (isSeedanceVideoModel(model)) return String(normalizeSeedanceDuration(value, isSeedance25Model(model) ? 30 : 15));
    const options = videoDurationOptionsForModel(model);
    if (options?.includes(-1) && String(value).trim() === "-1") return "-1";
    const seconds = Number(normalizeVideoSeconds(value));
    const safe = seconds === -1 ? 6 : seconds;
    return options ? closestAllowedSeconds(safe, options) : String(safe);
}

/** 配置层尺寸：auto 保持 auto，由请求层决定省略；比例转成对应像素尺寸。 */
export function normalizeVideoSize(value: string) {
    if (value === "auto") return "auto";
    if (/^\d+x\d+$/.test(value || "")) return value;
    return ["9:16", "2:3", "3:4"].includes(value) ? "720x1280" : "1280x720";
}

function closestAllowedSeconds(seconds: number, allowed: number[]) {
    return String(allowed.reduce((best, item) => Math.abs(item - seconds) < Math.abs(best - seconds) ? item : best, allowed[0]));
}
