/** 去掉模型常见的外层 Markdown 代码块，保留内部文本。 */
export function cleanAiJsonText(content: string) {
    return (content || "").trim().replace(/^```(?:[a-z]+)?\s*/i, "").replace(/\s*```$/, "").trim();
}

/** 从带解释文字的回复里截出第一段完整 JSON 对象/数组；找不到时返回 null。 */
export function extractAiJsonBlock(text: string, kind: "object" | "array") {
    const [open, close] = kind === "array" ? ["[", "]"] : ["{", "}"];
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
