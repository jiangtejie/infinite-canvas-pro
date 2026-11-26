"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { App } from "antd";
import { saveAs } from "file-saver";

import { deleteStoredImages } from "@/services/image-storage";
import { deleteStoredMedia, downloadRemoteMedia, uploadRemoteMediaToServer } from "@/services/file-storage";
import { deleteVideoGenerationLogs } from "@/services/api/generation-logs";
import { deleteVideoGenerationTask } from "@/services/api/video";
import { isStorageNotConfiguredError } from "@/services/storage-errors";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { errorMessage } from "@/lib/utils";

import type { GeneratedVideo, GenerationLog, GenerationResult } from "../history";
import { disposableLogStorageKeys, isCloudVideo, isLocalClientVideoTask, logStore, updateResult, videoLogDeleteKeys, videoResultIdentityKeys } from "../history";
import type { VideoTaskRun } from "../task-types";

type UseVideoResultActionsOptions = {
    logs: GenerationLog[];
    logsRef: MutableRefObject<GenerationLog[]>;
    results: GenerationResult[];
    references: ReferenceImage[];
    firstFrame: ReferenceImage | null;
    lastFrame: ReferenceImage | null;
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    selectedLogIds: string[];
    previewLog: GenerationLog | null;
    videoTaskRunsRef: MutableRefObject<Map<string, VideoTaskRun>>;
    effectiveConfigRef: MutableRefObject<AiConfig>;
    usesBackendVideoTasks: (config: AiConfig) => boolean;
    setLogs: Dispatch<SetStateAction<GenerationLog[]>>;
    setResults: Dispatch<SetStateAction<GenerationResult[]>>;
    setSelectedLogIds: Dispatch<SetStateAction<string[]>>;
    setPreviewLog: Dispatch<SetStateAction<GenerationLog | null>>;
    setDeleteConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setSyncingVideoIds: Dispatch<SetStateAction<string[]>>;
    saveGenerationLog: (log: GenerationLog) => Promise<void>;
    persistVideoLog: (log: GenerationLog) => Promise<void>;
};

export function useVideoResultActions({ logs, logsRef, results, references, firstFrame, lastFrame, videoReferences, audioReferences, selectedLogIds, previewLog, videoTaskRunsRef, effectiveConfigRef, usesBackendVideoTasks, setLogs, setResults, setSelectedLogIds, setPreviewLog, setDeleteConfirmOpen, setSyncingVideoIds, saveGenerationLog, persistVideoLog }: UseVideoResultActionsOptions) {
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);
    const token = useUserStore((state) => state.token);

    const downloadVideo = useCallback(async (video: GeneratedVideo) => {
        const hideLoading = message.loading("正在下载视频...", 0);
        try {
            saveAs(await downloadRemoteMedia(video.url), "video.mp4");
        } catch (error) {
            message.error(errorMessage(error, "视频下载失败"));
        } finally {
            hideLoading();
        }
    }, [message]);

    const syncVideo = useCallback(async (video: GeneratedVideo, index = 0) => {
        if (isCloudVideo(video)) return video;
        setSyncingVideoIds((ids) => Array.from(new Set([...ids, video.id])));
        const hideLoading = message.loading("正在同步视频到云端存储...", 0);
        try {
            const uploaded = await uploadRemoteMediaToServer(video.url, `video-${index + 1}.mp4`);
            message.success("视频已同步到云端存储");
            return { ...video, url: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width || video.width, height: uploaded.height || video.height, bytes: uploaded.bytes || video.bytes, mimeType: uploaded.mimeType || video.mimeType };
        } catch (error) {
            message.error(isStorageNotConfiguredError(error) ? "未添加云存储" : errorMessage(error, "视频同步失败"));
            return null;
        } finally {
            hideLoading();
            setSyncingVideoIds((ids) => ids.filter((id) => id !== video.id));
        }
    }, [message, setSyncingVideoIds]);

    const syncResultVideo = useCallback(async (resultId: string, video: GeneratedVideo, index: number) => {
        const synced = await syncVideo(video, index);
        if (!synced) return;
        setResults((value) => updateResult(value, resultId, { video: synced }));
    }, [setResults, syncVideo]);

    const syncLogVideo = useCallback(async (log: GenerationLog, video: GeneratedVideo, index: number) => {
        const synced = await syncVideo(video, index);
        if (!synced) return;
        const nextLog = { ...log, video: synced };
        await saveGenerationLog(nextLog);
        await persistVideoLog(nextLog);
        if (previewLog?.id === log.id) setPreviewLog(nextLog);
    }, [persistVideoLog, previewLog, saveGenerationLog, setPreviewLog, syncVideo]);

    const saveResultToAssets = useCallback((video: GeneratedVideo, resultPrompt: string) => {
        addAsset({
            kind: "video",
            title: resultPrompt.slice(0, 12) || "生成视频",
            coverUrl: "",
            tags: [],
            source: "视频工作台",
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt: resultPrompt },
        });
        message.success("已加入我的素材");
    }, [addAsset, message]);

    const deleteBackendVideoTasks = useCallback(async (items: GenerationLog[]) => {
        const config = effectiveConfigRef.current;
        if (!token || !usesBackendVideoTasks(config)) return;
        await Promise.all(items.filter((item) => item.task && (item.taskBackend === "account" || !isLocalClientVideoTask(item.task))).map((item) => deleteVideoGenerationTask(config, item.task).catch(() => undefined)));
    }, [effectiveConfigRef, token, usesBackendVideoTasks]);

    const deleteAccountVideoLogs = useCallback(async (items: GenerationLog[]) => {
        if (!token) return;
        const ids = Array.from(new Set(items.flatMap(videoLogDeleteKeys)));
        if (!ids.length) return;
        await deleteVideoGenerationLogs(token, ids).catch(() => undefined);
    }, [token]);

    const deleteSelectedLogs = useCallback(() => {
        const selectedLogs = logs.filter((log) => selectedLogIds.includes(log.id));
        const deleteKeys = new Set(selectedLogs.flatMap(videoLogDeleteKeys));
        const deletedLogs = logs.filter((log) => selectedLogIds.includes(log.id) || videoLogDeleteKeys(log).some((key) => deleteKeys.has(key)));
        const nextLogs = logs.filter((log) => !deletedLogs.some((deleted) => deleted.id === log.id));
        const keys = disposableLogStorageKeys(deletedLogs, nextLogs, [firstFrame, lastFrame, ...references].filter((item): item is ReferenceImage => Boolean(item)), [...videoReferences, ...audioReferences], results);
        setLogs(nextLogs);
        logsRef.current = nextLogs;
        deletedLogs.forEach((log) => videoTaskRunsRef.current.delete(log.id));
        setResults((value) => value.filter((item) => !selectedLogIds.includes(item.id) && !selectedLogIds.includes(item.taskLogId || "") && !videoResultIdentityKeys(item).some((key) => deleteKeys.has(key))));
        void Promise.all([deleteBackendVideoTasks(deletedLogs), deleteAccountVideoLogs(deletedLogs), deleteStoredMedia(keys.media), deleteStoredImages(keys.images), ...deletedLogs.map((log) => logStore.removeItem(log.id))]).catch(() => undefined);
        if (previewLog && deletedLogs.some((log) => log.id === previewLog.id)) setPreviewLog(null);
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    }, [audioReferences, deleteAccountVideoLogs, deleteBackendVideoTasks, firstFrame, lastFrame, logs, logsRef, previewLog, references, results, selectedLogIds, setDeleteConfirmOpen, setLogs, setPreviewLog, setResults, setSelectedLogIds, videoReferences, videoTaskRunsRef]);

    return { downloadVideo, syncResultVideo, syncLogVideo, saveResultToAssets, deleteSelectedLogs, deleteAccountVideoLogs };
}
