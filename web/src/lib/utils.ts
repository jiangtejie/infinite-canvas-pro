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

/** 仅放行站内相对路径，拦截开放重定向。浏览器会忽略 URL 中的 Tab/换行/回车，并把
 * //host 或 /\host 解析为协议相对的跨站地址，因此先剥离控制字符，再拒绝 // 与 /\ 前缀。 */
export function safeInternalRedirect(value: string | null | undefined): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/";
    }
    return cleaned;
}

/** 截断过长文本并补省略号，用于图表/SVG 里的定长标签。 */
export function truncateText(value: string, max: number) {
    const text = (value || "").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
