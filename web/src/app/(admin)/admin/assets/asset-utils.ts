import type { AdminAsset } from "@/services/api/admin";

export type AssetFormValues = Partial<AdminAsset> & { tagText?: string };

export const assetTypeOptions = [
    { label: "全部类型", value: "" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export const assetEditTypeOptions = assetTypeOptions.slice(1);

export function assetTypeLabel(type: AdminAsset["type"]) {
    if (type === "image") return "图片";
    if (type === "video") return "视频";
    if (type === "audio") return "音频";
    return "文本";
}
