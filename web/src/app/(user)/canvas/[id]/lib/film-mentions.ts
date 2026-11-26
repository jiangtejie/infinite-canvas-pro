/** 提及匹配文本：保留词间空格，标点转空格，便于英文按词边界匹配。 */
export function normalizeFilmMentionText(value: string) {
    return (value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** 单字名不参与自动关联，避免「王」「李」这类名字误绑。 */
export function filmMentionTerms(name: string, aliases: string[] = []) {
    const normalizeTerm = (value: string) => {
        const term = normalizeFilmMentionText(value);
        return /^[a-z0-9 ]+$/.test(term) ? term : term.replace(/\s+/g, "");
    };
    return [...new Set([name, ...aliases].map(normalizeTerm).filter((term) => term.length >= 2))];
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 英文/数字按完整词匹配，中文按子串匹配；text 需先经过 normalizeFilmMentionText。 */
export function filmMentionIncludes(text: string, term: string) {
    if (!term || term.length < 2) return false;
    if (!/^[a-z0-9 ]+$/.test(term)) return text.includes(term);
    const pattern = term.split(/\s+/).map(escapeRegExp).join("\\s+");
    return new RegExp(`(^|\\s)${pattern}(?=\\s|$)`, "i").test(text);
}
