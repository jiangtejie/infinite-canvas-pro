export type ParsedModelTestResult = {
    text: string;
    images: string[];
};

/** 模型测试返回可能是带 data URI 的 Markdown 图片，这里拆出图片并清掉内联 base64。 */
export function parseModelTestResult(raw: string): ParsedModelTestResult {
    const images: string[] = [];
    let text = String(raw || "");
    const addImage = (source: string) => {
        if (source && !images.includes(source)) images.push(source);
    };
    text = text.replace(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)\s]+)\)/g, (_match, source: string) => {
        addImage(source);
        return " [图片] ";
    });
    text = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, (source: string) => {
        addImage(source);
        return " [图片] ";
    });
    return { text: text.replace(/\n{3,}/g, "\n\n").trim(), images };
}

export function modelTestSummary(parsed: ParsedModelTestResult) {
    const compact = parsed.text.replace(/\[图片\]/g, " ").replace(/\s+/g, " ").trim();
    if (compact) return compact.slice(0, 100);
    return parsed.images.length ? "返回图片内容" : "ok";
}
