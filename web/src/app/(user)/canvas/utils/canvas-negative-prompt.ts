const BASE_NEGATIVE = ["blurry", "low quality", "watermark"];
const MAX_NEGATIVE_ITEMS = 12;

type NegativeRule = {
    keywords: RegExp;
    negative: string[];
};

const NEGATIVE_RULES: NegativeRule[] = [
    {
        keywords: /portrait|character|person|people|face|人像|人物|角色|少年|少女|女孩|男孩|女子|男子|面部/i,
        negative: ["extra fingers", "bad hands", "distorted face", "asymmetric eyes"],
    },
    {
        keywords: /anime|manga|illustration|cartoon|comic|动漫|二次元|漫画|插画|卡通/i,
        negative: ["photorealistic", "3d render", "photo texture"],
    },
    {
        keywords: /architecture|building|interior|street|city|建筑|室内|街景|城市|楼宇|房间/i,
        negative: ["distorted perspective", "tilted horizon", "warped lines"],
    },
    {
        keywords: /product|packaging|bottle|cosmetic|商品|产品|包装|瓶|化妆品/i,
        negative: ["clutter", "reflections", "label errors"],
    },
    {
        keywords: /panorama|equirectangular|360|全景|等距柱状|球面/i,
        negative: ["seams", "fisheye", "borders"],
    },
];

/** 根据正向提示词推断一组规则负面词：通用质量基线 + 命中场景的补充项。 */
export function inferNegativePrompt(prompt: string): string {
    const text = (prompt || "").trim();
    if (!text) return "";
    const mentionsText = /(^|[^a-z])text([^a-z]|$)|文字|标题|标语|字幕|字体|手写|海报|poster/i.test(text);
    const terms = [...BASE_NEGATIVE, ...(mentionsText ? ["garbled text", "extra letters"] : ["text"])];
    for (const rule of NEGATIVE_RULES) {
        if (rule.keywords.test(text)) terms.push(...rule.negative);
    }
    return dedupeTerms(terms.filter((term) => !mentionsTerm(text, term))).slice(0, MAX_NEGATIVE_ITEMS).join(", ");
}

/** 合并多段负面词，按逗号/分号/顿号/换行拆分，忽略大小写去重并限制条数。 */
export function mergeNegativePrompts(...values: Array<string | null | undefined>): string {
    const items: string[] = [];
    for (const value of values) {
        for (const part of (value || "").split(/[,，;；、\n]/)) {
            const item = part.trim();
            if (item) items.push(item);
        }
    }
    return dedupeTerms(items).slice(0, MAX_NEGATIVE_ITEMS).join(", ");
}

/** 生成图片时实际使用的负面词：默认开启规则推断，与用户手填内容合并。 */
export function resolveImageNegativePrompt(prompt: string, userNegative?: string | null, autoInfer = true): string {
    return mergeNegativePrompts(userNegative, autoInfer ? inferNegativePrompt(prompt) : "");
}

function dedupeTerms(terms: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const term of terms) {
        const key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(term);
    }
    return result;
}

function mentionsTerm(prompt: string, term: string): boolean {
    const lower = prompt.toLowerCase();
    const needle = term.toLowerCase();
    if (/^[a-z0-9 ]+$/.test(needle)) {
        return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(lower);
    }
    return lower.includes(needle);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
