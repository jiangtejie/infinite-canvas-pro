import type { FilmAsset, FilmAssetKind } from "@/lib/film/types";

export type FilmAssetConceptKind = Exclude<FilmAssetKind, "character">;

export type FilmAssetConceptPrompt = {
    prompt: string;
    size: string;
    label: string;
};

const COMMON_TAIL = "真实电影美术，材质可信，高清；避免文字、水印、logo、畸形结构与多余人物。";

function identityText(asset: FilmAsset) {
    return [
        `名称：${asset.name || "未命名资产"}${asset.aliases.length ? `（别名：${asset.aliases.join("、")}）` : ""}`,
        asset.description && `设定：${asset.description}`,
        asset.visualPrompt && `外观：${asset.visualPrompt}`,
    ].filter(Boolean).join("\n");
}

function styleText(style?: FilmAsset) {
    if (!style) return "";
    const description = [style.name, style.visualPrompt || style.description].filter(Boolean).join("：");
    return description ? `视觉风格：${description}` : "";
}

export function buildFilmAssetConceptPrompt(kind: FilmAssetConceptKind, asset: FilmAsset, style?: FilmAsset): FilmAssetConceptPrompt {
    const identity = identityText(asset);
    const styleLine = styleText(style);
    if (kind === "location") {
        return {
            label: "场景概念图",
            size: "1536x1024",
            prompt: [
                `电影场景概念设计图：${asset.name || "未命名场景"}。`,
                "构图：广角建立镜头，无人物，空间结构、材质与光源可信，适合作为后续分镜的场景参考。",
                identity,
                styleLine,
                COMMON_TAIL,
            ].filter(Boolean).join("\n"),
        };
    }
    if (kind === "prop") {
        return {
            label: "道具概念图",
            size: "1024x1024",
            prompt: [
                `电影道具设定图：${asset.name || "未命名道具"}。`,
                "版式：浅灰纯色背景，产品级静物打光，同一画面展示正面、侧面与关键细节，无人物。",
                identity,
                styleLine,
                COMMON_TAIL,
            ].filter(Boolean).join("\n"),
        };
    }
    if (kind === "costume") {
        return {
            label: "服装概念图",
            size: "1024x1024",
            prompt: [
                `电影服装设定图：${asset.name || "未命名服装"}。`,
                "版式：人台或平铺展示正背面、面料、配饰与细节，浅灰纯色背景，不出现人物面孔。",
                identity,
                styleLine,
                COMMON_TAIL,
            ].filter(Boolean).join("\n"),
        };
    }
    return {
        label: "风格参考图",
        size: "1536x1024",
        prompt: [
            `电影视觉风格参考板：${asset.name || "视觉风格"}。`,
            "用抽象场景与材质样本表达色彩、光线、质感与构图，不出现具体人物、分镜格与文字。",
            identity,
            COMMON_TAIL,
        ].filter(Boolean).join("\n"),
    };
}
