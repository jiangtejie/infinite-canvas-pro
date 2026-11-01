/** 统一的错误文案提取。 */
export function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    return String(error || "生成失败");
}

/** 统一的失败详情提取，detail 字段由各渠道的请求错误类型决定。 */
export function errorDetailWith(error: unknown, isRequestError: (value: unknown) => boolean) {
    const detail = (error as { detail?: unknown } | null)?.detail;
    if (isRequestError(error) && typeof detail === "string" && detail) return detail;
    if (error instanceof Error) return error.stack || error.message;
    try {
        return JSON.stringify(error, null, 2);
    } catch {
        return String(error || "生成失败");
    }
}

/** 按 id 局部更新结果数组。 */
export function updateResult<T extends { id: string }>(results: T[], id: string, next: Partial<T>) {
    return results.map((item) => (item.id === id ? { ...item, ...next } : item));
}
