import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** 统一的错误文案提取：优先 Error.message，其次字符串，最后兜底文案。 */
export function errorMessage(error: unknown, fallback = "生成失败") {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error) return error;
    return fallback;
}

/** 截断过长文本并补省略号，用于图表/SVG 里的定长标签。 */
export function truncateText(value: string, max: number) {
    const text = (value || "").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
