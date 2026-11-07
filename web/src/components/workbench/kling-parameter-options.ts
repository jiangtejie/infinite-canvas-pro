import { klingV26DurationOptions, klingV26ModeOptions, klingV26RatioLabels, klingV3DurationOptions, klingV3ModeOptions } from "@/services/api/protocols/kling-models";

/** Kling 模式（清晰度）选项：侧栏、底部与 Kling 工作台共用同一份文案。 */
export function klingModeItems(isV3: boolean) {
    return (isV3 ? klingV3ModeOptions : klingV26ModeOptions).map((item) => ({ value: item.value, label: item.title, caption: item.desc }));
}

/** 单行展示用的模式选项（底部选择器 / Kling 工作台按钮）。 */
export function klingModeOptions(isV3: boolean) {
    return klingModeItems(isV3).map((item) => ({ value: item.value, label: item.caption ? `${item.label} ${item.caption}` : item.label }));
}

/** Kling 画幅选项：侧栏、底部与 Kling 工作台统一为 16:9 / 9:16 / 1:1，caption 为对应像素。 */
export const klingRatioItems: Array<{ value: string; label: string; caption: string }> = [
    { value: "16:9", label: "16:9", caption: klingV26RatioLabels["16:9"] || "" },
    { value: "9:16", label: "9:16", caption: klingV26RatioLabels["9:16"] || "" },
    { value: "1:1", label: "1:1", caption: klingV26RatioLabels["1:1"] || "" },
];

export const klingRatioOptions: Array<{ value: string; label: string }> = klingRatioItems.map((item) => ({ value: item.value, label: item.label }));

export const klingV3SecondsRange = { min: klingV3DurationOptions[0], max: klingV3DurationOptions[1] };

/** Kling 时长选项：v3 为 3-15 秒可输入，v2.6 仅 5 / 10 秒。 */
export function klingSecondsOptions(isV3: boolean) {
    return (isV3 ? klingV3DurationOptions : klingV26DurationOptions).map((value) => ({ value: String(value), label: `${value}s` }));
}

/** v3 首次进入时把历史默认的 6 秒收敛为 3 秒，避免发送超出模型范围的值。 */
export function klingV3DefaultSeconds(value: string | undefined) {
    return String(value ?? "").trim() === "6" ? "3" : "";
}
