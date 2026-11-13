"use client";

import { accountScopedStore } from "@/lib/account-storage";
import { formatTaskTime } from "@/components/workbench/task-result";
import type { CanvasImageTask, SeedableImageConfig } from "@/services/api/image";
import { resolveImageUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { WorkflowRef } from "@/lib/workflow-channel";
import type { ReferenceImage } from "@/types/image";
import { parseWorkflowRef } from "@/lib/workflow-channel";
import { ImageRequestError } from "@/services/api/image";
import { deleteUnusedImagePreviews } from "@/services/image-storage";
import { nanoid } from "nanoid";

import { createErrorDetail, errorMessage, formatLogTime, isClientTaskId, isCompletedTaskStatus, isFailedTaskStatus, isRecoverableTask, mergeNormalizedLogs, normalizeLogsSafely, parseTaskTimestampValue, readStoredValues, resolveChannelId, sortByNewest, taskChannelId, uniqueStrings, updateResult, updateResultsByMatch } from "@/lib/generation-history";
export { errorMessage, uniqueStrings, updateResult };
export type { UpdateAiConfig, WorkflowPollContext } from "@/lib/generation-history";

export const errorDetail = createErrorDetail((value) => value instanceof ImageRequestError);

export type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

export type GenerationResult = {
    id: string;
    taskLogId?: string;
    status: "pending" | "stopping" | "success" | "failed" | "stopped";
    createdAt: number;
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    image?: GeneratedImage;
    error?: string;
    errorDetail?: string;
    durationMs?: number;
    workflowId?: string;
    workflowName?: string;
    workflowInputs?: Record<string, unknown>;
    workflowTaskId?: string;
    providerWorkflowRef?: WorkflowRef;
    task?: CanvasImageTask;
    progress?: number;
    lastPolledAt?: number;
};

export type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "生成中" | "停止中" | "已停止" | "成功" | "失败";
    images: GeneratedImage[];
    thumbnails: string[];
    errors: string[];
    errorDetails?: string[];
    categoryIds: string[];
    workflowId?: string;
    workflowName?: string;
    workflowInputs?: Record<string, unknown>;
    workflowTaskId?: string;
    providerWorkflowRef?: WorkflowRef;
    task?: CanvasImageTask;
    lastPolledAt?: number;
};

export type GenerationLogConfig = Pick<AiConfig, "channelMode" | "model" | "imageModel" | "activeChannelId" | "imageChannelId" | "quality" | "size" | "count" | "apiMode" | "streamImages" | "streamPartialImages" | "responseFormatB64Json" | "codexCli">;
export type RequestSnapshot = { text: string; requestConfig: SeedableImageConfig; displayConfig: GenerationLogConfig; references: ReferenceImage[]; workflowRef?: WorkflowRef };
export type GenerationCategory = { id: string; name: string; createdAt: number };
export type ResultViewMode = "all" | "category";
export const CATEGORY_STORE_KEY = "infinite-canvas:image_generation_categories";
export const logStore = accountScopedStore("image_generation_logs");
export const categoryStore = accountScopedStore("image_generation_categories");

export function createPendingResult(id: string, snapshot: RequestSnapshot): GenerationResult {
    return {
        id,
        status: "pending",
        createdAt: Date.now(),
        prompt: snapshot.text,
        model: snapshot.displayConfig.imageModel || snapshot.displayConfig.model,
        config: snapshot.displayConfig,
        references: snapshot.references,
    };
}

export function generationLogStorageKeys(log: GenerationLog) {
    return [...log.images.map((image) => image.storageKey), ...log.references.filter(isDisposableReferenceFile).map((image) => image.storageKey)].filter((key): key is string => Boolean(key));
}

export function referenceUsedByGeneration(reference: ReferenceImage, logs: GenerationLog[], results: GenerationResult[]) {
    if (!reference.storageKey) return false;
    return logs.some((log) => log.references.some((item) => item.storageKey === reference.storageKey)) || results.some((result) => result.references.some((item) => item.storageKey === reference.storageKey));
}

export function shouldDeleteReferenceFile(reference: ReferenceImage, logs: GenerationLog[], results: GenerationResult[]) {
    if (!reference.storageKey) return false;
    if (!isDisposableReferenceFile(reference)) return false;
    return !referenceUsedByGeneration(reference, logs, results);
}

export function isDisposableReferenceFile(reference: ReferenceImage) {
    const item = reference as ReferenceImage & { temporary?: boolean; source?: string };
    return item.temporary === true || item.source === "upload" || item.source === "clipboard";
}

export function disposableLogStorageKeys(deletedLogs: GenerationLog[], remainingLogs: GenerationLog[]) {
    const deletedKeys = new Set(deletedLogs.flatMap(generationLogStorageKeys));
    const retainedKeys = new Set(remainingLogs.flatMap(generationLogStorageKeys));
    return [...deletedKeys].filter((key) => !retainedKeys.has(key));
}

export function createWorkflowResultId(taskId: string, index: number) {
    return `${taskId}:${index}`;
}


export function updateResultByLogId(results: GenerationResult[], logId: string, next: Partial<GenerationResult>) {
    const keys = new Set(uniqueStrings([logId, ...imageTaskIdentityKeys(next.task)]));
    return updateResultsByMatch(results, (item) => imageResultIdentityKeys(item).some((key) => keys.has(key)), next);
}

export function mergePendingLogResults(results: GenerationResult[], logs: GenerationLog[]) {
    const updatedResults = results.map((result) => {
        const resultKeys = new Set(imageResultIdentityKeys(result));
        const log = logs.find((item) => imageLogIdentityKeys(item).some((key) => resultKeys.has(key)));
        return log ? { ...result, id: log.id, taskLogId: log.id, task: log.task, progress: log.task?.progress ?? result.progress, durationMs: log.durationMs || result.durationMs, lastPolledAt: log.lastPolledAt || result.lastPolledAt } : result;
    });
    const existingIds = new Set(updatedResults.flatMap(imageResultIdentityKeys));
    const pendingResults = logs.filter((log) => !imageLogIdentityKeys(log).some((key) => existingIds.has(key))).map((log) => createResultFromImageLog(log, "pending"));
    return sortByNewest(dedupeGenerationResults([...pendingResults, ...updatedResults]));
}

export function stringRecordValue(record: unknown, key: string) {
    if (!record || typeof record !== "object") return "";
    const value = (record as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
}

export function imageTaskSourceId(task?: CanvasImageTask) {
    return stringRecordValue(task, "source_id") || stringRecordValue(task, "sourceId");
}

export function imageTaskIdentityKeys(task?: CanvasImageTask) {
    return uniqueStrings([task?.id, imageTaskSourceId(task), stringRecordValue(task, "task_id"), stringRecordValue(task, "taskId"), stringRecordValue(task, "image_id"), stringRecordValue(task, "imageId"), stringRecordValue(task, "result_id"), stringRecordValue(task, "resultId")]);
}

export function imageLogIdentityKeys(log: GenerationLog) {
    const taskKeys = (log.task?.image_urls?.length || 0) > 1
        ? []
        : imageTaskIdentityKeys(log.task);
    return uniqueStrings([
        log.id,
        ...taskKeys,
        ...log.images.flatMap((image) => [image.id, image.storageKey]),
    ]);
}

export function imageResultIdentityKeys(result: GenerationResult) {
    return uniqueStrings([result.id, result.taskLogId, ...imageTaskIdentityKeys(result.task), result.image?.id, result.image?.storageKey]);
}

export function imageResultMatchesLog(result: GenerationResult, log: GenerationLog) {
    const keys = new Set(imageLogIdentityKeys(log));
    return imageResultIdentityKeys(result).some((key) => keys.has(key));
}

export function generationLogRank(log: GenerationLog) {
    return (log.status === "成功" ? 1000 : log.status === "失败" ? 700 : 0) + log.images.length * 100 + log.successCount * 20 + log.failCount * 10 + (log.task ? 5 : 0) + (imageTaskSourceId(log.task) === log.id ? 8 : 0);
}

export function preferGenerationLog(next: GenerationLog, current: GenerationLog) {
    const nextSourceId = imageTaskSourceId(next.task);
    const currentSourceId = imageTaskSourceId(current.task);
    if (current.id && nextSourceId === current.id) return false;
    if (next.id && currentSourceId === next.id) return true;
    const nextRank = generationLogRank(next);
    const currentRank = generationLogRank(current);
    if (nextRank !== currentRank) return nextRank > currentRank;
    return next.createdAt >= current.createdAt;
}

export function mergeLogIdentityData(primary: GenerationLog, duplicate: GenerationLog) {
    return {
        ...primary,
        task: primary.task || duplicate.task,
        lastPolledAt: primary.lastPolledAt || duplicate.lastPolledAt,
        images: primary.images.length ? primary.images : duplicate.images,
        thumbnails: primary.thumbnails.length ? primary.thumbnails : duplicate.thumbnails,
        successCount: primary.successCount || duplicate.successCount,
        imageCount: primary.imageCount || duplicate.imageCount,
        failCount: primary.failCount || duplicate.failCount,
        errors: primary.errors.length ? primary.errors : duplicate.errors,
        errorDetails: primary.errorDetails?.length ? primary.errorDetails : duplicate.errorDetails,
        providerWorkflowRef: primary.providerWorkflowRef || duplicate.providerWorkflowRef,
    };
}

export function dedupeGenerationLogs(logs: GenerationLog[]) {
    const merged: GenerationLog[] = [];
    const byKey = new Map<string, number>();
    logs.forEach((log) => {
        const keys = imageLogIdentityKeys(log);
        const index = keys.map((key) => byKey.get(key)).find((value): value is number => value !== undefined);
        if (index === undefined) {
            merged.push(log);
            keys.forEach((key) => byKey.set(key, merged.length - 1));
            return;
        }
        const current = merged[index];
        const primary = preferGenerationLog(log, current) ? log : current;
        const duplicate = primary === log ? current : log;
        const nextLog = mergeLogIdentityData(primary, duplicate);
        merged[index] = nextLog;
        uniqueStrings([...imageLogIdentityKeys(current), ...imageLogIdentityKeys(log), ...imageLogIdentityKeys(nextLog)]).forEach((key) => byKey.set(key, index));
    });
    return sortByNewest(merged);
}

export function generationResultRank(result: GenerationResult) {
    return (result.status === "success" ? 1000 : result.status === "failed" ? 700 : 0) + (result.image ? 100 : 0) + (result.task ? 5 : 0) + (imageTaskSourceId(result.task) === result.id ? 8 : 0);
}

export function dedupeGenerationResults(results: GenerationResult[]) {
    const merged: GenerationResult[] = [];
    const byKey = new Map<string, number>();
    results.forEach((result) => {
        const keys = imageResultIdentityKeys(result);
        const index = keys.map((key) => byKey.get(key)).find((value): value is number => value !== undefined);
        if (index === undefined) {
            merged.push(result);
            keys.forEach((key) => byKey.set(key, merged.length - 1));
            return;
        }
        const current = merged[index];
        const resultSourceId = imageTaskSourceId(result.task);
        const currentSourceId = imageTaskSourceId(current.task);
        const next = current.id && resultSourceId === current.id ? current : result.id && currentSourceId === result.id ? result : generationResultRank(result) >= generationResultRank(current) ? result : current;
        merged[index] = next;
        uniqueStrings([...imageResultIdentityKeys(current), ...imageResultIdentityKeys(result), ...imageResultIdentityKeys(next)]).forEach((key) => byKey.set(key, index));
    });
    return merged;
}

export function createResultFromImageLog(log: GenerationLog, status: GenerationResult["status"]): GenerationResult {
    return {
        id: log.id,
        taskLogId: log.id,
        status,
        createdAt: log.createdAt,
        prompt: log.prompt,
        model: log.model,
        config: log.config,
        references: log.references,
        workflowId: log.workflowId,
        workflowName: log.workflowName,
        workflowInputs: log.workflowInputs,
        workflowTaskId: log.workflowTaskId || log.workflowId,
        providerWorkflowRef: log.providerWorkflowRef,
        task: log.task,
        progress: log.task?.progress,
        lastPolledAt: log.lastPolledAt,
    };
}

export function imageLogTaskId(log: GenerationLog) {
    return log.task?.id || "";
}

export function isRecoverableImageTask(task: CanvasImageTask) {
    return isRecoverableTask(task, isCompletedImageTask, isFailedImageTask);
}

export function isCompletedImageTask(task: CanvasImageTask) {
    return Boolean(task.image_url || task.url) || isCompletedTaskStatus(task.status);
}

export function isFailedImageTask(task: CanvasImageTask) {
    return isFailedTaskStatus(task.status);
}

export function mergeBackendImageTasks(logs: GenerationLog[], tasks: CanvasImageTask[], config: AiConfig) {
    const nextLogs = [...logs];
    const byKey = new Map<string, GenerationLog>();
    nextLogs.forEach((log) => imageLogIdentityKeys(log).forEach((key) => byKey.set(key, log)));
    tasks.forEach((task) => {
        const existing = imageTaskIdentityKeys(task).map((key) => byKey.get(key)).find(Boolean);
        if (existing) {
            const index = nextLogs.findIndex((log) => log.id === existing.id);
            if (index >= 0) {
                const providerWorkflowRef = existing.providerWorkflowRef || parseWorkflowRef(task.workflowRef);
                const nextLog = { ...existing, providerWorkflowRef, task, lastPolledAt: existing.lastPolledAt || Date.now() };
                nextLogs[index] = nextLog;
                imageLogIdentityKeys(nextLog).forEach((key) => byKey.set(key, nextLog));
            }
            return;
        }
        const sourceId = imageTaskSourceId(task);
        const startedAt = parseImageTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || Date.now();
        const providerWorkflowRef = parseWorkflowRef(task.workflowRef);
        const nextLog = buildLog({
            id: sourceId || task.id,
            prompt: task.prompt || "",
            model: task.model || config.imageModel || config.model,
            config: buildGenerationLogConfig({ ...config, model: task.model || config.imageModel || config.model, count: "1" }),
            references: [],
            durationMs: 0,
            successCount: 0,
            failCount: 0,
            status: "生成中",
            images: [],
            errors: [],
            errorDetails: [],
            categoryIds: [],
            providerWorkflowRef,
            task,
            lastPolledAt: Date.now(),
            createdAt: startedAt,
            time: formatTaskTime(startedAt),
        });
        nextLogs.unshift(nextLog);
        imageLogIdentityKeys(nextLog).forEach((key) => byKey.set(key, nextLog));
    });
    return dedupeGenerationLogs(nextLogs);
}

export function imageLogsFromTask(log: GenerationLog, task: CanvasImageTask): GenerationLog[] {
    const urls = uniqueStrings(task.image_urls || []);
    if (urls.length <= 1) return [imageLogFromTask(log, task)];
    const parentTaskId = task.parent_task_id || task.id;

    return urls.map((url, index) => {
        const stored = task.imageStorage?.find((image) => image?.url === url);
        const nextLog = imageLogFromTask(
            {
                ...log,
                id: index === 0 ? log.id : `${log.id}:${index}`,
            },
            {
                ...task,
                id: index === 0 ? task.id : `${parentTaskId}:${index}`,
                parent_task_id: parentTaskId,
                url,
                image_url: url,
                storageKey: stored?.storageKey,
                bytes: stored?.bytes || 0,
                mimeType: stored?.mimeType || task.mimeType,
            },
        );

        return {
            ...nextLog,
            images: nextLog.images.map((image) => ({
                ...image,
                id: index === 0 ? task.id : `${parentTaskId}:${index}`,
            })),
        };
    });
}

export function imageLogFromTask(log: GenerationLog, task: CanvasImageTask): GenerationLog {
    const startedAt = parseImageTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || log.createdAt;
    const durationMs = Date.now() - startedAt;
    if (isFailedImageTask(task)) {
        const message = task.error?.message || task.error_detail || "图片生成失败";
        return { ...log, task, status: "失败", durationMs, failCount: 1, errors: [message], errorDetails: [task.error_detail || message], lastPolledAt: Date.now() };
    }
    if (isCompletedImageTask(task)) {
        const url = task.image_url || task.url || "";
        if (!url) {
            return { ...log, task, status: "失败", durationMs, failCount: 1, errors: ["图片生成完成但没有返回图片地址"], errorDetails: [JSON.stringify(task, null, 2)], lastPolledAt: Date.now() };
        }
        const stored = task.imageStorage?.find((image) => image?.url === url);
        const image: GeneratedImage = { id: task.id, dataUrl: url, storageKey: task.storageKey, durationMs, width: stored?.width || task.width || 0, height: stored?.height || task.height || 0, bytes: task.bytes || 0, mimeType: task.mimeType || "image/png" };
        return { ...log, task, status: "成功", durationMs, successCount: 1, failCount: 0, imageCount: 1, images: [image], thumbnails: [url], errors: [], errorDetails: [], lastPolledAt: Date.now() };
    }
    return { ...log, task, durationMs, lastPolledAt: Date.now() };
}

export function parseImageTaskTime(value: unknown) {
    return parseTaskTimestampValue(value, 100000000000);
}



export async function readStoredLogs() {
    return dedupeGenerationLogs(await normalizeLogsSafely(await readStoredValues<GenerationLog>(logStore), normalizeLog));
}

export async function readStoredCategories() {
    if (typeof window === "undefined") return [];
    try {
        const value = await categoryStore.getItem<GenerationCategory[]>(CATEGORY_STORE_KEY);
        return Array.isArray(value) ? value.filter((item) => item.id && item.name).sort((a, b) => a.createdAt - b.createdAt) : [];
    } catch {
        return [];
    }
}

export async function replaceStoredImageHistory(logs: GenerationLog[], categories: GenerationCategory[]) {
    if (typeof window === "undefined") return;
    await logStore.clear();
    await Promise.all(logs.map((log) => logStore.setItem(log.id, serializeLog(log))));
    await categoryStore.setItem(CATEGORY_STORE_KEY, categories);
    await deleteUnusedImagePreviews(
        "image-result:",
        new Set(logs.flatMap((log) => log.images.map((image) => `image-result:${image.id}`))),
    );
}

export function withWorkflowLogCategories(logs: GenerationLog[], categories: GenerationCategory[]) {
    const byName = new Map(categories.map((category) => [category.name, category]));
    const byId = new Map(categories.map((category) => [category.id, category]));
    let nextCategories = categories;
    let categoriesChanged = false;
    let logsChanged = false;
    const ensureCategory = (name: string, preferredId?: string) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const existing = byName.get(trimmed);
        if (existing) return existing;
        const id = preferredId && !byId.has(preferredId) ? preferredId : nanoid();
        const category = { id, name: trimmed, createdAt: Date.now() };
        if (!categoriesChanged) nextCategories = [...categories];
        categoriesChanged = true;
        nextCategories.push(category);
        byName.set(trimmed, category);
        byId.set(id, category);
        return category;
    };
    const nextLogs = logs.map((log) => {
        const workflowName = log.workflowName?.trim();
        if (!workflowName) return log;
        const missingCategoryId = log.categoryIds.find((id) => !byId.has(id));
        const category = ensureCategory(workflowName, missingCategoryId);
        if (!category || log.categoryIds.includes(category.id)) return log;
        logsChanged = true;
        return { ...log, categoryIds: [...log.categoryIds, category.id] };
    });
    return { logs: logsChanged ? nextLogs : logs, categories: categoriesChanged ? nextCategories : categories };
}

export function isClientImageTaskId(value?: string) {
    return isClientTaskId(value, "client_image_task_");
}

export function isLocalOnlyImageLog(log: GenerationLog) {
    if (isClientImageTaskId(log.task?.id) && !log.task?.source && !log.task?.source_id) return true;
    if (log.config.channelMode === "remote" || log.task) return false;
    return log.status !== "成功" || log.images.length > 0;
}

export function shouldPreserveLocalImageLogDuringRemoteMerge(log: GenerationLog, remoteKeys: Set<string>) {
    if (!isLocalOnlyImageLog(log) && !(log.status === "生成中" && !log.images.length && !log.task)) return false;
    const keys = imageLogIdentityKeys(log);
    return !keys.length || !keys.some((key) => remoteKeys.has(key));
}

export async function mergeGenerationLogs(remoteLogs: GenerationLog[], localLogs: GenerationLog[]) {
    const normalizedRemote = await Promise.all(remoteLogs.map(normalizeLog));
    const normalizedLocal = await Promise.all(localLogs.map(normalizeLog));
    return mergeNormalizedLogs(normalizedRemote, normalizedLocal, imageLogIdentityKeys, shouldPreserveLocalImageLogDuringRemoteMerge, dedupeGenerationLogs);
}

export async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
        })),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            const dataUrl = await resolveImageUrl(item.storageKey, item.dataUrl);
            return { ...item, dataUrl };
        }),
    );
    const visibleImages = images.filter((image) => Boolean(image.dataUrl));
    if (!visibleImages.length && log.status === "成功") {
        const taskImageUrl = log.task?.image_url || log.task?.url || "";
        const dataUrl = await resolveImageUrl(log.task?.storageKey, taskImageUrl);
        if (dataUrl) {
            visibleImages.push({
                id: log.task?.id || log.id || nanoid(),
                dataUrl,
                storageKey: log.task?.storageKey,
                durationMs: log.durationMs || 0,
                width: log.task?.width || 0,
                height: log.task?.height || 0,
                bytes: log.task?.bytes || 0,
                mimeType: log.task?.mimeType || "image/png",
            });
        }
    }
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || "未命名",
        prompt: log.prompt || log.title || "",
        time: log.time || formatLogTime(Date.now()),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || "成功",
        images: visibleImages,
        thumbnails: visibleImages.map((image) => image.dataUrl),
        errors: log.errors || [],
        errorDetails: log.errorDetails || [],
        categoryIds: Array.isArray(log.categoryIds) ? log.categoryIds : [],
        workflowId: log.workflowId,
        workflowName: log.workflowName,
        workflowInputs: log.workflowInputs,
        workflowTaskId: log.workflowTaskId,
        providerWorkflowRef: log.providerWorkflowRef,
        task: log.task,
        lastPolledAt: log.lastPolledAt,
    };
}

export function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: persistableImageUrl(item.dataUrl, item.storageKey) })),
        images: log.images.map((image) => ({ ...image, dataUrl: persistableImageUrl(image.dataUrl, image.storageKey) })),
        thumbnails: log.images.map((image) => persistableImageUrl(image.dataUrl, image.storageKey)),
    };
}

export function persistableImageUrl(dataUrl?: string, storageKey?: string) {
    if (storageKey) return "";
    if (!dataUrl?.startsWith("data:image/")) return dataUrl || "";
    return "";
}

export function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    const taskChannelId = imageTaskChannelId(log.task);
    return {
        channelMode: log.config?.channelMode || "local",
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        activeChannelId: taskChannelId || log.config?.activeChannelId || log.config?.imageChannelId || "",
        imageChannelId: taskChannelId || log.config?.imageChannelId || log.config?.activeChannelId || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
        apiMode: log.config?.apiMode || "images",
        streamImages: typeof log.config?.streamImages === "string" ? log.config.streamImages : log.config?.streamImages ? "1" : "",
        streamPartialImages: typeof log.config?.streamPartialImages === "string" ? log.config.streamPartialImages : "1",
        responseFormatB64Json: typeof log.config?.responseFormatB64Json === "string" ? log.config.responseFormatB64Json : log.config?.responseFormatB64Json === false ? "" : "1",
        codexCli: typeof log.config?.codexCli === "string" ? log.config.codexCli : log.config?.codexCli ? "1" : "",
    };
}

export function imageTaskChannelId(task?: CanvasImageTask | null) {
    return taskChannelId(task);
}

export function resolveImageChannelId(config: AiConfig, model: string, ...preferredIds: Array<string | undefined>) {
    return resolveChannelId(config, model, ...preferredIds);
}

export function buildGenerationLogConfig(config: AiConfig): GenerationLogConfig {
    return {
        channelMode: config.channelMode,
        model: config.model,
        imageModel: config.imageModel,
        activeChannelId: config.imageChannelId || config.activeChannelId,
        imageChannelId: config.imageChannelId,
        quality: config.quality,
        size: config.size,
        count: config.count,
        apiMode: config.apiMode,
        streamImages: config.streamImages,
        streamPartialImages: config.streamPartialImages,
        responseFormatB64Json: config.responseFormatB64Json,
        codexCli: config.codexCli,
    };
}

export function imageExtension(value: string) {
    const lower = value.toLowerCase();
    if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
    if (lower.includes("webp")) return "webp";
    return "png";
}

export function clampWorkflowButtonPosition(position: { x?: number; y?: number }) {
    if (typeof window === "undefined") return { x: Number(position.x) || 24, y: Number(position.y) || 320 };
    return {
        x: Math.min(Math.max(12, Number(position.x) || 12), Math.max(12, window.innerWidth - 120)),
        y: Math.min(Math.max(72, Number(position.y) || 72), Math.max(72, window.innerHeight - 64)),
    };
}

export function buildLog({
    id,
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
    errors,
    errorDetails,
    categoryIds,
    workflowId,
    workflowName,
    workflowInputs,
    providerWorkflowRef,
    task,
    lastPolledAt,
    createdAt,
    time,
}: {
    id?: string;
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
    errors: string[];
    errorDetails?: string[];
    categoryIds?: string[];
    workflowId?: string;
    workflowName?: string;
    workflowInputs?: Record<string, unknown>;
    providerWorkflowRef?: WorkflowRef;
    task?: CanvasImageTask;
    lastPolledAt?: number;
    createdAt?: number;
    time?: string;
}): GenerationLog {
    const logConfig = config;
    const logCreatedAt = createdAt || Date.now();
    return {
        id: id || nanoid(),
        createdAt: logCreatedAt,
        title: prompt.slice(0, 12) || "未命名",
        prompt,
        time: time || formatTaskTime(logCreatedAt),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        imageCount: status === "生成中" ? 0 : Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
        thumbnails: images.map((image) => image.dataUrl),
        errors,
        errorDetails,
        categoryIds: categoryIds || [],
        workflowId,
        workflowName,
        workflowInputs,
        providerWorkflowRef,
        task,
        lastPolledAt,
    };
}
