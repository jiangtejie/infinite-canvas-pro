import { normalizeLocalChannels, type AiConfig } from "@/stores/use-config-store";

/**
 * 生图 / 视频历史共用的纯工具层。
 * 只放语义完全一致的实现：dedupe / rank / identity keys / backend task 合并等
 * 依赖媒体字段与停止态规则的逻辑仍保留在各自 history.ts，不要为减少行数强行合并。
 */

export type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

export type WorkflowPollContext = { token: string; signal: AbortSignal };

/** 历史记录存储的最小接口（localforage 实例即可传入）。 */
export type LocalLogStore = {
    iterate<T, U>(callback: (value: T) => U): Promise<U>;
};

/** 统一的错误文案提取（实现与默认兜底见 lib/utils）。 */
export { errorMessage } from "@/lib/utils";

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

/** 按自定义匹配条件局部更新结果数组，keep 用于保留不允许被覆盖的条目（如停止态）。 */
export function updateResultsByMatch<T>(results: T[], match: (item: T) => boolean, next: Partial<T>, keep?: (item: T, patch: Partial<T>) => boolean) {
    return results.map((item) => (match(item) && !(keep && keep(item, next)) ? { ...item, ...next } : item));
}

/** 各媒体请求错误类型不同，包装出统一的 errorDetail。 */
export function createErrorDetail(isRequestError: (value: unknown) => boolean) {
    return (error: unknown) => errorDetailWith(error, isRequestError);
}

/** 未完成且未失败的任务可继续恢复。 */
export function isRecoverableTask<T>(task: T, isCompleted: (task: T) => boolean, isFailed: (task: T) => boolean) {
    return !isCompleted(task) && !isFailed(task);
}

const COMPLETED_TASK_STATUSES = ["completed", "complete", "done", "succeeded", "success"];
const FAILED_TASK_STATUSES = ["failed", "fail", "error", "cancelled", "canceled"];

/** 任务完成状态判定（生图 / 视频共用同一套状态）。 */
export function isCompletedTaskStatus(status?: string) {
    return COMPLETED_TASK_STATUSES.includes((status || "").toLowerCase());
}

/** 任务失败状态判定（生图 / 视频共用同一套状态）。 */
export function isFailedTaskStatus(status?: string) {
    return FAILED_TASK_STATUSES.includes((status || "").toLowerCase());
}

/** 历史身份键去重：去空白、去空值，保持首次出现顺序。 */
export function uniqueStrings(values: Array<string | undefined | null>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

/** 客户端本地任务 ID 判定，图片 / 视频仅前缀不同。 */
export function isClientTaskId(value: string | null | undefined, prefix: string) {
    return typeof value === "string" && value.startsWith(prefix);
}

/** 任务时间戳归一化：兼容秒 / 毫秒 / 日期字符串，msThreshold 用于区分秒与毫秒。 */
export function parseTaskTimestampValue(value: unknown, msThreshold = 1e12) {
    if (typeof value === "number") return value > msThreshold ? value : value * 1000;
    if (typeof value === "string" && value.trim()) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric > msThreshold ? numeric : numeric * 1000;
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

/** 读取 localforage 历史存储：单条读取失败时返回空列表，由调用方决定兜底。 */
export async function readStoredValues<T>(store: LocalLogStore): Promise<T[]> {
    if (typeof window === "undefined") return [];
    try {
        const values: T[] = [];
        await store.iterate<T, void>((value) => {
            values.push(value);
        });
        return values;
    } catch {
        return [];
    }
}

/** 逐条 normalize：单条损坏只跳过该条，避免整页历史为空。 */
export async function normalizeLogsSafely<T>(logs: T[], normalize: (log: T) => Promise<T>) {
    const normalized = await Promise.all(
        logs.map(async (log) => {
            try {
                return await normalize(log);
            } catch {
                return null;
            }
        }),
    );
    const result: T[] = [];
    normalized.forEach((log) => {
        if (log) result.push(log);
    });
    return result;
}

/** 历史列表统一按创建时间倒序。 */
export function sortByNewest<T extends { createdAt?: number }>(items: T[]) {
    return [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** 历史记录时间展示格式。 */
export function formatLogTime(value: number) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

/** 任务所属渠道 ID。 */
export function taskChannelId(task?: { userChannelId?: string; channelId?: string } | null) {
    return task?.userChannelId || task?.channelId || "";
}

/** 渠道解析：优先使用历史 / 任务记录的渠道，其次找第一个包含该模型的渠道。 */
export function resolveChannelId(config: AiConfig, model: string, ...preferredIds: Array<string | undefined>) {
    const channels = config.channelMode === "remote"
        ? config.publicChannels.map((channel) => ({ id: channel.id || "", models: channel.models || [] }))
        : normalizeLocalChannels(config).map((channel) => ({ id: channel.id, models: channel.models }));
    for (const id of preferredIds) {
        const channelId = (id || "").trim();
        if (channelId && channels.some((channel) => channel.id === channelId && channel.models.includes(model))) return channelId;
    }
    return channels.find((channel) => channel.models.includes(model))?.id || "";
}

/** 远端 + 本地历史合并：保留未同步的本地记录后按媒体自身规则去重。 */
export function mergeNormalizedLogs<T>(normalizedRemote: T[], normalizedLocal: T[], keysOf: (log: T) => string[], shouldPreserve: (log: T, remoteKeys: Set<string>) => boolean, mergeLogs: (logs: T[]) => T[]) {
    const remoteKeys = new Set(normalizedRemote.flatMap(keysOf));
    const preservedLocal = normalizedLocal.filter((log) => shouldPreserve(log, remoteKeys));
    return mergeLogs([...normalizedRemote, ...preservedLocal]);
}
