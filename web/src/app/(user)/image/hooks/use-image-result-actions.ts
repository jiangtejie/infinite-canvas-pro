"use client";

import type { Dispatch, SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteCanvasImageTask } from "@/services/api/image";
import { deleteImageGenerationLogs } from "@/services/api/generation-logs";
import { deleteImagePreviews, deleteStoredImages, imageToDataUrl, resolveImageUrl, uploadImage, uploadRemoteImageToServer } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { errorMessage as toErrorMessage } from "@/lib/utils";
import { isStorageNotConfiguredError } from "@/services/storage-errors";

import type { GeneratedImage, GenerationCategory, GenerationLog, GenerationResult } from "../history";
import { CATEGORY_STORE_KEY, categoryStore, disposableLogStorageKeys, imageExtension, logStore, serializeLog, updateResult } from "../history";

type UseImageResultActionsOptions = {
    logs: GenerationLog[];
    categories: GenerationCategory[];
    selectedLogIds: string[];
    previewLog: GenerationLog | null;
    syncingImageIds: string[];
    imageTaskConfig: () => AiConfig;
    setLogs: Dispatch<SetStateAction<GenerationLog[]>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    setReferences: Dispatch<SetStateAction<ReferenceImage[]>>;
    setCategories: Dispatch<SetStateAction<GenerationCategory[]>>;
    setSelectedLogIds: Dispatch<SetStateAction<string[]>>;
    setPreviewLog: Dispatch<SetStateAction<GenerationLog | null>>;
    setDeleteConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setSyncingImageIds: Dispatch<SetStateAction<string[]>>;
    refreshLogs: () => Promise<GenerationLog[]>;
    persistImageHistory: (logs: GenerationLog[], categories: GenerationCategory[]) => Promise<void>;
};

export function useImageResultActions({ logs, categories, selectedLogIds, previewLog, syncingImageIds, imageTaskConfig, setLogs, setResults, setReferences, setCategories, setSelectedLogIds, setPreviewLog, setDeleteConfirmOpen, setSyncingImageIds, refreshLogs, persistImageHistory }: UseImageResultActionsOptions) {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const addAsset = useAssetStore((state) => state.addAsset);
    const token = useUserStore((state) => state.token);

    const downloadImage = async (image: GeneratedImage, index: number) => {
        try {
            const dataUrl = await imageToDataUrl(image);
            const response = await fetch(dataUrl || image.dataUrl);
            const blob = await response.blob();
            saveAs(blob, `image-${index + 1}.${imageExtension(image.mimeType || blob.type || dataUrl || image.dataUrl)}`);
        } catch (error) {
            message.error(toErrorMessage(error, "图片下载失败"));
        }
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        try {
            if (image.storageKey) {
                const url = await resolveImageUrl(image.storageKey, image.dataUrl);
                setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: image.mimeType || "image/png", dataUrl: url || image.dataUrl, storageKey: image.storageKey, source: "result", temporary: false }]);
            } else {
                const source = await imageToDataUrl(image);
                const stored = await uploadImage(source || image.dataUrl);
                setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey, source: "result", temporary: false }]);
            }
            message.success("已加入参考图");
        } catch (error) {
            message.error(toErrorMessage(error, "加入参考图失败"));
        }
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number, resultPrompt: string) => {
        const stored = image.storageKey
            ? {
                  url: await resolveImageUrl(image.storageKey, image.dataUrl),
                  storageKey: image.storageKey,
                  width: image.width,
                  height: image.height,
                  bytes: image.bytes,
                  mimeType: image.mimeType || "image/png",
              }
            : await uploadImage(await imageToDataUrl(image));
        addAsset({
            kind: "image",
            title: `生成结果 ${index + 1}`,
            coverUrl: stored.url,
            tags: [],
            source: "生图工作台",
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt: resultPrompt },
        });
        message.success("已加入我的素材");
    };

    const syncImage = async (image: GeneratedImage, index: number) => {
        if (image.storageKey?.startsWith("server:") || syncingImageIds.includes(image.id)) return null;
        setSyncingImageIds((ids) => Array.from(new Set([...ids, image.id])));
        const hideLoading = message.loading("正在同步图片到云端存储...", 0);
        try {
            const uploaded = await uploadRemoteImageToServer(image.dataUrl, "image-" + (index + 1) + "." + imageExtension(image.mimeType || image.dataUrl));
            message.success("图片已同步到云端存储");
            return { ...image, dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width || image.width, height: uploaded.height || image.height, bytes: uploaded.bytes || image.bytes, mimeType: uploaded.mimeType || image.mimeType };
        } catch (error) {
            message.error(isStorageNotConfiguredError(error) ? "未添加云存储" : toErrorMessage(error, "图片同步失败"));
            return null;
        } finally {
            hideLoading();
            setSyncingImageIds((ids) => ids.filter((id) => id !== image.id));
        }
    };

    const syncResultImage = async (resultId: string, image: GeneratedImage, index: number) => {
        const synced = await syncImage(image, index);
        if (!synced) return;
        setResults((value) => updateResult(value, resultId, { image: synced }));
    };

    const syncLogImage = async (log: GenerationLog, image: GeneratedImage, index: number) => {
        const synced = await syncImage(image, index);
        if (!synced) return;
        const nextLog = { ...log, images: log.images.map((item) => item.id === image.id ? synced : item) };
        await logStore.setItem(log.id, serializeLog(nextLog));
        const nextLogs = logs.map((item) => item.id === log.id ? nextLog : item);
        setLogs(nextLogs);
        await persistImageHistory(nextLogs, categories);
        if (previewLog?.id === log.id) setPreviewLog(nextLog);
    };

    const deleteBackendImageTasks = async (items: GenerationLog[]) => {
        if (!token) return;
        const tasks = Array.from(
            new Map(
                items.flatMap((item) => {
                    const taskId = item.task?.parent_task_id || item.task?.id;
                    return item.task && taskId
                        ? [[taskId, { ...item.task, id: taskId }] as const]
                        : [];
                }),
            ).values(),
        );
        await Promise.all(tasks.map((task) => deleteCanvasImageTask(imageTaskConfig(), task).catch(() => undefined)));
    };

    const deleteAccountImageLogs = async (items: GenerationLog[]) => {
        if (!token) return;
        const ids = Array.from(new Set(items.flatMap((item) => [item.id, item.task?.id].filter((id): id is string => Boolean(id)))));
        if (!ids.length) return;
        await deleteImageGenerationLogs(token, ids).catch(() => undefined);
    };

    const purgeDeletedLogs = async (deletedLogs: GenerationLog[], nextLogs: GenerationLog[]) => {
        const imageKeys = disposableLogStorageKeys(deletedLogs, nextLogs);
        const previewKeys = deletedLogs.flatMap((log) => log.images.map((image) => `image-result:${image.id}`));
        await Promise.all([deleteBackendImageTasks(deletedLogs), deleteAccountImageLogs(deletedLogs), deleteStoredImages(imageKeys), deleteImagePreviews(previewKeys), ...deletedLogs.map((log) => logStore.removeItem(log.id))]);
        setLogs(nextLogs);
        setReferences((value) => value.filter((item) => !item.storageKey || !imageKeys.includes(item.storageKey)));
        await persistImageHistory(nextLogs, categories);
        await refreshLogs();
    };

    const deleteSelectedLogs = () => {
        const deletedLogs = logs.filter((log) => selectedLogIds.includes(log.id));
        const nextLogs = logs.filter((log) => !selectedLogIds.includes(log.id));
        void purgeDeletedLogs(deletedLogs, nextLogs);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults((value) => value.filter((item) => item.status === "pending"));
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const deleteLog = async (log: GenerationLog) => {
        const confirmed = await confirm({ title: "删除生成结果", description: "删除后无法恢复，生成记录与本地图片会一并移除。", confirmText: "删除", tone: "danger" });
        if (!confirmed) return;
        const nextLogs = logs.filter((item) => item.id !== log.id);
        await purgeDeletedLogs([log], nextLogs);
        setSelectedLogIds((value) => value.filter((id) => id !== log.id));
        if (previewLog?.id === log.id) setPreviewLog(null);
    };

    const createCategory = async (name: string) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            message.error("请输入分类名称");
            return null;
        }
        const existing = categories.find((item) => item.name === trimmedName);
        if (existing) return existing;
        const nextCategory = { id: nanoid(), name: trimmedName, createdAt: Date.now() };
        const nextCategories = [...categories, nextCategory];
        setCategories(nextCategories);
        await categoryStore.setItem(CATEGORY_STORE_KEY, nextCategories);
        await persistImageHistory(logs, nextCategories);
        return nextCategory;
    };

    const renameCategory = async (category: GenerationCategory, name: string) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            message.error("请输入分类名称");
            return;
        }
        const nextCategories = categories.map((item) => item.id === category.id ? { ...item, name: trimmedName } : item);
        setCategories(nextCategories);
        await categoryStore.setItem(CATEGORY_STORE_KEY, nextCategories);
        await persistImageHistory(logs, nextCategories);
        message.success("已重命名分类");
    };

    const deleteCategory = async (category: GenerationCategory) => {
        const confirmed = await confirm({ title: "删除分类", description: `分类「${category.name}」内的生成结果会移至未分类。`, confirmText: "删除分类", tone: "danger" });
        if (!confirmed) return;
        const nextCategories = categories.filter((item) => item.id !== category.id);
        const nextLogs = logs.map((log) => ({ ...log, categoryIds: log.categoryIds.filter((id) => id !== category.id) }));
        setCategories(nextCategories);
        setLogs(nextLogs);
        await categoryStore.setItem(CATEGORY_STORE_KEY, nextCategories);
        await Promise.all(nextLogs.map((log) => logStore.setItem(log.id, serializeLog(log))));
        await persistImageHistory(nextLogs, nextCategories);
        message.success("已删除分类");
    };

    const updateLogCategories = async (log: GenerationLog, categoryIds: string[]) => {
        const nextLog = { ...log, categoryIds };
        const nextLogs = logs.map((item) => item.id === log.id ? nextLog : item);
        setLogs(nextLogs);
        await logStore.setItem(log.id, serializeLog(nextLog));
        await persistImageHistory(nextLogs, categories);
        await refreshLogs();
        message.success(categoryIds.length ? "已更新分类" : "已移至未分类");
    };

    const toggleLogCategory = async (log: GenerationLog, categoryId: string) => {
        const nextCategoryIds = log.categoryIds.includes(categoryId) ? log.categoryIds.filter((id) => id !== categoryId) : [...log.categoryIds, categoryId];
        await updateLogCategories(log, nextCategoryIds);
    };

    return { downloadImage, addResultToReferences, saveResultToAssets, syncResultImage, syncLogImage, deleteSelectedLogs, deleteLog, createCategory, renameCategory, deleteCategory, updateLogCategories, toggleLogCategory };
}
