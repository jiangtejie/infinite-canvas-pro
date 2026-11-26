"use client";

import { ClipboardPaste, FolderPlus, Upload } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { App, Button } from "antd";
import { nanoid } from "nanoid";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/assets/asset-picker-modal";
import type { WorkbenchLayout } from "@/components/workbench-header";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { PageFrame } from "@/components/ui/page-frame";
import { LoadingState } from "@/components/ui/state-panel";
import { WORKBENCH_BOTTOM_RESULTS_CLASS, WorkbenchShell } from "@/components/workbench/workbench-shell";
import { VideoWorkbenchPanel } from "./components/workbench-panel";
import type { GenerationResult, GenerationLog, UpdateAiConfig, AssetPickerTarget, WorkflowPollContext } from "./history";
import { logStore, createResultFromLog, shouldSyncVideoLog, dedupeVideoLogs, isLocalClientVideoLog, referenceUsedByGeneration, mediaReferenceUsedByGeneration, mergePendingLogResults, sortVideoResults, sortVideoLogs, readStoredLogs, serializeLog, isSupportedAudioFile, filterAudioReferencesByDuration, moveListItem, buildLog, buildVideoConfig, videoTaskChannelId, resolveVideoChannelId, normalizeCharacterOrientation, defaultKlingElementList, normalizeKlingElementList, normalizeKlingMultiPrompts, normalizeVideoCount, buildResumeVideoConfig, videoLogTaskId } from "./history";
import { ReferenceVideoStrip } from "./components/reference-strips";
import { ResultsPanel } from "./components/results-panel";
import { useVideoTaskPolling } from "./hooks/use-video-task-polling";
import { useVideoHistorySync } from "./hooks/use-video-history-sync";
import { useVideoGeneration } from "./hooks/use-video-generation";
import { useVideoTaskStop } from "./hooks/use-video-task-stop";
import { useVideoResultActions } from "./hooks/use-video-result-actions";
import { useAutoDLWorkflow } from "@/hooks/use-autodl-workflow";
import { useScreenLoadTiming } from "@/hooks/use-screen-load-timing";
import { getAutoDLCapabilities, isAutoDLConfig } from "@/lib/autodl";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { videoFrameReferencesEnabled, videoReferenceCapacity } from "@/lib/video-reference-limits";
import { deleteStoredMedia, uploadMediaFile } from "@/services/file-storage";
import { deleteStoredImages, uploadImage } from "@/services/image-storage";
import { saveVideoGenerationLogs } from "@/services/api/generation-logs";
import { VIDEO_POLL_INTERVAL_MS, type VideoResponse } from "@/services/api/video";
import { useConfigStore, useEffectiveConfig, type AiConfig, type VideoElementItem, type VideoElementReference } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { WorkflowRef } from "@/lib/workflow-channel";

import { readVideoDraft, saveVideoDraft } from "./draft";
import type { VideoGenerationSnapshot, VideoTaskRun } from "./task-types";
import { validateVideoRequest } from "./validation";
import { errorMessage } from "@/lib/utils";
import { readClipboardBlobs } from "@/lib/clipboard";
import { usePasteClipboardText } from "@/hooks/use-paste-clipboard-text";
import { useCopyText } from "@/hooks/use-copy-text";
import { WORKBENCH_LAYOUT_KEY } from "@/lib/storage-keys";
import { usesBackendTasks } from "@/lib/generation-history";

const KlingV26WorkbenchPanel = dynamic(
    () => import("./components/kling-v26-workbench-panel").then((module) => module.KlingV26WorkbenchPanel),
    { ssr: false, loading: () => <LoadingState className="min-h-[420px] rounded-lg border border-border bg-card" label="正在加载 Kling 工作台..." /> },
);
export default function VideoPage() {
    useScreenLoadTiming("视频工作台");
    const { message } = App.useApp();
    const confirm = useConfirm();
    const copyText = useCopyText();
    const pasteClipboardText = usePasteClipboardText();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const elementFileInputRef = useRef<HTMLInputElement>(null);
    const firstFrameInputRef = useRef<HTMLInputElement>(null);
    const lastFrameInputRef = useRef<HTMLInputElement>(null);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const videoConfig = useMemo(() => ({ ...effectiveConfig, activeChannelId: effectiveConfig.videoChannelId || effectiveConfig.activeChannelId, size: effectiveConfig.videoSize }), [effectiveConfig]);
    const updateVideoConfig = useCallback<UpdateAiConfig>((key, value) => {
        if (key === "size") {
            updateConfig("videoSize", String(value));
            return;
        }
        updateConfig(key, value);
    }, [updateConfig]);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const token = useUserStore((state) => state.token);
    const userId = useUserStore((state) => state.user?.id || "");
    const isUserReady = useUserStore((state) => state.isReady);
    const [prompt, setPrompt] = useState("");
    const [negativePrompt, setNegativePrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [firstFrame, setFirstFrame] = useState<ReferenceImage | null>(null);
    const [lastFrame, setLastFrame] = useState<ReferenceImage | null>(null);
    const [videoReferences, setVideoReferences] = useState<ReferenceVideo[]>([]);
    const [audioReferences, setAudioReferences] = useState<ReferenceAudio[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const refreshLogs = async () => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        return nextLogs;
    };
    const [running, setRunning] = useState(false);
    const [workbenchLayout, setWorkbenchLayoutState] = useState<WorkbenchLayout>("side");
    const [bottomSettingsCollapsed, setBottomSettingsCollapsed] = useState(true);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget>("general");
    const [elementPickerIndex, setElementPickerIndex] = useState(0);
    const [elementUploadIndex, setElementUploadIndex] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [taskCount, setTaskCount] = useState(1);
    const [draftReady, setDraftReady] = useState(false);
    const [syncingVideoIds, setSyncingVideoIds] = useState<string[]>([]);
    const pollingLogIdsRef = useRef(new Set<string>());
    const videoTaskRunsRef = useRef(new Map<string, VideoTaskRun>());
    const historySyncRef = useRef<Promise<GenerationLog[] | undefined>>(Promise.resolve(undefined));
    const loadAccountVideoHistoryRef = useRef<() => Promise<GenerationLog[] | undefined>>(async () => undefined);
    const syncBackendVideoTasksRef = useRef<(baseLogs?: GenerationLog[]) => Promise<GenerationLog[]>>(async () => []);
    const pollPendingLogsOnceRef = useRef<(sourceLogs: GenerationLog[], context: WorkflowPollContext) => void>(() => undefined);
    const logsRef = useRef<GenerationLog[]>([]);
    const effectiveConfigRef = useRef(videoConfig);
    const workflowSubmissionRef = useRef(0);
    const submittingRef = useRef(false);

    const model = effectiveConfig.videoModel || effectiveConfig.model;
    const capacity = useMemo(() => videoReferenceCapacity(videoConfig, model, { workflow: Boolean(videoConfig.videoWorkflowRef) }), [videoConfig, model]);
    const referenceLimits = capacity.limits;
    const autodl = !videoConfig.videoWorkflowRef && isAutoDLConfig(videoConfig, model);
    const { data: autodlWorkflow, error: autodlError } = useAutoDLWorkflow(videoConfig, model);
    const autodlCapabilities = getAutoDLCapabilities(autodlWorkflow);
    const canGenerate = Boolean(prompt.trim() || videoConfig.videoWorkflowRef) || (autodl && autodlCapabilities?.promptRequired === false);
    const pendingCount = results.filter((item) => item.status === "pending").length;
    const klingWorkbench = capacity.klingWorkbench;
    const klingWorkbenchVariant = klingWorkbench?.variant || "";
    const klingWorkbenchProvider = klingWorkbench?.provider || "apimart";
    const isKlingWorkbench = Boolean(klingWorkbench);
    const klingOmni = capacity.omni;
    const klingAcceptsVideoReferences = capacity.acceptsVideoReferences;
    const referenceImageLimit = capacity.imageLimit;
    const videoReferenceLimit = capacity.videoLimit;
    const hasPendingLogs = logs.some((log) => (log.status === "生成中" || (log.status === "停止中" && !log.error)) && log.task && !log.video);
    const hasPendingTasks = hasPendingLogs || pendingCount > 0 || results.some((item) => item.status === "stopping" && !item.error);
    const usesBackendVideoTasks = useCallback((value: AiConfig) => usesBackendTasks(value, token), [token]);

    useEffect(() => {
        if (autodl && autodlError) message.error(autodlError.message);
    }, [autodl, autodlError, message]);

    const restorePendingLogResults = (sourceLogs: GenerationLog[]) => {
        const pendingLogs = sourceLogs.filter((log) => (log.status === "生成中" || log.status === "停止中") && log.task && !log.video);
        if (!pendingLogs.length) return;
        setResults((value) => mergePendingLogResults(value, pendingLogs));
    };

    const pollPendingLogsOnce = (sourceLogs: GenerationLog[], context: WorkflowPollContext) => {
        sourceLogs.filter((log) => log.status === "停止中" && !log.error).forEach((log) => { void stopVideoTask(log.id); });
        const pendingLogs = sourceLogs.filter((log) => log.status === "生成中" && log.task && !log.video);
        if (!pendingLogs.length) return;
        pendingLogs.forEach((log) => {
            if (pollingLogIdsRef.current.has(log.id)) return;
            const resumeConfig = buildResumeVideoConfig(effectiveConfigRef.current, log);
            const taskId = videoLogTaskId(log);
            if (!taskId || (!log.providerWorkflowRef && !isAiConfigReady(resumeConfig, log.model))) return;
            if (log.providerWorkflowRef && !context.token) return;
            if (isLocalClientVideoLog(log) && !usesBackendVideoTasks(resumeConfig)) return;
            const run: VideoTaskRun = videoTaskRunsRef.current.get(log.id) || { id: log.task!.id, controller: new AbortController(), backend: log.taskBackend };
            videoTaskRunsRef.current.set(log.id, run);
            if (!run.controller.signal.aborted) run.poll = pollPendingLogOnce(log, resumeConfig, { ...context, signal: AbortSignal.any([context.signal, run.controller.signal]) });
        });
    };

    useEffect(() => {
        logsRef.current = logs;
    }, [logs]);

    useEffect(() => {
        if (!hasPendingTasks) return;
        const controller = new AbortController();
        const context = { token: token || "", signal: controller.signal };
        const timer = window.setInterval(() => {
            pollPendingLogsOnceRef.current(logsRef.current, context);
        }, VIDEO_POLL_INTERVAL_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [hasPendingTasks, token, userId]);

    useEffect(() => {
        try {
            const storedLayout = window.localStorage?.getItem(WORKBENCH_LAYOUT_KEY);
            if (storedLayout === "side" || storedLayout === "bottom") setWorkbenchLayoutState(storedLayout);
        } catch {
            // Keep the default layout when localStorage is unavailable.
        }
    }, []);

    useEffect(() => {
        if (!isUserReady) return;
        let cancelled = false;
        void readVideoDraft()
            .then((draft) => {
                if (cancelled) return;
                if (draft) {
                    setPrompt(draft.prompt);
                    setNegativePrompt(draft.negativePrompt);
                    updateConfig("videoNegativePrompt", draft.negativePrompt);
                    setReferences(draft.references);
                    setFirstFrame(draft.firstFrame);
                    setLastFrame(draft.lastFrame);
                    setVideoReferences(draft.videoReferences);
                    setAudioReferences(draft.audioReferences);
                    setTaskCount(draft.taskCount);
                }
                setDraftReady(true);
            })
            .catch(() => {
                if (!cancelled) setDraftReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, [isUserReady, updateConfig]);

    useEffect(() => {
        if (!isUserReady || !draftReady) return;
        const timer = window.setTimeout(() => {
            void saveVideoDraft({ prompt, negativePrompt, references, firstFrame, lastFrame, videoReferences, audioReferences, taskCount }).catch(() => undefined);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [draftReady, isUserReady, prompt, negativePrompt, references, firstFrame, lastFrame, videoReferences, audioReferences, taskCount]);

    useEffect(() => {
        effectiveConfigRef.current = videoConfig;
    }, [videoConfig]);

    useEffect(() => {
        restorePendingLogResults(logs);
    }, [logs]);

    useEffect(() => {
        if (!isUserReady) return;
        historySyncRef.current = (token ? loadAccountVideoHistoryRef.current() : refreshLogs()).then((items) => syncBackendVideoTasksRef.current(items));
    }, [isUserReady, token]);

    const persistVideoLog = useCallback(async (log: GenerationLog) => {
        if (!token || !shouldSyncVideoLog(log)) return;
        await saveVideoGenerationLogs(token, [serializeLog(log)]).catch(() => undefined);
    }, [token]);

    const saveGenerationLog = useCallback(async (log: GenerationLog, active: () => boolean = () => true) => {
        if (!active()) return;
        await logStore.setItem(log.id, serializeLog(log));
        if (!active()) return;
        logsRef.current = sortVideoLogs([log, ...logsRef.current.filter((item) => item.id !== log.id)]);
        setLogs((value) => active() ? sortVideoLogs([log, ...value.filter((item) => item.id !== log.id)]) : value);
    }, []);

    const { runVideoTask } = useVideoGeneration({ videoTaskRunsRef, saveGenerationLog, persistVideoLog, setResults });

    const setWorkbenchLayout = (layout: WorkbenchLayout) => {
        setWorkbenchLayoutState(layout);
        try {
            window.localStorage?.setItem(WORKBENCH_LAYOUT_KEY, layout);
        } catch {
            // Keep the in-memory layout when localStorage is unavailable.
        }
    };

    const openAssetPicker = (target: AssetPickerTarget = "general") => {
        setAssetPickerTarget(target);
        setAssetPickerOpen(true);
    };

    const openElementAssetPicker = (index: number) => {
        setElementPickerIndex(index);
        openAssetPicker("element");
    };

    const uploadElementReferences = (index: number) => {
        setElementUploadIndex(index);
        elementFileInputRef.current?.click();
    };

    const updateElementList = (items: VideoElementItem[]) => {
        updateConfig("videoElementList", normalizeKlingElementList(items));
    };

    const updateElementReferences = (elementIndex: number, updater: (references: VideoElementReference[]) => VideoElementReference[]) => {
        const list = normalizeKlingElementList(effectiveConfig.videoElementList);
        updateElementList(list.map((item, index) => index === elementIndex ? { ...item, references: updater(item.references).slice(0, 4) } : item));
    };

    const addElementReferences = async (elementIndex: number, files?: FileList | null) => {
        const selectedFiles = Array.from(files || []);
        const list = normalizeKlingElementList(effectiveConfig.videoElementList);
        const current = list[elementIndex];
        if (!current) return;
        const usable = selectedFiles.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || isSupportedAudioFile(file)).slice(0, Math.max(0, 4 - current.references.length));
        const unsupported = selectedFiles.length - usable.length;
        if (unsupported > 0) message.warning("已忽略超出数量或不支持的元素资源");
        const hideLoading = usable.length ? message.loading("正在上传元素资源...", 0) : null;
        try {
            const next = await Promise.all(usable.map(uploadElementReferenceFile));
            const filtered = next.filter((item): item is VideoElementReference => Boolean(item));
            updateElementReferences(elementIndex, (value) => [...value, ...filtered]);
            if (filtered.length) message.success(`已上传 ${filtered.length} 个元素资源`);
        } catch (error) {
            message.error(errorMessage(error, "元素资源上传失败"));
        } finally {
            hideLoading?.();
        }
    };

    const addElementReferencesFromClipboard = async (elementIndex: number) => {
        try {
            const list = normalizeKlingElementList(effectiveConfig.videoElementList);
            const current = list[elementIndex];
            if (!current) return;
            const blobs = await readClipboardBlobs("image/");
            if (!blobs.length) {
                message.error("剪贴板里没有可读取的图片");
                return;
            }
            const next = await Promise.all(blobs.slice(0, Math.max(0, 4 - current.references.length)).map(async (blob, index) => {
                const image = await uploadImage(blob);
                return { id: nanoid(), kind: "image" as const, name: `clipboard-element-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }));
            updateElementReferences(elementIndex, (value) => [...value, ...next]);
            message.success(`已读取 ${next.length} 个元素图片`);
        } catch {
            message.error("剪贴板里没有可读取的图片");
        }
    };

    const removeElementReference = (elementIndex: number, id: string) => {
        updateElementReferences(elementIndex, (value) => value.filter((item) => item.id !== id));
    };

    const moveElementReference = (elementIndex: number, index: number, offset: number) => {
        updateElementReferences(elementIndex, (value) => moveListItem(value, index, offset));
    };

    const addReferences = async (files?: FileList | null) => {
        const selectedFiles = Array.from(files || []);
        const unsupported = isKlingWorkbench ? selectedFiles.filter((file) => (!file.type.startsWith("image/") || referenceImageLimit === 0) && (!file.type.startsWith("video/") || !klingAcceptsVideoReferences)) : selectedFiles.filter((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/") && !isSupportedAudioFile(file));
        if (unsupported.length) message.warning(isKlingWorkbench ? `当前 Kling 模型仅支持${klingAcceptsVideoReferences ? "参考图和参考视频" : "参考图"}` : "已忽略不支持的参考素材，请使用图片、mp4/mov 视频或 mp3/wav 音频");
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/") && file.size <= SEEDANCE_REFERENCE_LIMITS.imageMaxBytes).slice(0, Math.max(0, referenceImageLimit - references.length));
        const videoFiles = isKlingWorkbench && !klingAcceptsVideoReferences ? [] : selectedFiles.filter((file) => file.type.startsWith("video/") && file.size <= referenceLimits.videoMaxBytes).slice(0, Math.max(0, videoReferenceLimit - videoReferences.length));
        const audioFiles = isKlingWorkbench ? [] : selectedFiles.filter((file) => isSupportedAudioFile(file) && file.size <= SEEDANCE_REFERENCE_LIMITS.audioMaxBytes).slice(0, referenceLimits.audios - audioReferences.length);
        if (selectedFiles.some((file) => file.type.startsWith("image/") && file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes)) message.warning("已忽略超过 30MB 的参考图");
        if (selectedFiles.some((file) => file.type.startsWith("video/") && file.size > referenceLimits.videoMaxBytes)) message.warning(`已忽略超过 ${referenceLimits.videoMaxBytes / 1024 / 1024}MB 的参考视频`);
        if (selectedFiles.some((file) => isSupportedAudioFile(file) && file.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes)) message.warning("已忽略超过 15MB 的参考音频");
        const hideLoading = imageFiles.length ? message.loading("正在上传参考图...", 0) : null;
        try {
            const nextReferences = await Promise.all(
                imageFiles.map(async (file) => {
                    const image = await uploadImage(file);
                    return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            const nextVideoReferences = await Promise.all(
                videoFiles.map(async (file) => {
                    const video = await uploadMediaFile(file, "video-reference");
                    return { id: nanoid(), name: file.name, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
                }),
            );
            const uploadedAudioReferences = await Promise.all(audioFiles.map(async (file) => {
                const audio = await uploadMediaFile(file, "audio-reference");
                return { id: nanoid(), name: file.name, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
            }));
            const nextAudioReferences = autodl ? uploadedAudioReferences : filterAudioReferencesByDuration(audioReferences, uploadedAudioReferences, referenceLimits, message.warning);
            setReferences((value) => [...value, ...nextReferences].slice(0, referenceImageLimit));
            setVideoReferences((value) => [...value, ...nextVideoReferences].slice(0, videoReferenceLimit));
            setAudioReferences((value) => [...value, ...nextAudioReferences].slice(0, referenceLimits.audios));
            if (nextReferences.length) message.success(`已上传 ${nextReferences.length} 张参考图`);
        } catch (error) {
            message.error(errorMessage(error, "参考素材上传失败"));
        } finally {
            hideLoading?.();
        }
    };

    const uploadFrameReference = async (slot: "first" | "last", files?: FileList | null) => {
        const file = Array.from(files || []).find((item) => item.type.startsWith("image/"));
        if (!file) {
            message.error("请选择首尾帧图片");
            return;
        }
        if (file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) {
            message.warning("已忽略超过 30MB 的首尾帧图片");
            return;
        }
        const hideLoading = message.loading(slot === "first" ? "正在上传首帧..." : "正在上传尾帧...", 0);
        try {
            const image = await uploadImage(file);
            const next = { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            slot === "first" ? setFirstFrame(next) : setLastFrame(next);
        } catch (error) {
            message.error(errorMessage(error, "首尾帧上传失败"));
        } finally {
            hideLoading();
        }
    };

    const uploadElementReferenceFile = async (file: File): Promise<VideoElementReference | null> => {
        if (file.type.startsWith("image/")) {
            if (file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) return null;
            const image = await uploadImage(file);
            return { id: nanoid(), kind: "image", name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
        }
        if (file.type.startsWith("video/")) {
            if (file.size > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) return null;
            const video = await uploadMediaFile(file, "video-reference");
            if (video.durationMs && (video.durationMs < 3000 || video.durationMs > 8000)) {
                message.warning("已忽略不符合时长要求的元素视频：3-8 秒");
                return null;
            }
            return { id: nanoid(), kind: "video", name: file.name, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
        }
        if (isSupportedAudioFile(file)) {
            if (file.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes) return null;
            const audio = await uploadMediaFile(file, "audio-reference");
            if (audio.durationMs && (audio.durationMs < 5000 || audio.durationMs > 30000)) {
                message.warning("已忽略不符合时长要求的元素音频：5-30 秒");
                return null;
            }
            return { id: nanoid(), kind: "audio", name: file.name, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
        }
        return null;
    };

    const addReferencesFromClipboard = async () => {
        if (!referenceImageLimit) {
            message.warning("当前 Kling 模型不支持参考图");
            return;
        }
        try {
            const blobs = await readClipboardBlobs("image/");
            if (!blobs.length) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, Math.max(0, referenceImageLimit - references.length)).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, referenceImageLimit));
            message.success(`已读取 ${nextReferences.length} 张参考图`);
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    const setFrameFromClipboard = async (slot: "first" | "last") => {
        try {
            const blobs = await readClipboardBlobs("image/");
            const blob = blobs[0];
            if (!blob) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            if (blob.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) {
                message.warning("已忽略超过 30MB 的首尾帧图片");
                return;
            }
            const hideLoading = message.loading(slot === "first" ? "正在读取首帧..." : "正在读取尾帧...", 0);
            try {
                const image = await uploadImage(blob);
                const next = { id: nanoid(), name: slot === "first" ? "clipboard-first-frame.png" : "clipboard-last-frame.png", type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                slot === "first" ? setFirstFrame(next) : setLastFrame(next);
                message.success(slot === "first" ? "已读取首帧" : "已读取尾帧");
            } finally {
                hideLoading();
            }
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    const addVideoReferencesFromClipboard = async () => {
        try {
            const blobs = await readClipboardBlobs("video/");
            if (!blobs.length) {
                message.error("剪切板里没有可读取的视频");
                return;
            }
            const usable = blobs.filter((blob) => blob.size <= referenceLimits.videoMaxBytes).slice(0, Math.max(0, videoReferenceLimit - videoReferences.length));
            if (blobs.some((blob) => blob.size > referenceLimits.videoMaxBytes)) message.warning(`已忽略超过 ${referenceLimits.videoMaxBytes / 1024 / 1024}MB 的参考视频`);
            const nextVideoReferences = await Promise.all(
                usable.map(async (blob, index) => {
                    const video = await uploadMediaFile(blob, "video-reference");
                    return { id: nanoid(), name: `clipboard-video-${index + 1}.mp4`, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
                }),
            );
            setVideoReferences((value) => [...value, ...nextVideoReferences].slice(0, videoReferenceLimit));
            message.success(`已读取 ${nextVideoReferences.length} 个参考视频`);
        } catch {
            message.error("剪切板里没有可读取的视频");
        }
    };

    const addAudioReferencesFromClipboard = async () => {
        try {
            const blobs = await readClipboardBlobs("audio/");
            if (!blobs.length) {
                message.error("剪切板里没有可读取的音频");
                return;
            }
            const usable = blobs.filter((blob) => blob.size <= SEEDANCE_REFERENCE_LIMITS.audioMaxBytes).slice(0, referenceLimits.audios - audioReferences.length);
            if (blobs.some((blob) => blob.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes)) message.warning("已忽略超过 15MB 的参考音频");
            const uploadedAudioReferences = await Promise.all(usable.map(async (blob, index) => {
                const audio = await uploadMediaFile(blob, "audio-reference");
                return { id: nanoid(), name: `clipboard-audio-${index + 1}.mp3`, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
            }));
            const nextAudioReferences = autodl ? uploadedAudioReferences : filterAudioReferencesByDuration(audioReferences, uploadedAudioReferences, referenceLimits, message.warning);
            setAudioReferences((value) => [...value, ...nextAudioReferences].slice(0, referenceLimits.audios));
            message.success(`已读取 ${nextAudioReferences.length} 个参考音频`);
        } catch {
            message.error("剪切板里没有可读取的音频");
        }
    };

    const removeReference = async (id: string) => {
        const reference = references.find((item) => item.id === id);
        setReferences((value) => value.filter((ref) => ref.id !== id));
        if (!reference?.storageKey || referenceUsedByGeneration(reference, logs, results)) return;
        try {
            await deleteStoredImages([reference.storageKey]);
        } catch (error) {
            message.error(errorMessage(error, "参考图文件删除失败"));
        }
    };

    const removeFrameReference = async (slot: "first" | "last") => {
        const reference = slot === "first" ? firstFrame : lastFrame;
        slot === "first" ? setFirstFrame(null) : setLastFrame(null);
        if (!reference?.storageKey || referenceUsedByGeneration(reference, logs, results)) return;
        try {
            await deleteStoredImages([reference.storageKey]);
        } catch (error) {
            message.error(errorMessage(error, "首尾帧文件删除失败"));
        }
    };

    const removeVideoReference = async (id: string) => {
        const reference = videoReferences.find((item) => item.id === id);
        setVideoReferences((value) => value.filter((ref) => ref.id !== id));
        if (!reference?.storageKey || mediaReferenceUsedByGeneration(reference.storageKey, logs, results)) return;
        try {
            await deleteStoredMedia([reference.storageKey]);
        } catch (error) {
            message.error(errorMessage(error, "参考视频文件删除失败"));
        }
    };

    const removeAudioReference = async (id: string) => {
        const reference = audioReferences.find((item) => item.id === id);
        setAudioReferences((value) => value.filter((ref) => ref.id !== id));
        if (!reference?.storageKey || mediaReferenceUsedByGeneration(reference.storageKey, logs, results)) return;
        try {
            await deleteStoredMedia([reference.storageKey]);
        } catch (error) {
            message.error(errorMessage(error, "参考音频文件删除失败"));
        }
    };

    const generate = async () => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        if (submittingRef.current) {
            message.warning("正在提交，请稍候");
            return;
        }
        setPrompt("");
        await submitGenerationSnapshot(snapshot);
    };

    const buildRequestSnapshot = useCallback(({ promptText = prompt, negativePromptText, referenceItems = references, firstFrameItem = firstFrame, lastFrameItem = lastFrame, videoReferenceItems = videoReferences, audioReferenceItems = audioReferences, taskCountValue = taskCount, configValue = videoConfig, modelValue = model, workflowRef = videoConfig.videoWorkflowRef }: { promptText?: string; negativePromptText?: string; referenceItems?: ReferenceImage[]; firstFrameItem?: ReferenceImage | null; lastFrameItem?: ReferenceImage | null; videoReferenceItems?: ReferenceVideo[]; audioReferenceItems?: ReferenceAudio[]; taskCountValue?: number; configValue?: AiConfig; modelValue?: string; workflowRef?: WorkflowRef | null } = {}) => {
        const text = promptText.trim();
        const currentNegativePrompt = (negativePromptText ?? configValue.videoNegativePrompt ?? negativePrompt).trim();
        if (workflowRef) {
            if (!token) { message.error("工作流生成需要先登录"); return null; }
            return { text, model: modelValue, config: { ...configValue, videoNegativePrompt: currentNegativePrompt }, references: [...referenceItems], firstFrame: firstFrameItem, lastFrame: lastFrameItem, videoReferences: [...videoReferenceItems], audioReferences: [...audioReferenceItems], taskCount: normalizeVideoCount(taskCountValue), workflowRef };
        }
        const issue = validateVideoRequest({ config: configValue, model: modelValue, prompt: text, references: referenceItems, videoReferences: videoReferenceItems, elementList: configValue.videoElementList, configReady: isAiConfigReady(configValue, modelValue) });
        if (issue) {
            if (issue.tone === "config") {
                message.warning(issue.message);
                openConfigDialog(true);
            } else {
                message.error(issue.message);
            }
            return null;
        }
        const { omni, imageLimit, videoLimit, audioLimit } = videoReferenceCapacity(configValue, modelValue);
        const normalizedConfig = buildVideoConfig({ ...configValue, videoNegativePrompt: currentNegativePrompt }, modelValue);
        if (omni === "reference-to-video" && videoReferenceItems.length) normalizedConfig.videoGenerateAudio = "false";
        const frameReferencesEnabled = videoFrameReferencesEnabled(configValue, modelValue);
        return { text, model: modelValue, config: normalizedConfig, references: referenceItems.slice(0, imageLimit), firstFrame: frameReferencesEnabled ? firstFrameItem : null, lastFrame: frameReferencesEnabled ? lastFrameItem : null, videoReferences: videoReferenceItems.slice(0, videoLimit), audioReferences: audioReferenceItems.slice(0, audioLimit), taskCount: normalizeVideoCount(taskCountValue) };
    }, [isAiConfigReady, message, model, negativePrompt, openConfigDialog, prompt, references, firstFrame, lastFrame, taskCount, token, videoConfig, videoReferences, audioReferences]);

    const submitGenerationSnapshot = useCallback(async (snapshot: VideoGenerationSnapshot) => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        const workflowToken = snapshot.workflowRef ? useUserStore.getState().token : "";
        const submissionId = snapshot.workflowRef ? ++workflowSubmissionRef.current : 0;
        const active = () => !snapshot.workflowRef || useUserStore.getState().token === workflowToken;
        setRunning(true);
        setPreviewLog(null);
        const pendingLogs = Array.from({ length: snapshot.taskCount }, (): GenerationLog => {
            const clientTaskId = `client_video_task_${nanoid()}`;
            const task: VideoResponse = { id: clientTaskId, task_id: clientTaskId, model: snapshot.model, status: "queued", progress: 0, created_at: Date.now(), size: snapshot.config.size, seconds: snapshot.config.videoSeconds };
            return { ...buildLog({ prompt: snapshot.text, model: snapshot.model, config: snapshot.config, references: snapshot.references, firstFrame: snapshot.firstFrame, lastFrame: snapshot.lastFrame, videoReferences: snapshot.videoReferences, audioReferences: snapshot.audioReferences, durationMs: 0, status: "生成中", task, taskCount: snapshot.taskCount, lastPolledAt: Date.now(), providerWorkflowRef: snapshot.workflowRef || undefined }), taskBackend: snapshot.workflowRef ? "workflow" : usesBackendVideoTasks(snapshot.config) ? "account" : undefined };
        });
        try {
            await Promise.all(pendingLogs.map((log) => logStore.setItem(log.id, serializeLog(log))));
            if (!active()) return;
            setLogs((value) => sortVideoLogs([...pendingLogs, ...value]));
            setResults((value) => sortVideoResults([...pendingLogs.map((log) => createResultFromLog(log, "pending")), ...value]));
            const settled = await Promise.allSettled(pendingLogs.map((log) => {
                const run: VideoTaskRun = { id: log.task!.id, controller: new AbortController() };
                videoTaskRunsRef.current.set(log.id, run);
                const submission = runVideoTask(log, snapshot, workflowToken, () => active() && !run.controller.signal.aborted);
                run.submission = submission;
                return submission;
            }));
            if (!active()) return;
            const nextLogs = settled
                .map((item) => (item.status === "fulfilled" ? item.value : null))
                .filter((item): item is NonNullable<typeof item> => Boolean(item));
            if (!active()) return;
            setLogs((value) => dedupeVideoLogs(value));
            const createdCount = nextLogs.filter((item) => item.status === "生成中").length;
            const failedCount = nextLogs.filter((item) => item.status === "失败").length;
            if (createdCount) message.success(`已创建 ${createdCount} 个视频任务`);
            else if (pendingLogs.some((log) => videoTaskRunsRef.current.get(log.id)?.controller.signal.aborted === false)) message.error("视频任务创建失败");
            if (failedCount) message.warning(`${failedCount} 个视频任务创建失败`);
        } finally {
            submittingRef.current = false;
            if (!snapshot.workflowRef || workflowSubmissionRef.current === submissionId) setRunning(false);
        }
    }, [message, runVideoTask, usesBackendVideoTasks]);

    const retryResult = useCallback((result: GenerationResult) => {
        const retryChannelId = videoTaskChannelId(result.task);
        const snapshot = buildRequestSnapshot({ promptText: result.prompt, negativePromptText: result.config.videoNegativePrompt || "", referenceItems: result.references, firstFrameItem: result.firstFrame, lastFrameItem: result.lastFrame, videoReferenceItems: result.videoReferences, audioReferenceItems: result.audioReferences, taskCountValue: 1, configValue: { ...videoConfig, ...result.config, ...(retryChannelId ? { videoChannelId: retryChannelId, activeChannelId: retryChannelId } : {}), model: result.model, videoModel: result.model }, modelValue: result.model, workflowRef: result.providerWorkflowRef || null });
        if (!snapshot) return;
        if (submittingRef.current) {
            message.warning("正在提交，请稍候");
            return;
        }
        setResults((value) => value.filter((item) => item.id !== result.id));
        void submitGenerationSnapshot(snapshot);
    }, [buildRequestSnapshot, message, submitGenerationSnapshot, videoConfig]);

    const applyVideoGenerationConfig = useCallback((config: GenerationLog["config"], fallbackModel: string, task: GenerationLog["task"], providerWorkflowRef: WorkflowRef | undefined, taskCountValue?: number) => {
        updateConfig("videoWorkflowRef", providerWorkflowRef);
        const nextModel = config.videoModel || fallbackModel;
        const nextChannelId = resolveVideoChannelId(effectiveConfig, nextModel, videoTaskChannelId(task), config.videoChannelId, config.activeChannelId);
        if (nextModel) updateConfig("videoModel", nextModel);
        if (nextChannelId) {
            updateConfig("videoChannelId", nextChannelId);
            updateConfig("activeChannelId", nextChannelId);
        }
        if (config.size) updateConfig("videoSize", config.size);
        if (config.vquality) updateConfig("vquality", config.vquality);
        if (config.videoSeconds) updateConfig("videoSeconds", config.videoSeconds);
        if (config.videoMode) updateConfig("videoMode", config.videoMode);
        updateConfig("videoMultiShot", config.videoMultiShot || "false");
        updateConfig("videoShotType", config.videoShotType || "intelligence");
        updateConfig("videoMultiPrompt", normalizeKlingMultiPrompts(config.videoMultiPrompt));
        updateConfig("videoElementList", normalizeKlingElementList(config.videoElementList));
        if (taskCountValue) setTaskCount(normalizeVideoCount(taskCountValue));
        updateConfig("videoNegativePrompt", config.videoNegativePrompt || "");
        if (config.videoGenerateAudio) updateConfig("videoGenerateAudio", config.videoGenerateAudio);
        if (config.videoWatermark) updateConfig("videoWatermark", config.videoWatermark);
        updateConfig("videoCharacterOrientation", normalizeCharacterOrientation(config.videoCharacterOrientation));
    }, [effectiveConfig, updateConfig]);

    const confirmDraftOverwrite = useCallback(async (previewLogId?: string) => {
        if (previewLogId && previewLog?.id === previewLogId) return true;
        const hasDraft = Boolean(prompt.trim() || negativePrompt.trim() || references.length || firstFrame || lastFrame || videoReferences.length || audioReferences.length);
        if (!hasDraft) return true;
        return confirm({ title: "覆盖当前创作", description: "当前提示词、负向提示词与参考素材会被所选内容替换。", confirmText: "覆盖并复用", tone: "warning" });
    }, [audioReferences, confirm, firstFrame, lastFrame, negativePrompt, previewLog, prompt, references, videoReferences]);

    const previewGenerationResult = useCallback(async (result: GenerationResult) => {
        if (!(await confirmDraftOverwrite())) return;
        setPreviewLog(null);
        setResults((value) => value.filter((item) => item.id !== result.id));
        setPrompt(result.prompt);
        setNegativePrompt(result.config.videoNegativePrompt || "");
        setReferences(result.references || []);
        setFirstFrame(result.firstFrame || null);
        setLastFrame(result.lastFrame || null);
        setVideoReferences(result.videoReferences || []);
        setAudioReferences(result.audioReferences || []);
        applyVideoGenerationConfig(result.config, result.model, result.task, result.providerWorkflowRef, result.taskCount);
    }, [applyVideoGenerationConfig, confirmDraftOverwrite]);

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        const insertImage = async () => {
            if (!referenceImageLimit) {
                message.warning("当前 Kling 模型不支持参考图");
                return;
            }
            if (payload.kind !== "image") {
                message.warning("请选择图片素材");
                return;
            }
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: payload.mimeType || "image/*", dataUrl: payload.dataUrl, storageKey: payload.storageKey }].slice(0, referenceImageLimit));
        };
        const insertFrame = (slot: "first" | "last") => {
            if (payload.kind !== "image") {
                message.warning("请选择图片素材");
                return;
            }
            const next = { id: nanoid(), name: payload.title, type: payload.mimeType || "image/*", dataUrl: payload.dataUrl, storageKey: payload.storageKey };
            slot === "first" ? setFirstFrame(next) : setLastFrame(next);
        };
        const insertVideo = () => {
            if (isKlingWorkbench && !klingAcceptsVideoReferences) {
                message.warning("当前 Kling 模型不支持参考视频");
                return;
            }
            if (payload.kind !== "video") {
                message.warning("请选择视频素材");
                return;
            }
            setVideoReferences((value) => [...value, { id: nanoid(), name: payload.title, type: payload.mimeType || "video/mp4", url: payload.url, storageKey: payload.storageKey, width: payload.width, height: payload.height, bytes: payload.bytes }].slice(0, videoReferenceLimit));
        };
        const insertAudio = () => {
            if (isKlingWorkbench) {
                message.warning(`当前 Kling ${klingWorkbenchVariant === "v3" ? "v3" : "v2.6"} 不支持参考音频`);
                return;
            }
            if (payload.kind !== "audio") {
                message.warning("请选择音频素材");
                return;
            }
            const picked = [{ id: nanoid(), name: payload.title, type: payload.mimeType || "audio/mpeg", url: payload.url, storageKey: payload.storageKey, durationMs: payload.durationMs }];
            const next = autodl ? picked : filterAudioReferencesByDuration(audioReferences, picked, referenceLimits, message.warning);
            setAudioReferences((value) => [...value, ...next].slice(0, referenceLimits.audios));
        };

        if (assetPickerTarget === "element") {
            const next = elementReferenceFromAsset(payload);
            if (!next) {
                message.warning("请选择图片、视频或音频素材");
            } else {
                updateElementReferences(elementPickerIndex, (value) => [...value, next]);
            }
        } else if (assetPickerTarget === "firstFrame") {
            insertFrame("first");
        } else if (assetPickerTarget === "lastFrame") {
            insertFrame("last");
        } else if (assetPickerTarget === "image") {
            await insertImage();
        } else if (assetPickerTarget === "video") {
            insertVideo();
        } else if (assetPickerTarget === "audio") {
            insertAudio();
        } else if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            await insertImage();
        } else if (payload.kind === "video") {
            insertVideo();
        } else if (payload.kind === "audio") {
            insertAudio();
        }
        setAssetPickerOpen(false);
    };

    const elementReferenceFromAsset = (payload: InsertAssetPayload): VideoElementReference | null => {
        if (payload.kind === "image") return { id: nanoid(), kind: "image", name: payload.title, type: payload.mimeType || "image/*", dataUrl: payload.dataUrl, storageKey: payload.storageKey, bytes: payload.bytes, width: payload.width, height: payload.height };
        if (payload.kind === "video") return { id: nanoid(), kind: "video", name: payload.title, type: payload.mimeType || "video/mp4", url: payload.url, storageKey: payload.storageKey, bytes: payload.bytes, width: payload.width, height: payload.height };
        if (payload.kind === "audio") return { id: nanoid(), kind: "audio", name: payload.title, type: payload.mimeType || "audio/mpeg", url: payload.url, storageKey: payload.storageKey, durationMs: payload.durationMs };
        return null;
    };

    const createSession = () => {
        setPrompt("");
        setNegativePrompt("");
        setReferences([]);
        setFirstFrame(null);
        setLastFrame(null);
        setVideoReferences([]);
        setAudioReferences([]);
        updateConfig("videoElementList", defaultKlingElementList());
        setResults((value) => value.filter((item) => item.status === "pending" || item.status === "stopping"));
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const { downloadVideo, syncResultVideo, syncLogVideo, saveResultToAssets, deleteSelectedLogs, deleteAccountVideoLogs } = useVideoResultActions({
        logs,
        logsRef,
        results,
        references,
        firstFrame,
        lastFrame,
        videoReferences,
        audioReferences,
        selectedLogIds,
        previewLog,
        videoTaskRunsRef,
        effectiveConfigRef,
        usesBackendVideoTasks,
        setLogs,
        setResults,
        setSelectedLogIds,
        setPreviewLog,
        setDeleteConfirmOpen,
        setSyncingVideoIds,
        saveGenerationLog,
        persistVideoLog,
    });

    const { loadAccountVideoHistory, syncBackendVideoTasks } = useVideoHistorySync({ token, effectiveConfigRef, logsRef, setLogs, setResults, usesBackendVideoTasks });
    useLayoutEffect(() => {
        loadAccountVideoHistoryRef.current = loadAccountVideoHistory;
        syncBackendVideoTasksRef.current = syncBackendVideoTasks;
    });

    const { stopVideoTask } = useVideoTaskStop({ videoTaskRunsRef, logsRef, historySyncRef, setLogs, setResults, saveGenerationLog, persistVideoLog, deleteAccountVideoLogs, onError: message.error, onNotice: message.info });

    const finalizeGenerationLog = async (log: GenerationLog, active: () => boolean = () => true) => {
        await saveGenerationLog(log, active);
        if (!active()) return;
        const run = videoTaskRunsRef.current.get(log.id);
        if (run?.stopping) run.settledLog = log;
        setLogs((value) => active() ? dedupeVideoLogs(value) : value);
        await persistVideoLog(log);
    };

    const { pollPendingLogOnce } = useVideoTaskPolling({ pollingLogIdsRef, setResults, saveGenerationLog, finalizeGenerationLog });
    useLayoutEffect(() => {
        pollPendingLogsOnceRef.current = pollPendingLogsOnce;
    });

    const previewGenerationLog = useCallback(async (log: GenerationLog) => {
        if (!(await confirmDraftOverwrite(log.id))) return;
        setPreviewLog(log);
        setPrompt(log.prompt);
        setNegativePrompt(log.config.videoNegativePrompt || "");
        setReferences(log.references || []);
        setFirstFrame(log.firstFrame || null);
        setLastFrame(log.lastFrame || null);
        setVideoReferences(log.videoReferences || []);
        setAudioReferences(log.audioReferences || []);
        applyVideoGenerationConfig(log.config, log.model, log.task, log.providerWorkflowRef, log.taskCount);
    }, [applyVideoGenerationConfig, confirmDraftOverwrite]);

    const retryGenerationLog = useCallback((log: GenerationLog) => {
        const retryChannelId = videoTaskChannelId(log.task);
        const snapshot = buildRequestSnapshot({ promptText: log.prompt, negativePromptText: log.config.videoNegativePrompt || "", referenceItems: log.references || [], firstFrameItem: log.firstFrame || null, lastFrameItem: log.lastFrame || null, videoReferenceItems: log.videoReferences || [], audioReferenceItems: log.audioReferences || [], taskCountValue: 1, configValue: { ...videoConfig, ...log.config, ...(retryChannelId ? { videoChannelId: retryChannelId, activeChannelId: retryChannelId } : {}), model: log.model, videoModel: log.model }, modelValue: log.model, workflowRef: log.providerWorkflowRef || null });
        if (!snapshot) return;
        if (submittingRef.current) {
            message.warning("正在提交，请稍候");
            return;
        }
        void submitGenerationSnapshot(snapshot);
    }, [buildRequestSnapshot, message, submitGenerationSnapshot, videoConfig]);

    const deleteLog = useCallback((log: GenerationLog) => {
        setSelectedLogIds([log.id]);
        setDeleteConfirmOpen(true);
    }, []);

    const copyPrompt = useCallback((value: string) => copyText(value, "提示词已复制"), [copyText]);

    const resultsPanel = (
        <ResultsPanel
            className={workbenchLayout === "bottom" ? WORKBENCH_BOTTOM_RESULTS_CLASS : undefined}
            results={results}
            logs={logs}
            pendingCount={pendingCount}
            selectedLogIds={selectedLogIds}
            activeLogId={previewLog?.id}
            onSelectedLogIdsChange={setSelectedLogIds}
            onCreateSession={createSession}
            onDeleteSelected={() => setDeleteConfirmOpen(true)}
            onDeleteLog={deleteLog}
            onPreviewLog={previewGenerationLog}
            onRetryLog={retryGenerationLog}
            onPreviewResult={previewGenerationResult}
            onRetryResult={retryResult}
            onStopResult={(result) => void stopVideoTask(result.taskLogId || result.id)}
            onCopyPrompt={copyPrompt}
            onDownload={downloadVideo}
            onSyncResult={syncResultVideo}
            onSyncLog={syncLogVideo}
            onSaveAsset={saveResultToAssets}
            syncingVideoIds={syncingVideoIds}
            onUseExample={setPrompt}
        />
    );
    const workbenchPanel = workbenchLayout === "side" && isKlingWorkbench ? (
        <KlingV26WorkbenchPanel
            isKlingV3={klingWorkbenchVariant === "v3"}
            klingProvider={klingWorkbenchProvider}
            klingOmniVariant={klingOmni}
            referenceVideoCount={videoReferences.length}
            referenceVideoSection={klingAcceptsVideoReferences ? <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                    <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addVideoReferencesFromClipboard()}>剪贴板</Button>
                    <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>上传</Button>
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => openAssetPicker("video")}>我的素材</Button>
                </div>
                <ReferenceVideoStrip references={videoReferences} maxCount={1} onRemoveReference={(id) => void removeVideoReference(id)} onMoveReference={(index, offset) => setVideoReferences((value) => moveListItem(value, index, offset))} />
            </div> : undefined}
            currentLayout={workbenchLayout}
            prompt={prompt}
            negativePrompt={negativePrompt}
            references={references}
            config={videoConfig}
            model={model}
            canGenerate={canGenerate && !running}
            running={running}
            pendingCount={pendingCount}
            taskCount={taskCount}
            onTaskCountChange={setTaskCount}
            updateConfig={updateVideoConfig}
            openConfigDialog={openConfigDialog}
            onLayoutChange={setWorkbenchLayout}
            onPromptChange={setPrompt}
            onNegativePromptChange={(value) => { setNegativePrompt(value); updateConfig("videoNegativePrompt", value); }}
            onOpenPromptLibrary={() => setPromptDialogOpen(true)}
            onOpenAssetPicker={openAssetPicker}
            onPastePrompt={() => void pasteClipboardText(setPrompt)}
            onClearPrompt={() => setPrompt("")}
            onPasteReferences={() => void addReferencesFromClipboard()}
            onUploadReferences={() => fileInputRef.current?.click()}
            onRemoveReference={(id) => void removeReference(id)}
            onMoveReference={(index, offset) => setReferences((value) => moveListItem(value, index, offset))}
            onPasteElementReferences={(index) => void addElementReferencesFromClipboard(index)}
            onUploadElementReferences={uploadElementReferences}
            onOpenElementAssetPicker={openElementAssetPicker}
            onRemoveElementReference={removeElementReference}
            onMoveElementReference={moveElementReference}
            onGenerate={() => void generate()}
        />
    ) : (
        <VideoWorkbenchPanel
            layout={workbenchLayout}
            prompt={prompt}
            negativePrompt={negativePrompt}
            references={references}
            firstFrame={firstFrame}
            lastFrame={lastFrame}
            videoReferences={videoReferences}
            audioReferences={audioReferences}
            config={videoConfig}
            model={model}
            canGenerate={canGenerate && !running}
            pendingCount={pendingCount}
            taskCount={taskCount}
            onTaskCountChange={setTaskCount}
            updateConfig={updateVideoConfig}
            openConfigDialog={openConfigDialog}
            onLayoutChange={setWorkbenchLayout}
            onPromptChange={setPrompt}
            onNegativePromptChange={(value) => { setNegativePrompt(value); updateConfig("videoNegativePrompt", value); }}
            onOpenPromptLibrary={() => setPromptDialogOpen(true)}
            onOpenAssetPicker={openAssetPicker}
            onPastePrompt={() => void pasteClipboardText(setPrompt)}
            onClearPrompt={() => setPrompt("")}
            onPasteReferences={() => void addReferencesFromClipboard()}
            onPasteFrame={(slot) => void setFrameFromClipboard(slot)}
            onPasteVideoReferences={() => void addVideoReferencesFromClipboard()}
            onPasteAudioReferences={() => void addAudioReferencesFromClipboard()}
            onUploadReferences={() => fileInputRef.current?.click()}
            onUploadFrame={(slot) => (slot === "first" ? firstFrameInputRef.current?.click() : lastFrameInputRef.current?.click())}
            onRemoveFrame={(slot) => void removeFrameReference(slot)}
            onRemoveReference={(id) => void removeReference(id)}
            onMoveReference={(index, offset) => setReferences((value) => moveListItem(value, index, offset))}
            onRemoveVideoReference={(id) => void removeVideoReference(id)}
            onMoveVideoReference={(index, offset) => setVideoReferences((value) => moveListItem(value, index, offset))}
            onRemoveAudioReference={(id) => void removeAudioReference(id)}
            onMoveAudioReference={(index, offset) => setAudioReferences((value) => moveListItem(value, index, offset))}
            onGenerate={() => void generate()}
            bottomSettingsCollapsed={bottomSettingsCollapsed}
            setBottomSettingsCollapsed={setBottomSettingsCollapsed}
        />
    );

    return (
        <PageFrame variant="workbench">
            <WorkbenchShell layout={workbenchLayout} panel={workbenchPanel} results={resultsPanel} />
            <input
                ref={fileInputRef}
                type="file"
                accept={isKlingWorkbench ? (klingAcceptsVideoReferences ? "image/*,video/mp4,video/quicktime" : "image/*") : "image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"}
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={elementFileInputRef}
                type="file"
                accept="image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addElementReferences(elementUploadIndex, event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={firstFrameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void uploadFrameReference("first", event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={lastFrameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void uploadFrameReference("last", event.target.files);
                    event.target.value = "";
                }}
            />
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <ConfirmDialog
                open={deleteConfirmOpen}
                title="删除生成记录"
                description={`确定删除选中的 ${selectedLogIds.length} 条生成记录吗？删除后无法恢复。`}
                confirmText="删除"
                tone="danger"
                onConfirm={() => {
                    setDeleteConfirmOpen(false);
                    deleteSelectedLogs();
                }}
                onCancel={() => setDeleteConfirmOpen(false)}
            />
        </PageFrame>
    );
}

