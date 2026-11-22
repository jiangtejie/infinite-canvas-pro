import type { FilmAsset } from "@/lib/film/types";
import { ensureCharacterProfile } from "./film-character";

export type FilmReferenceBoardPurpose = "reference" | "presentation" | "both";
export type FilmReferenceBoardDensity = "simple" | "standard" | "dense";

export type FilmReferenceBoardInput = {
    name: string;
    aliases: string[];
    description: string;
    visualPrompt: string;
    states: Array<{ name: string; description: string; condition: string }>;
};

export type FilmReferenceBoardTemplate = {
    id: string;
    name: string;
    description: string;
    purpose: FilmReferenceBoardPurpose;
    aspect: string;
    size: string;
    density: FilmReferenceBoardDensity;
    requiresTextRendering: boolean;
    version: number;
    build: (input: FilmReferenceBoardInput) => { prompt: string; negativePrompt: string };
};

export type FilmReferenceBoardPromptResult = {
    template: FilmReferenceBoardTemplate;
    prompt: string;
    negativePrompt: string;
    size: string;
    aspect: string;
    density: FilmReferenceBoardDensity;
    requiresTextRendering: boolean;
    warnings: string[];
};

export const DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID = "standard-reference";

const NEGATIVE_BASE = "五官不一致、双眼不对称、脸型漂移、年龄变化、发型不一致、体型比例变化、多余手指、肢体畸形、水印、logo、画面撕裂";
const NEGATIVE_TEXT = "乱码、错别字、无法辨认的文字标签";

function inputFromAsset(asset: FilmAsset): FilmReferenceBoardInput {
    const profile = ensureCharacterProfile(asset);
    return {
        name: asset.name || "未命名角色",
        aliases: asset.aliases || [],
        description: asset.description || "",
        visualPrompt: asset.visualPrompt || "",
        states: profile.states
            .map((state) => ({ name: state.name, description: state.description, condition: state.condition }))
            .filter((state) => state.name || state.description || state.condition),
    };
}

function identityText(input: FilmReferenceBoardInput) {
    return [
        `角色：${input.name}${input.aliases.length ? `（别名：${input.aliases.join("、")}）` : ""}`,
        input.description && `设定：${input.description}`,
        input.visualPrompt && `外观：${input.visualPrompt}`,
    ].filter(Boolean).join("\n");
}

function stateText(input: FilmReferenceBoardInput) {
    if (!input.states.length) return "";
    return `造型状态：\n${input.states.map((state) => `- ${state.name}${state.description ? `：${state.description}` : ""}${state.condition ? `；身体状况：${state.condition}` : ""}`).join("\n")}`;
}

function consistencyText() {
    return "所有画面必须是同一角色，脸型、五官、年龄、发型、体型与服装完全一致；真实皮肤纹理，柔光棚拍，高清，构图干净。";
}

function standardReference(input: FilmReferenceBoardInput): { prompt: string; negativePrompt: string } {
    return {
        prompt: [
            "竖版角色参考板，米白或浅灰纯色背景，无文字标签、无分镜格、无拼贴说明。",
            "版式：上部为大幅面部近景，中性表情，面部占画面约 40%；中部为正面全身、侧面全身、背面全身三视图并排，人物比例一致；下部为服装、发型、关键道具和材质细节小图。",
            identityText(input),
            stateText(input),
            consistencyText(),
        ].filter(Boolean).join("\n"),
        negativePrompt: `${NEGATIVE_BASE}、文字、标签、乱码`,
    };
}

function infographicCharacterSheet(input: FilmReferenceBoardInput): { prompt: string; negativePrompt: string } {
    return {
        prompt: [
            "16:9 真人写实角色资产信息图（infographic character sheet），米白底，中文标签清晰，排版整洁，无水印。",
            `标题「${input.name}」，${input.aliases.length ? `别名：${input.aliases.join("、")}；` : ""}${input.description || "人物资料卡"}。`,
            "版式：左侧竖排角色名大字、性别年龄身份简介、半身肖像和配色方案色卡；中间上方为正面、侧面、背面全身三视图并排；右侧依次为脸部特征（眼睛、鼻、唇、侧脸特写）、服装特征与面料样本、细节展示；下方为两排表情系列。",
            identityText(input),
            stateText(input),
            consistencyText(),
        ].filter(Boolean).join("\n"),
        negativePrompt: `${NEGATIVE_BASE}、${NEGATIVE_TEXT}`,
    };
}

function cinematicPortrait(input: FilmReferenceBoardInput): { prompt: string; negativePrompt: string } {
    return {
        prompt: [
            "电影感单人大幅半身像，面部近景偏 45 度侧脸，真实皮肤纹理，柔光与轻微环境光，浅景深，克制高级的色彩。",
            "不出现文字、标签、分镜格或拼贴排版；画面只保留角色本身与简洁背景。",
            identityText(input),
            stateText(input),
            consistencyText(),
        ].filter(Boolean).join("\n"),
        negativePrompt: `${NEGATIVE_BASE}、文字、标签、拼贴、分镜格`,
    };
}

function costumeLookbook(input: FilmReferenceBoardInput): { prompt: string; negativePrompt: string } {
    return {
        prompt: [
            "竖版角色服装造型板，浅灰纯色背景，同一角色的多套造型并排展示。",
            "版式：每套造型为正面全身，保持相同身高比例；旁边放服装面料、腰带、配饰、鞋履和配色色卡细节；不出现文字标签或分镜格。",
            identityText(input),
            stateText(input) || "造型状态：默认服装；请补充不同造型后再生成。",
            consistencyText(),
        ].filter(Boolean).join("\n"),
        negativePrompt: `${NEGATIVE_BASE}、文字、标签、拼贴说明`,
    };
}

export const FILM_REFERENCE_BOARD_TEMPLATES: FilmReferenceBoardTemplate[] = [
    {
        id: DEFAULT_FILM_REFERENCE_BOARD_TEMPLATE_ID,
        name: "标准参考板",
        description: "大脸近景 + 三视图 + 少量细节，默认用于下游生成。",
        purpose: "reference",
        aspect: "2:3",
        size: "1024x1536",
        density: "standard",
        requiresTextRendering: false,
        version: 1,
        build: standardReference,
    },
    {
        id: "infographic-character-sheet",
        name: "全信息角色卡",
        description: "人物资料、三视图、脸部特征、表情、服装与细节的展示型信息图。",
        purpose: "presentation",
        aspect: "16:9",
        size: "1792x1024",
        density: "dense",
        requiresTextRendering: true,
        version: 1,
        build: infographicCharacterSheet,
    },
    {
        id: "cinematic-portrait",
        name: "电影感半身像",
        description: "单人大幅肖像，强调气质、光影和面部细节。",
        purpose: "reference",
        aspect: "2:3",
        size: "1024x1536",
        density: "simple",
        requiresTextRendering: false,
        version: 1,
        build: cinematicPortrait,
    },
    {
        id: "costume-lookbook",
        name: "服装造型板",
        description: "同一角色多套造型与面料细节，适合造型状态较多的角色。",
        purpose: "reference",
        aspect: "3:2",
        size: "1536x1024",
        density: "standard",
        requiresTextRendering: false,
        version: 1,
        build: costumeLookbook,
    },
];

export function filmReferenceBoardTemplate(id?: string): FilmReferenceBoardTemplate {
    return FILM_REFERENCE_BOARD_TEMPLATES.find((template) => template.id === id) || FILM_REFERENCE_BOARD_TEMPLATES[0];
}

export function buildFilmReferenceBoardPrompt(asset: FilmAsset, templateId?: string): FilmReferenceBoardPromptResult {
    const template = filmReferenceBoardTemplate(templateId);
    const input = inputFromAsset(asset);
    const built = template.build(input);
    const warnings: string[] = [];
    if (template.requiresTextRendering) warnings.push("该模板依赖模型的文字能力，建议先验证中文标签是否清晰。");
    if (!input.description && !input.visualPrompt) warnings.push("建议先填写设定描述与视觉提示，参考板会更稳定。");
    if (template.id === "costume-lookbook" && !input.states.length) warnings.push("还没有造型状态，服装造型板会缺少变化参考。");
    return {
        template,
        prompt: built.prompt,
        negativePrompt: built.negativePrompt,
        size: template.size,
        aspect: template.aspect,
        density: template.density,
        requiresTextRendering: template.requiresTextRendering,
        warnings,
    };
}
