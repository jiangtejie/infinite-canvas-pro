"use client";

import {
    ClipboardPaste,
    CloudUpload,
    Download,
    FolderPlus,
    ImagePlus,
    LoaderCircle,
    PenLine,
    Sparkles,
    Trash2,
    Upload,
    WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { App, Button, Drawer, Image, Input, Modal, Segmented, Tag } from "antd";
import { saveAs } from "file-saver";

import { ImageSettingsPanel, imageSizeOptions } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { WorkbenchHeader, type WorkbenchLayout } from "@/components/workbench-header";
import { QuickNumber, QuickSelect } from "@/components/workbench-controls";
import { EmptyState, LoadingState } from "@/components/ui/state-panel";
import type { GeneratedImage, GenerationResult, GenerationLog, GenerationLogConfig, RequestSnapshot, GenerationCategory, ResultViewMode, WorkflowPollContext } from "./history";
import { CATEGORY_STORE_KEY, logStore, categoryStore, createPendingResult, shouldDeleteReferenceFile, disposableLogStorageKeys, createWorkflowResultId, updateResult, updateResultByLogId, mergePendingLogResults, imageTaskIdentityKeys, imageLogIdentityKeys, imageResultIdentityKeys, imageResultMatchesLog, dedupeGenerationLogs, imageLogTaskId, isRecoverableImageTask, mergeBackendImageTasks, imageLogsFromTask, imageLogFromTask, errorMessage, errorDetail, readStoredLogs, readStoredCategories, replaceStoredImageHistory, withWorkflowLogCategories, mergeGenerationLogs, serializeLog, imageTaskChannelId, resolveImageChannelId, buildGenerationLogConfig, imageExtension, defaultWorkflowButtonPosition, clampWorkflowButtonPosition, buildLog } from "./history";
import { FailedResultCard, ReferenceThumbnailOverlay, ResultMediaMeta, TaskResultInfo, formatTaskTime } from "@/components/workbench/task-result";
import { ReferenceStripShell } from "@/components/workbench/reference-strip";
import { ResultsPanelShell, ResultsToolbarActions } from "@/components/workbench/results-shell";
import { BottomPromptComposer, WorkbenchPromptSection, WorkbenchSection } from "@/components/workbench/prompt-composer";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/app/(user)/canvas/components/canvas-node-mask-edit-dialog";
import { canvasThemes } from "@/lib/canvas-theme";
import { IMAGE_MASK_EDIT_PROMPT_PREFIX } from "@/lib/image-reference-prompt";
import type { WorkflowExternalTaskFailure, WorkflowExternalTaskStart, WorkflowExternalTaskSuccess } from "@/components/workflows/creative-workflow-workspace";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { batchCanvasImageTaskStatus, createCanvasImageTask, deleteCanvasImageTask, listCanvasImageTasks, requestEdit, requestGeneration, type CanvasImageTask } from "@/services/api/image";
import { comfyOutputStorageKey, getWorkflowTask, isRetryableWorkflowError, submitWorkflowTask } from "@/services/api/workflow-generation";
import type { WorkflowRef } from "@/lib/workflow-channel";
import { deleteImageGenerationLogs, fetchImageGenerationLogs, saveImageGenerationLogs } from "@/services/api/generation-logs";
import { deleteImagePreviews, deleteStoredImages, ensureImagePreview, getImagePreviewRevision, imageToDataUrl, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage, uploadRemoteImageToServer } from "@/services/image-storage";
import { CategoryCard } from "./components/category-card";
import { HistoryLogCard } from "./components/history-log-card";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
const WORKBENCH_LAYOUT_KEY = "infinite-canvas:workbench-layout";
const RESULT_VIEW_MODE_KEY = "infinite-canvas:image-result-view-mode";
const IMAGE_TASK_POLL_INTERVAL_MS = 10000;
const WORKFLOW_BUTTON_POSITION_KEY = "infinite-canvas:workflow-button-position";
const CreativeWorkflowWorkspace = dynamic(
    () => import("@/components/workflows/creative-workflow-workspace").then((module) => module.CreativeWorkflowWorkspace),
    { ssr: false, loading: () => <LoadingState className="h-full" label="正在加载工作流..." /> },
);
export default function ImagePage() {
    const { message, modal } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const token = useUserStore((state) => state.token);
    const userId = useUserStore((state) => state.user?.id || "");
    const isUserReady = useUserStore((state) => state.isReady);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [uploadingCount, setUploadingCount] = useState(0);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [syncingImageIds, setSyncingImageIds] = useState<string[]>([]);
    const [categories, setCategories] = useState<GenerationCategory[]>([]);
    const [resultViewMode, setResultViewModeState] = useState<ResultViewMode>("all");
    const [activeResultCategoryId, setActiveResultCategoryId] = useState<string | null>(null);
    const [workbenchLayout, setWorkbenchLayoutState] = useState<WorkbenchLayout>("side");
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [maskEditTarget, setMaskEditTarget] = useState<{ image: GeneratedImage; model: string; channelId: string; quality: string; size: string; open: boolean } | null>(null);
    const [workflowDrawerOpen, setWorkflowDrawerOpen] = useState(false);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [workflowButtonPosition, setWorkflowButtonPosition] = useState({ x: 0, y: 0 });
    const workflowButtonRef = useRef<HTMLButtonElement>(null);
    const workflowButtonDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
    const accountHistorySyncEnabledRef = useRef(false);
    const saveLogChainRef = useRef<Promise<void>>(Promise.resolve());
    const pollingLogIdsRef = useRef(new Set<string>());
    const pollContextRef = useRef<WorkflowPollContext | null>(null);
    const logsRef = useRef<GenerationLog[]>([]);
    const effectiveConfigRef = useRef(effectiveConfig);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim() || config.imageWorkflowRef);
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));
    const pendingCount = results.filter((item) => item.status === "pending").length;
    const pendingLogCount = logs.filter((log) => log.status === "生成中" && log.task && !log.images.length).length;
    const usesBackendImageTasks = (value: AiConfig) => value.channelMode === "remote" || (value.channelMode === "local" && Boolean(token));
    const imageTaskConfig = () => effectiveConfigRef.current;

    const restorePendingLogResults = (sourceLogs: GenerationLog[]) => {
        const pendingLogs = sourceLogs.filter((log) => log.status === "生成中" && log.task && !log.images.length);
        if (!pendingLogs.length) return;
        setResults((value) => mergePendingLogResults(value, pendingLogs));
    };

    const pollPendingLogsOnce = (sourceLogs: GenerationLog[], context: WorkflowPollContext) => {
        const pendingLogs = sourceLogs.filter((log) => log.status === "生成中" && log.task && !log.images.length && !pollingLogIdsRef.current.has(log.id));
        if (!pendingLogs.length) return;
        void pollImageTaskLogsOnce(pendingLogs, context);
    };

    useEffect(() => {
        void refreshCategories();
        try {
            const storedLayout = window.localStorage?.getItem(WORKBENCH_LAYOUT_KEY);
            if (storedLayout === "side" || storedLayout === "bottom") setWorkbenchLayoutState(storedLayout);
            const storedViewMode = window.localStorage?.getItem(RESULT_VIEW_MODE_KEY);
            if (storedViewMode === "all" || storedViewMode === "category") setResultViewModeState(storedViewMode);
            const storedButtonPosition = JSON.parse(window.localStorage?.getItem(WORKFLOW_BUTTON_POSITION_KEY) || "null") as { x?: number; y?: number } | null;
            if (typeof storedButtonPosition?.x === "number" && typeof storedButtonPosition?.y === "number") setWorkflowButtonPosition(clampWorkflowButtonPosition(storedButtonPosition));
            else setWorkflowButtonPosition(defaultWorkflowButtonPosition());
        } catch {
            // Local storage can be unavailable in restricted browser contexts.
            setWorkflowButtonPosition(defaultWorkflowButtonPosition());
        }

        // 监听窗口大小变化，拉窄窗口时自动将工作流按钮实时 clamp 限制在可视区域内，杜绝越界
        const handleResize = () => {
            setWorkflowButtonPosition((current) => clampWorkflowButtonPosition(current));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        logsRef.current = logs;
    }, [logs]);

    useEffect(() => {
        if (token) accountHistorySyncEnabledRef.current = true;
    }, [token]);

    useEffect(() => {
        effectiveConfigRef.current = effectiveConfig;
    }, [effectiveConfig]);

    useEffect(() => {
        const controller = new AbortController();
        pollContextRef.current = { token: token || "", signal: controller.signal };
        return () => controller.abort();
    }, [token, userId]);

    useEffect(() => {
        restorePendingLogResults(logs);
    }, [logs]);

    useEffect(() => {
        if (!isUserReady) return;
        if (token) {
            void loadAccountImageHistory().then((items) => syncBackendImageTasks(items));
            return;
        }
        void refreshLogs().then((items) => syncBackendImageTasks(items));
    }, [isUserReady, token]);

    useEffect(() => {
        if (!pendingCount && !pendingLogCount) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [pendingCount, pendingLogCount]);

    useEffect(() => {
        const context = pollContextRef.current;
        if (!pendingLogCount || !context) return;
        pollPendingLogsOnce(logsRef.current, context);
        const timer = window.setInterval(() => pollPendingLogsOnce(logsRef.current, context), IMAGE_TASK_POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [pendingLogCount, token, userId]);

    const setWorkbenchLayout = (layout: WorkbenchLayout) => {
        setWorkbenchLayoutState(layout);
        try {
            window.localStorage?.setItem(WORKBENCH_LAYOUT_KEY, layout);
        } catch {
            // Keep the in-memory layout even when persistence is unavailable.
        }
    };

    const setResultViewMode = (mode: ResultViewMode) => {
        setResultViewModeState(mode);
        try {
            window.localStorage?.setItem(RESULT_VIEW_MODE_KEY, mode);
        } catch {
            // Keep current view in memory if persistence is blocked.
        }
    };

    const persistWorkflowButtonPosition = (position: { x: number; y: number }) => {
        const nextPosition = clampWorkflowButtonPosition(position);
        setWorkflowButtonPosition(nextPosition);
        try {
            window.localStorage?.setItem(WORKFLOW_BUTTON_POSITION_KEY, JSON.stringify(nextPosition));
        } catch {
            // Keep the drag position in memory when localStorage is unavailable.
        }
    };

    const handleWorkflowButtonPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const origin = workflowButtonPosition.x || workflowButtonPosition.y ? workflowButtonPosition : defaultWorkflowButtonPosition();
        workflowButtonDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: origin.x, originY: origin.y, moved: false };
    };

    const handleWorkflowButtonPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = workflowButtonDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
        
        // 直接更新 DOM 样式，免去顶层 React State 的庞大整页重绘 Layout 卡顿！
        const nextPos = clampWorkflowButtonPosition({ x: drag.originX + dx, y: drag.originY + dy });
        if (workflowButtonRef.current) {
            workflowButtonRef.current.style.left = `${nextPos.x}px`;
            workflowButtonRef.current.style.top = `${nextPos.y}px`;
        }
    };

    const handleWorkflowButtonPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = workflowButtonDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const finalPos = clampWorkflowButtonPosition({ x: drag.originX + dx, y: drag.originY + dy });
        persistWorkflowButtonPosition(finalPos);
    };

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        if (!imageFiles.length) return;
        setUploadingCount(imageFiles.length);
        const hideLoading = message.loading("正在上传参考图...", 0);
        try {
            const nextReferences = await Promise.all(
                imageFiles.map(async (file) => {
                    const image = await uploadImage(file);
                    return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, source: "upload" as const, temporary: true };
                }),
            );
            setReferences((value) => [...value, ...nextReferences]);
            message.success("参考图上传成功");
        } catch (error) {
            message.error(error instanceof Error ? `上传参考图失败：${error.message}` : "上传参考图失败");
        } finally {
            hideLoading();
            setUploadingCount(0);
        }
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            setUploadingCount(blobs.length);
            const hideLoading = message.loading("正在上传并读取参考图...", 0);
            try {
                const nextReferences = await Promise.all(
                    blobs.map(async (blob, index) => {
                        const image = await uploadImage(blob);
                        return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, source: "clipboard" as const, temporary: true };
                    }),
                );
                setReferences((value) => [...value, ...nextReferences]);
                message.success(`已成功上传并读取 ${nextReferences.length} 张参考图`);
            } finally {
                hideLoading();
                setUploadingCount(0);
            }
        } catch {
            message.error("剪切板里没有可读取的图片");
            setUploadingCount(0);
        }
    };

    const removeReference = async (id: string) => {
        const reference = references.find((item) => item.id === id);
        setReferences((value) => value.filter((ref) => ref.id !== id));
        if (!reference || !shouldDeleteReferenceFile(reference, logs, results)) {
            message.success("已从工作台移除参考图");
            return;
        }
        if (reference?.storageKey) {
            try {
                await deleteStoredImages([reference.storageKey]);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "参考图文件删除失败");
            }
        }
    };

    const pastePromptFromClipboard = async () => {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (!text) {
                message.error("剪切板里没有可读取的文本");
                return;
            }
            setPrompt(text);
            message.success("已读取剪切板文本");
        } catch {
            message.error("剪切板里没有可读取的文本");
        }
    };

    const clearPrompt = () => {
        setPrompt("");
    };

    const generate = async () => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPrompt("");
        await submitGenerationBatch(snapshot);
    };

    const retryLog = async (log: GenerationLog) => {
        const retryChannelId = imageTaskChannelId(log.task);
        const snapshot = buildRequestSnapshot({ promptText: log.prompt, referenceItems: log.references, taskCount: Number(log.config.count) || 1, configOverride: { ...log.config, ...(retryChannelId ? { imageChannelId: retryChannelId, activeChannelId: retryChannelId } : {}) }, workflowRef: log.providerWorkflowRef || null });
        if (!snapshot) return;
        await submitGenerationBatch(snapshot);
    };

    const openMaskEdit = (log: GenerationLog, image: GeneratedImage) => {
        const nextModel = log.config.imageModel || log.model || model;
        setMaskEditTarget({
            image,
            model: nextModel,
            channelId: resolveImageChannelId(effectiveConfig, nextModel, imageTaskChannelId(log.task), log.config.imageChannelId, log.config.activeChannelId),
            quality: log.config.quality || "auto",
            size: log.config.size || "auto",
            open: true,
        });
    };

    const submitMaskEdit = async (payload: CanvasImageMaskEditPayload) => {
        const target = maskEditTarget;
        if (!target) return;
        try {
            const snapshot = buildRequestSnapshot({
                promptText: `${IMAGE_MASK_EDIT_PROMPT_PREFIX}${payload.prompt.trim()}`,
                taskCount: 1,
                configOverride: {
                    imageModel: payload.model || target.model,
                    imageChannelId: payload.channelId || target.channelId,
                    quality: target.quality,
                    size: target.size,
                },
                workflowRef: null,
            });
            if (!snapshot) return;
            setMaskEditTarget((value) => value ? { ...value, open: false } : value);
            const stored = await uploadImage(payload.markedDataUrl);
            const markedReference = { id: nanoid(), name: "mask-edit.png", type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey, temporary: true };
            await submitGenerationBatch({ ...snapshot, references: [markedReference] });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "局部重绘失败");
        }
    };

    const submitPersistentGenerationBatch = async (snapshot: RequestSnapshot) => {
        const workflowToken = snapshot.workflowRef ? useUserStore.getState().token : "";
        const active = () => !snapshot.workflowRef || useUserStore.getState().token === workflowToken;
        setPreviewLog(null);
        const taskCount = Math.max(1, Number(snapshot.displayConfig.count) || 1);
        const pendingLogs = Array.from({ length: taskCount }, (_, index) => {
            const id = nanoid();
            const clientTaskId = `client_image_task_${id}`;
            const task: CanvasImageTask = { id: clientTaskId, status: "queued", progress: 0, createdAt: Date.now().toString(), created_at: Date.now().toString() };
            return buildLog({
                id,
                prompt: snapshot.text,
                model: snapshot.displayConfig.imageModel || snapshot.displayConfig.model,
                config: { ...snapshot.displayConfig, count: "1" },
                references: snapshot.references,
                durationMs: 0,
                successCount: 0,
                failCount: 0,
                status: "生成中",
                images: [],
                errors: [],
                errorDetails: [],
                categoryIds: activeResultCategoryId ? [activeResultCategoryId] : [],
                providerWorkflowRef: snapshot.workflowRef,
                task,
                lastPolledAt: Date.now(),
            });
        });
        setResults((value) => mergePendingLogResults(value, pendingLogs));
        setNow(Date.now());

        const settled = await Promise.allSettled(pendingLogs.map((log, index) => createPersistentImageTask(log, snapshot, index, taskCount, workflowToken)));
        if (!active()) return;
        const createdCount = settled.filter((item) => item.status === "fulfilled").length;
        if (createdCount) message.success(`已创建 ${createdCount} 个图片任务`);
        if (createdCount < pendingLogs.length) message.warning(`${pendingLogs.length - createdCount} 个图片任务创建失败`);
    };

    const createPersistentImageTask = async (pendingLog: GenerationLog, snapshot: RequestSnapshot, index: number, taskCount: number, workflowToken: string) => {
        const active = () => !snapshot.workflowRef || useUserStore.getState().token === workflowToken;
        try {
            let task: CanvasImageTask;
            if (snapshot.workflowRef) {
                if (!workflowToken) throw new Error("工作流生成需要先登录");
                const referenceImages = await Promise.all(snapshot.references.map(imageToDataUrl));
                if (!active()) throw new Error("登录状态已变化");
                const created = await submitWorkflowTask(workflowToken, {
                    ref: snapshot.workflowRef,
                    expectedCapability: "image",
                    prompt: snapshot.text,
                    systemPrompt: snapshot.requestConfig.systemPrompt,
                    referenceImages,
                    size: snapshot.requestConfig.size,
                    quality: snapshot.requestConfig.quality,
                    count: 1,
                    source: "image-workbench",
                    sourceId: pendingLog.id,
                    clientTaskId: imageLogTaskId(pendingLog),
                });
                if (!active()) throw new Error("登录状态已变化");
                task = { id: created.id, status: created.status, progress: created.progress, source: "workflow", source_id: pendingLog.id };
            } else {
                task = await createCanvasImageTask(
                    { ...snapshot.requestConfig, seedIndex: index, seedCount: taskCount, count: "1" } as AiConfig & { seedIndex?: number; seedCount?: number },
                    snapshot.text,
                    snapshot.references,
                    { source: "image-workbench", sourceId: pendingLog.id, clientTaskId: imageLogTaskId(pendingLog) },
                );
            }
            const nextLog = { ...pendingLog, task, lastPolledAt: Date.now() };
            await saveLog(nextLog, active);
            if (!active()) throw new Error("登录状态已变化");
            setResults((value) => updateResultByLogId(value, pendingLog.id, { taskLogId: nextLog.id, task, progress: task.progress, lastPolledAt: nextLog.lastPolledAt }));
            return nextLog;
        } catch (error) {
            if (!active()) throw error;
            const nextLog = { ...pendingLog, status: "失败" as const, durationMs: Date.now() - pendingLog.createdAt, failCount: 1, errors: [errorMessage(error)], errorDetails: [errorDetail(error)], lastPolledAt: Date.now() };
            await saveLog(nextLog, active);
            if (!active()) throw error;
            setResults((value) => updateResultByLogId(value, pendingLog.id, { status: "failed", error: nextLog.errors[0], errorDetail: nextLog.errorDetails?.[0], durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
            throw error;
        }
    };
    const submitGenerationBatch = async (snapshot: RequestSnapshot) => {
        if (snapshot.workflowRef) {
            await submitPersistentGenerationBatch(snapshot);
            return;
        }
        if (usesBackendImageTasks(snapshot.requestConfig)) {
            await submitPersistentGenerationBatch(snapshot);
            return;
        }
        setPreviewLog(null);
        const taskCount = Math.max(1, Number(snapshot.displayConfig.count) || 1);
        const taskIds = Array.from({ length: taskCount }, () => nanoid());
        const pendingTasks = taskIds.map((id) => createPendingResult(id, snapshot));
        setResults((value) => [...pendingTasks, ...value]);
        setNow(Date.now());

        const tasks = taskIds.map(async (id, index) => {
            const taskStartedAt = performance.now();
            try {
                const image = await runGenerationTask(id, {
                    ...snapshot,
                    requestConfig: {
                        ...snapshot.requestConfig,
                        seedIndex: index,
                        seedCount: taskCount,
                    } as any,
                });

                if (!image) {
                    throw new Error("接口没有返回图片");
                }

                const durableImage = {
                    ...image,
                    storageKey: image.storageKey || "",
                };
                
                // 更新结果状态
                setResults((value) => updateResult(value, id, { image: durableImage }));
                
                // 立即保存单张成功日志
                await saveLog(
                    buildLog({
                        prompt: snapshot.text,
                        model: snapshot.displayConfig.imageModel || snapshot.displayConfig.model,
                        config: { ...snapshot.displayConfig, count: "1" },
                        references: snapshot.references,
                        durationMs: performance.now() - taskStartedAt,
                        successCount: 1,
                        failCount: 0,
                        status: "成功",
                        images: [durableImage],
                        errors: [],
                        errorDetails: [],
                        categoryIds: activeResultCategoryId ? [activeResultCategoryId] : [],
                    }),
                );
                message.success("图片已生成");
            } catch (err) {
                const errMsg = errorMessage(err);
                const errDetail = errorDetail(err);
                
                // 立即保存单张失败日志
                await saveLog(
                    buildLog({
                        prompt: snapshot.text,
                        model: snapshot.displayConfig.imageModel || snapshot.displayConfig.model,
                        config: { ...snapshot.displayConfig, count: "1" },
                        references: snapshot.references,
                        durationMs: performance.now() - taskStartedAt,
                        successCount: 0,
                        failCount: 1,
                        status: "失败",
                        images: [],
                        errors: [errMsg],
                        errorDetails: [errDetail],
                        categoryIds: activeResultCategoryId ? [activeResultCategoryId] : [],
                    }),
                );
                message.error(errMsg || "生成失败");
            } finally {
                // 任务完成，从进行中状态移除
                setResults((value) => value.filter((item) => item.id !== id));
            }
        });

        await Promise.allSettled(tasks);
    };

    const downloadImage = async (image: GeneratedImage, index: number) => {
        try {
            const dataUrl = await imageToDataUrl(image);
            const response = await fetch(dataUrl || image.dataUrl);
            const blob = await response.blob();
            saveAs(blob, `image-${index + 1}.${imageExtension(image.mimeType || blob.type || dataUrl || image.dataUrl)}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片下载失败");
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
            message.error(error instanceof Error ? error.message : "加入参考图失败");
        }
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
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
            metadata: { source: "image-page", prompt },
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
            const errorMessage = error instanceof Error ? error.message : "";
            if (errorMessage.includes("服务端对象存储未启用") || errorMessage.includes("用户对象存储配置不完整")) {
                message.error("未添加云存储");
            } else {
                message.error(errorMessage || "图片同步失败");
            }
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

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const resolvedUrl = await resolveImageUrl(payload.storageKey, payload.dataUrl);
            const safeUrl = resolvedUrl || "";
            const reference =
                payload.storageKey || payload.source === "asset" || payload.source === "library"
                    ? {
                          id: nanoid(),
                          name: payload.title,
                          type: payload.mimeType || "image/png",
                          dataUrl: safeUrl,
                          storageKey: payload.storageKey,
                          source: payload.source === "library" ? "library" : "asset",
                          assetId: payload.assetId,
                          temporary: false,
                      }
                    : (() => null)();
            if (reference) {
                if (!reference.dataUrl) {
                    message.error("引入素材失败：图片数据为空");
                    return;
                }
                setReferences((value) => [...value, reference]);
            } else {
                const stored = await uploadImage(payload.dataUrl);
                setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey, source: payload.source === "library" ? "library" : "upload", temporary: payload.source !== "library" }]);
            }
        } else {
            message.warning("视频素材不能作为生图参考图");
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setResults((value) => value.filter((item) => item.status === "pending"));
        setSelectedLogIds([]);
        setPreviewLog(null);
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

    const deleteSelectedLogs = () => {
        const deletedLogs = logs.filter((log) => selectedLogIds.includes(log.id));
        const nextLogs = logs.filter((log) => !selectedLogIds.includes(log.id));
        const imageKeys = disposableLogStorageKeys(deletedLogs, nextLogs);
        const previewKeys = deletedLogs.flatMap((log) => log.images.map((image) => `image-result:${image.id}`));
        void Promise.all([deleteBackendImageTasks(deletedLogs), deleteAccountImageLogs(deletedLogs), deleteStoredImages(imageKeys), deleteImagePreviews(previewKeys), ...deletedLogs.map((log) => logStore.removeItem(log.id))]).then(async () => {
            setLogs(nextLogs);
            setReferences((value) => value.filter((item) => !item.storageKey || !imageKeys.includes(item.storageKey)));
            await persistImageHistory(nextLogs, categories);
            await refreshLogs();
        });
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults((value) => value.filter((item) => item.status === "pending"));
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const deleteLog = (log: GenerationLog) => {
        modal.confirm({
            title: "删除生成结果",
            content: "确定删除这条生成结果吗？",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                const nextLogs = logs.filter((item) => item.id !== log.id);
                const imageKeys = disposableLogStorageKeys([log], nextLogs);
                const previewKeys = log.images.map((image) => `image-result:${image.id}`);
                await Promise.all([deleteBackendImageTasks([log]), deleteAccountImageLogs([log]), deleteStoredImages(imageKeys), deleteImagePreviews(previewKeys), logStore.removeItem(log.id)]);
                setLogs(nextLogs);
                setReferences((value) => value.filter((item) => !item.storageKey || !imageKeys.includes(item.storageKey)));
                await persistImageHistory(nextLogs, categories);
                setSelectedLogIds((value) => value.filter((id) => id !== log.id));
                if (previewLog?.id === log.id) setPreviewLog(null);
                await refreshLogs();
            },
        });
    };

    const persistLoggedOutLogImages = async (log: GenerationLog): Promise<GenerationLog> => {
        const images = log.images || [];
        if (!images.some((image) => !image.storageKey && image.dataUrl?.startsWith("data:image/"))) return log;
        const persistedImages = await Promise.all(
            images.map(async (image) => {
                if (image.storageKey || !image.dataUrl?.startsWith("data:image/")) return image;
                try {
                    const stored = await uploadImage(image.dataUrl, { localOnly: true });
                    return { ...image, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width || image.width, height: stored.height || image.height, bytes: stored.bytes || image.bytes, mimeType: stored.mimeType || image.mimeType };
                } catch {
                    return image;
                }
            }),
        );
        return { ...log, images: persistedImages };
    };

    const saveLog = async (log: GenerationLog, active: () => boolean = () => true) => {
        if (!active()) return;
        const persistedLog = token ? log : await persistLoggedOutLogImages(log);
        if (!active()) return;
        const prevChain = saveLogChainRef.current;
        const nextChain = (async () => {
            try {
                await prevChain;
            } catch {
                // Ignore previous errors so the chain doesn't break permanently
            }
            if (!active()) return;
            const storedLogs = await readStoredLogs();
            if (!active()) return;
            const keys = new Set(imageLogIdentityKeys(log));
            const duplicateLogs = storedLogs.filter((item) => item.id !== log.id && imageLogIdentityKeys(item).some((key) => keys.has(key)));
            const nextLogs = dedupeGenerationLogs([persistedLog, ...storedLogs.filter((item) => item.id !== log.id)]);
            if (!active()) return;
            setLogs(nextLogs);
            await Promise.all(duplicateLogs.map((item) => logStore.removeItem(item.id)));
            if (!active()) return;
            await logStore.setItem(log.id, serializeLog(persistedLog));
            if (!active()) return;
            await persistImageHistory([persistedLog], categories);
        })();
        saveLogChainRef.current = nextChain;
        await nextChain;
    };

    const refreshLogs = async () => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        return nextLogs;
    };
    const refreshCategories = async () => setCategories(await readStoredCategories());

    const loadAccountImageHistory = async () => {
        try {
            accountHistorySyncEnabledRef.current = true;
            const localLogs = await readStoredLogs();
            const storedCategories = await readStoredCategories();
            const remoteLogs = await fetchImageGenerationLogs<GenerationLog>(token);
            const mergedLogs = await mergeGenerationLogs(remoteLogs, localLogs);
            const categorized = withWorkflowLogCategories(mergedLogs, storedCategories);
            await replaceStoredImageHistory(categorized.logs, categorized.categories);
            setCategories(categorized.categories);
            setLogs(categorized.logs);
            return categorized.logs;
        } catch {
            // Keep local history available when account sync fails.
            return undefined;
        }
    };

    const persistImageHistory = async (nextLogs: GenerationLog[], _nextCategories: GenerationCategory[]) => {
        if (!token || !accountHistorySyncEnabledRef.current) return;
        await saveImageGenerationLogs(token, nextLogs.map(serializeLog)).catch(() => {
            accountHistorySyncEnabledRef.current = false;
        });
    };

    const syncBackendImageTasks = async (baseLogs?: GenerationLog[]) => {
        const currentConfig = imageTaskConfig();
        if (!token) return baseLogs || logsRef.current;
        try {
            const tasks = await listCanvasImageTasks(currentConfig, ["image-workbench", "workflow"]);
            const recoverableTasks = tasks.filter(isRecoverableImageTask);
            if (!recoverableTasks.length) return baseLogs || logsRef.current;
            const currentLogs = baseLogs || (await readStoredLogs());
            const mergedLogs = mergeBackendImageTasks(currentLogs, recoverableTasks, currentConfig);
            const taskIds = new Set(recoverableTasks.flatMap(imageTaskIdentityKeys));
            const recoveredLogs = mergedLogs.filter((log) => imageLogIdentityKeys(log).some((key) => taskIds.has(key)));
            await Promise.all(recoveredLogs.map((log) => logStore.setItem(log.id, serializeLog(log))));
            setLogs(mergedLogs);
            setResults((value) => mergePendingLogResults(value, recoveredLogs));
            return mergedLogs;
        } catch {
            return baseLogs || logsRef.current;
        }
    };

    const pollImageTaskLogsOnce = async (pendingLogs: GenerationLog[], context: WorkflowPollContext) => {
        const active = () => !context.signal.aborted && useUserStore.getState().token === context.token;
        const ids = pendingLogs.map(imageLogTaskId).filter(Boolean);
        if (!ids.length) return;
        pendingLogs.forEach((log) => pollingLogIdsRef.current.add(log.id));
        try {
            const normalLogs = pendingLogs.filter((log) => !log.providerWorkflowRef);
            const normalTasks = normalLogs.length ? await batchCanvasImageTaskStatus(imageTaskConfig(), normalLogs.map(imageLogTaskId)) : [];
            const workflowTasks = await Promise.all(pendingLogs.filter((log) => log.providerWorkflowRef).map(async (log): Promise<CanvasImageTask | null> => {
                if (!context.token) return { ...log.task!, status: "running" };
                if (!active()) return null;
                try {
                    const current = await getWorkflowTask(context.token, imageLogTaskId(log), context.signal);
                    if (!active()) return null;
                    if (current.status === "succeeded") {
                        if (!current.urls?.length) return { ...log.task!, id: current.id, status: "failed", progress: 100, error: { message: "工作流完成但没有返回图片" } };
                        const stored = await Promise.all(current.urls.map((url) => {
                            const storageKey = comfyOutputStorageKey(url);
                            return storageKey
                                ? Promise.resolve({ url, storageKey, width: 0, height: 0, bytes: 0, mimeType: "image/png" })
                                : uploadImage(url, { token: context.token });
                        }));
                        if (!active()) return null;
                        return { ...log.task!, id: current.id, status: "completed", progress: 100, url: stored[0].url, image_url: stored[0].url, image_urls: stored.map((item) => item.url), imageStorage: stored, storageKey: stored[0].storageKey };
                    }
                    return { ...log.task!, id: current.id, status: current.status, progress: current.progress, error: current.error ? { message: current.error } : undefined };
                } catch (error) {
                    if (!active() || error instanceof Error && error.name === "AbortError") return null;
                    message.error(error instanceof Error ? error.message : "查询工作流任务失败");
                    return { ...log.task!, status: isRetryableWorkflowError(error) ? "running" : "failed", error: { message: error instanceof Error ? error.message : "查询工作流任务失败" } };
                }
            }));
            const tasks = [...normalTasks, ...workflowTasks.filter((task): task is CanvasImageTask => task !== null)];
            const taskById = new Map(tasks.map((task) => [task.id, task]));
            await Promise.all(
                pendingLogs.map(async (log) => {
                    const logActive = () => !log.providerWorkflowRef || active();
                    if (!logActive()) return;
                    const task = taskById.get(imageLogTaskId(log));
                    if (!task) {
                        const nextLog = { ...log, status: "失败" as const, durationMs: Date.now() - log.createdAt, failCount: 1, errors: ["图片任务不存在或未创建成功"], errorDetails: ["后端没有找到对应的图片任务"], lastPolledAt: Date.now() };
                        await saveLog(nextLog, logActive);
                        if (!logActive()) return;
                        setResults((value) => updateResultByLogId(value, log.id, { status: "failed", error: nextLog.errors[0], errorDetail: nextLog.errorDetails?.[0], durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                        return;
                    }
                    if ((task.image_urls?.length || 0) > 1) {
                        const nextLogs = imageLogsFromTask(log, task);
                        await Promise.all(nextLogs.map((nextLog) => saveLog(nextLog, logActive)));
                        if (!logActive()) return;
                        setResults((value) => value.filter((item) => !imageResultMatchesLog(item, nextLogs[0])));
                        return;
                    }

                    const nextLog = imageLogFromTask(log, task);
                    await saveLog(nextLog, logActive);
                    if (!logActive()) return;
                    if (nextLog.status === "生成中") {
                        setResults((value) => updateResultByLogId(value, log.id, { task, progress: task.progress, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                    } else {
                        setResults((value) => value.filter((item) => !imageResultMatchesLog(item, nextLog)));
                    }
                }),
            );
        } finally {
            pendingLogs.forEach((log) => pollingLogIdsRef.current.delete(log.id));
        }
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
        const nextCategories = categories.map((item) => (item.id === category.id ? { ...item, name: trimmedName } : item));
        setCategories(nextCategories);
        await categoryStore.setItem(CATEGORY_STORE_KEY, nextCategories);
        await persistImageHistory(logs, nextCategories);
        message.success("已重命名分类");
    };

    const deleteCategory = (category: GenerationCategory) => {
        modal.confirm({
            title: "删除分类",
            content: `确定删除分类「${category.name}」吗？分类内的生成结果会移至未分类。`,
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                const nextCategories = categories.filter((item) => item.id !== category.id);
                const nextLogs = logs.map((log) => ({ ...log, categoryIds: log.categoryIds.filter((id) => id !== category.id) }));
                setCategories(nextCategories);
                setLogs(nextLogs);
                await categoryStore.setItem(CATEGORY_STORE_KEY, nextCategories);
                await Promise.all(nextLogs.map((log) => logStore.setItem(log.id, serializeLog(log))));
                await persistImageHistory(nextLogs, nextCategories);
                message.success("已删除分类");
            },
        });
    };

    const updateLogCategories = async (log: GenerationLog, categoryIds: string[]) => {
        const nextLog = { ...log, categoryIds };
        const nextLogs = logs.map((item) => (item.id === log.id ? nextLog : item));
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

    const previewGenerationLog = async (log: GenerationLog) => {
        setPreviewLog(log);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        updateConfig("imageWorkflowRef", log.providerWorkflowRef);
        const nextModel = log.config.imageModel || log.model;
        const nextChannelId = resolveImageChannelId(effectiveConfig, nextModel, imageTaskChannelId(log.task), log.config.imageChannelId, log.config.activeChannelId);
        if (nextModel) updateConfig("imageModel", nextModel);
        if (nextChannelId) {
            updateConfig("imageChannelId", nextChannelId);
            updateConfig("activeChannelId", nextChannelId);
        }
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        if (log.config.apiMode) updateConfig("apiMode", log.config.apiMode);
        if (typeof log.config.streamImages === "boolean") updateConfig("streamImages", log.config.streamImages);
        if (log.config.streamPartialImages) updateConfig("streamPartialImages", log.config.streamPartialImages);
        if (typeof log.config.responseFormatB64Json === "boolean") updateConfig("responseFormatB64Json", log.config.responseFormatB64Json);
        if (typeof log.config.codexCli === "boolean") updateConfig("codexCli", log.config.codexCli);
    };

    const copyPrompt = async (text: string) => {
        await navigator.clipboard.writeText(text);
        message.success("提示词已复制");
    };

    const buildRequestSnapshot = ({ promptText = prompt, referenceItems = references, taskCount = generationCount, configOverride, workflowRef = config.imageWorkflowRef }: { promptText?: string; referenceItems?: ReferenceImage[]; taskCount?: number; configOverride?: Partial<GenerationLogConfig>; workflowRef?: WorkflowRef | null } = {}) => {
        const text = promptText.trim();
        if (!text && !workflowRef) {
            message.error("请输入生图提示词");
            return null;
        }
        const baseConfig = { ...effectiveConfig, ...configOverride };
        const requestModel = configOverride?.imageModel || configOverride?.model || model;
        const requestChannelId = resolveImageChannelId(baseConfig, requestModel, configOverride?.imageChannelId, configOverride?.activeChannelId, baseConfig.imageChannelId, baseConfig.activeChannelId);
        const requestConfig = { ...baseConfig, model: requestModel, imageModel: requestModel, activeChannelId: requestChannelId, imageChannelId: requestChannelId, count: "1" };
        if (workflowRef && !token) { message.warning("工作流生成请先登录"); return null; }
        if (!workflowRef && !isAiConfigReady(requestConfig, requestModel)) {
            message.warning("请先完成配置");
            openConfigDialog(true);
            return null;
        }
        return {
            text,
            requestConfig,
            displayConfig: buildGenerationLogConfig({ ...requestConfig, count: String(taskCount) }),
            references: [...referenceItems],
            workflowRef: workflowRef || undefined,
        };
    };

    const runGenerationTask = async (resultId: string, snapshot: RequestSnapshot) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length ? await requestEdit(snapshot.requestConfig, snapshot.text, snapshot.references) : await requestGeneration(snapshot.requestConfig, snapshot.text);
            const image = result[0];
            if (!image) throw new Error("接口没有返回图片");
            const meta = image.width && image.height && image.mimeType ? { width: image.width, height: image.height, mimeType: image.mimeType } : await readImageMeta(image.dataUrl);
            const nextImage: GeneratedImage = { ...image, durationMs: performance.now() - itemStartedAt, width: meta.width, height: meta.height, bytes: image.bytes || getDataUrlByteSize(image.dataUrl), mimeType: image.mimeType || meta.mimeType };
            setResults((value) => updateResult(value, resultId, { status: "success", image: nextImage, durationMs: nextImage.durationMs }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResult(value, resultId, { status: "failed", error: errorMessage(error), errorDetail: errorDetail(error), durationMs: performance.now() - itemStartedAt }));
            throw error;
        }
    };

    const retryResult = (result: GenerationResult) => {
        const retryChannelId = imageTaskChannelId(result.task);
        const snapshot = buildRequestSnapshot({ promptText: result.prompt, referenceItems: result.references, taskCount: 1, configOverride: { ...result.config, ...(retryChannelId ? { imageChannelId: retryChannelId, activeChannelId: retryChannelId } : {}) }, workflowRef: result.providerWorkflowRef || null });
        if (!snapshot) return;
        setResults((value) => value.filter((item) => item.id !== result.id));
        void submitGenerationBatch(snapshot);
    };

    const handleWorkflowTaskStarted = (task: WorkflowExternalTaskStart) => {
        if (usesBackendImageTasks(effectiveConfig)) {
            setResultViewMode("all");
            setActiveResultCategoryId(null);
            return;
        }
        const configSnapshot = buildGenerationLogConfig({
            ...effectiveConfig,
            ...task.config,
            model: task.model,
            imageModel: task.model,
            apiMode: task.apiMode,
            count: String(task.count),
        });
        const pendingItems: GenerationResult[] = Array.from({ length: task.count }, (_, index) => ({
            id: createWorkflowResultId(task.taskId, index),
            status: "pending",
            createdAt: task.startedAt,
            prompt: task.prompt,
            model: task.model,
            config: configSnapshot,
            references: task.references || [],
            workflowId: task.workflowId,
            workflowName: task.workflowName,
            workflowInputs: task.inputs,
            workflowTaskId: task.taskId,
        }));
        setResultViewMode("all");
        setActiveResultCategoryId(null);
        setResults((value) => [...pendingItems, ...value]);
        setNow(Date.now());
    };

    const handleWorkflowTaskSuccess = (task: WorkflowExternalTaskSuccess) => {
        setResults((value) => {
            const next = [...value];
            task.images.forEach((image, index) => {
                const resultId = createWorkflowResultId(task.taskId, index);
                const existingIndex = next.findIndex((item) => item.id === resultId);
                const nextImage: GeneratedImage = {
                    id: image.id,
                    dataUrl: image.imageUrl,
                    storageKey: image.storageKey,
                    durationMs: image.durationMs || task.durationMs,
                    width: image.width,
                    height: image.height,
                    bytes: image.bytes,
                    mimeType: image.mimeType,
                };
                if (existingIndex >= 0) {
                    next[existingIndex] = { ...next[existingIndex], status: "success", image: nextImage, durationMs: task.durationMs };
                } else {
                    next.unshift({
                        id: resultId,
                        status: "success",
                        createdAt: task.endedAt,
                        prompt: image.prompt,
                        model: effectiveConfig.imageModel || effectiveConfig.model,
                        config: buildGenerationLogConfig(effectiveConfig),
                        references: [],
                        image: nextImage,
                        durationMs: task.durationMs,
                        workflowId: image.workflowId,
                        workflowName: image.workflowName,
                        workflowTaskId: task.taskId,
                    });
                }
            });
            return next;
        });
        setResultViewMode("all");
        setActiveResultCategoryId(null);
        void Promise.all([refreshLogs(), refreshCategories()]).then(() => {
            setResults((value) => value.filter((item) => item.workflowTaskId !== task.taskId));
        });
    };

    const handleWorkflowTaskFailure = (task: WorkflowExternalTaskFailure) => {
        setResults((value) =>
            value.map((item) =>
                item.workflowTaskId === task.taskId
                    ? {
                          ...item,
                          status: "failed",
                          error: task.error,
                          durationMs: task.durationMs,
                      }
                    : item,
            ),
        );
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
            <main className={`${workbenchLayout === "side" ? "grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]" : "relative flex flex-col"} min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:overflow-hidden`}>
                {workbenchLayout === "side" ? (
                    <>
                        <WorkbenchPanel
                            layout="side"
                            currentLayout={workbenchLayout}
                            prompt={prompt}
                            references={references}
                            config={effectiveConfig}
                            model={model}
                            canGenerate={canGenerate}
                            pendingCount={pendingCount}
                            updateConfig={updateConfig}
                            openConfigDialog={openConfigDialog}
                            onLayoutChange={setWorkbenchLayout}
                            onPromptChange={setPrompt}
                            onOpenPromptLibrary={() => setPromptDialogOpen(true)}
                            onOpenAssetPicker={() => setAssetPickerOpen(true)}
                            onPastePrompt={() => void pastePromptFromClipboard()}
                            onClearPrompt={clearPrompt}
                            onPasteReferences={() => void addReferencesFromClipboard()}
                            onUploadReferences={() => fileInputRef.current?.click()}
                            onRemoveReference={(id) => void removeReference(id)}
                            onGenerate={() => void generate()}
                            uploadingCount={uploadingCount}
                        />
                        <ResultsPanel
                            results={results}
                            logs={logs}
                            categories={categories}
                            resultViewMode={resultViewMode}
                            activeCategoryId={activeResultCategoryId}
                            pendingCount={pendingCount}
                            now={now}
                            selectedLogIds={selectedLogIds}
                            activeLogId={previewLog?.id}
                            onSelectedLogIdsChange={setSelectedLogIds}
                            onCreateSession={createSession}
                            onResultViewModeChange={setResultViewMode}
                            onActiveCategoryChange={setActiveResultCategoryId}
                            onCreateCategory={createCategory}
                            onRenameCategory={(category, name) => void renameCategory(category, name)}
                            onDeleteCategory={deleteCategory}
                            onToggleLogCategory={(log, categoryId) => void toggleLogCategory(log, categoryId)}
                            onClearLogCategories={(log) => void updateLogCategories(log, [])}
                            onDeleteSelected={() => setDeleteConfirmOpen(true)}
                            onDeleteLog={deleteLog}
                            onPreviewLog={(log) => void previewGenerationLog(log)}
                            onRetryLog={(log) => void retryLog(log)}
                            onCopyPrompt={copyPrompt}
                            onEdit={addResultToReferences}
                            onMaskEdit={openMaskEdit}
                            onDownload={downloadImage}
                            onSaveAsset={saveResultToAssets}
                            syncingImageIds={syncingImageIds}
                            onSyncResult={syncResultImage}
                            onSyncLog={syncLogImage}
                            onRetry={retryResult}
                        />
                    </>
                ) : (
                    <>
                        <ResultsPanel
                            className="min-h-[360px] flex-1 pb-40 lg:pb-44"
                            results={results}
                            logs={logs}
                            categories={categories}
                            resultViewMode={resultViewMode}
                            activeCategoryId={activeResultCategoryId}
                            pendingCount={pendingCount}
                            now={now}
                            selectedLogIds={selectedLogIds}
                            activeLogId={previewLog?.id}
                            onSelectedLogIdsChange={setSelectedLogIds}
                            onCreateSession={createSession}
                            onResultViewModeChange={setResultViewMode}
                            onActiveCategoryChange={setActiveResultCategoryId}
                            onCreateCategory={createCategory}
                            onRenameCategory={(category, name) => void renameCategory(category, name)}
                            onDeleteCategory={deleteCategory}
                            onToggleLogCategory={(log, categoryId) => void toggleLogCategory(log, categoryId)}
                            onClearLogCategories={(log) => void updateLogCategories(log, [])}
                            onDeleteSelected={() => setDeleteConfirmOpen(true)}
                            onDeleteLog={deleteLog}
                            onPreviewLog={(log) => void previewGenerationLog(log)}
                            onRetryLog={(log) => void retryLog(log)}
                            onCopyPrompt={copyPrompt}
                            onEdit={addResultToReferences}
                            onMaskEdit={openMaskEdit}
                            onDownload={downloadImage}
                            onSaveAsset={saveResultToAssets}
                            syncingImageIds={syncingImageIds}
                            onSyncResult={syncResultImage}
                            onSyncLog={syncLogImage}
                            onRetry={retryResult}
                        />
                        <WorkbenchPanel
                            layout="bottom"
                            currentLayout={workbenchLayout}
                            prompt={prompt}
                            references={references}
                            config={effectiveConfig}
                            model={model}
                            canGenerate={canGenerate}
                            pendingCount={pendingCount}
                            updateConfig={updateConfig}
                            openConfigDialog={openConfigDialog}
                            onLayoutChange={setWorkbenchLayout}
                            onPromptChange={setPrompt}
                            onOpenPromptLibrary={() => setPromptDialogOpen(true)}
                            onOpenAssetPicker={() => setAssetPickerOpen(true)}
                            onPastePrompt={() => void pastePromptFromClipboard()}
                            onClearPrompt={clearPrompt}
                            onPasteReferences={() => void addReferencesFromClipboard()}
                            onUploadReferences={() => fileInputRef.current?.click()}
                            onRemoveReference={(id) => void removeReference(id)}
                            onGenerate={() => void generate()}
                            uploadingCount={uploadingCount}
                        />
                    </>
                )}
            </main>
            <button
                ref={workflowButtonRef}
                type="button"
                className="fixed z-50 inline-flex touch-none select-none items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-3 text-sm font-semibold text-foreground shadow-lg ring-1 ring-border backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-accent"
                style={{
                    left: (typeof window === "undefined" ? defaultWorkflowButtonPosition() : clampWorkflowButtonPosition(workflowButtonPosition.x || workflowButtonPosition.y ? workflowButtonPosition : defaultWorkflowButtonPosition())).x,
                    top: (typeof window === "undefined" ? defaultWorkflowButtonPosition() : clampWorkflowButtonPosition(workflowButtonPosition.x || workflowButtonPosition.y ? workflowButtonPosition : defaultWorkflowButtonPosition())).y
                }}
                onPointerDown={handleWorkflowButtonPointerDown}
                onPointerMove={handleWorkflowButtonPointerMove}
                onPointerUp={handleWorkflowButtonPointerUp}
                onClick={() => {
                    if (workflowButtonDragRef.current?.moved) {
                        workflowButtonDragRef.current = null;
                        return;
                    }
                    workflowButtonDragRef.current = null;
                    setWorkflowDrawerOpen(true);
                }}
            >
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.9)]" />
                <WandSparkles className="size-4 text-sky-500 dark:text-sky-300" />
                工作流
            </button>
            <Drawer title="创作工作流" placement="right" size="min(1120px, 92vw)" open={workflowDrawerOpen}  onClose={() => setWorkflowDrawerOpen(false)} styles={{ body: { padding: 0 } }} destroyOnHidden={false}>
                <CreativeWorkflowWorkspace
                    embedded
                    hideTaskList
                    onWorkflowTaskStarted={handleWorkflowTaskStarted}
                    onWorkflowTaskSuccess={handleWorkflowTaskSuccess}
                    onWorkflowTaskFailure={handleWorkflowTaskFailure}
                    onGenerationLogSaved={() => {
                        void (async () => {
                            const nextCategories = await readStoredCategories();
                            const nextLogs = await readStoredLogs();
                            setCategories(nextCategories);
                            setLogs(nextLogs);
                            await persistImageHistory(nextLogs, nextCategories);
                        })();
                    }}
                />
            </Drawer>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            {maskEditTarget ? (
                <CanvasNodeMaskEditDialog
                    dataUrl={maskEditTarget.image.dataUrl}
                    open={maskEditTarget.open}
                    config={effectiveConfig}
                    model={maskEditTarget.model}
                    channelId={maskEditTarget.channelId}
                    onModelChange={(nextModel, channelId) => setMaskEditTarget((value) => value ? { ...value, model: nextModel, channelId: channelId || "" } : value)}
                    onMissingConfig={() => openConfigDialog(true)}
                    onClose={() => setMaskEditTarget((value) => value ? { ...value, open: false } : value)}
                    onConfirm={(payload) => void submitMaskEdit(payload)}
                />
            ) : null}
            <Modal title="删除生成记录" open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除选中的 {selectedLogIds.length} 条生成记录吗？
            </Modal>
        </div>
    );
}

const quickQualityOptions = [
    { value: "auto", label: "自动" },
    { value: "high", label: "高 · 4K" },
    { value: "medium", label: "中 · 2K" },
    { value: "low", label: "低 · 1K" },
];

function WorkbenchPanel({
    layout,
    currentLayout,
    prompt,
    references,
    config,
    model,
    canGenerate,
    pendingCount,
    updateConfig,
    openConfigDialog,
    onLayoutChange,
    onPromptChange,
    onOpenPromptLibrary,
    onOpenAssetPicker,
    onPastePrompt,
    onClearPrompt,
    onPasteReferences,
    onUploadReferences,
    onRemoveReference,
    onGenerate,
    uploadingCount,
}: {
    layout: WorkbenchLayout;
    currentLayout: WorkbenchLayout;
    prompt: string;
    references: ReferenceImage[];
    config: AiConfig;
    model: string;
    canGenerate: boolean;
    pendingCount: number;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    onPromptChange: (value: string) => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: () => void;
    onPastePrompt: () => void;
    onClearPrompt: () => void;
    onPasteReferences: () => void;
    onUploadReferences: () => void;
    onRemoveReference: (id: string) => void;
    onGenerate: () => void;
    uploadingCount: number;
}) {
    const [bottomSettingsCollapsed, setBottomSettingsCollapsed] = useState(true);

    if (layout === "bottom") {
        return (
            <BottomPromptComposer
                prompt={prompt}
                placeholder="描述你想生成的图片，可输入 @ 来指定参考图..."
                onPromptChange={onPromptChange}
                canGenerate={canGenerate}
                pendingCount={pendingCount}
                settingsOpen={!bottomSettingsCollapsed}
                onToggleSettings={() => setBottomSettingsCollapsed(!bottomSettingsCollapsed)}
                onClearPrompt={onClearPrompt}
                onOpenPromptLibrary={onOpenPromptLibrary}
                onOpenAssetPicker={onOpenAssetPicker}
                onSwitchToSide={() => onLayoutChange("side")}
                onGenerate={onGenerate}
            >
                        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[1.3fr_1.1fr_0.9fr_0.9fr_0.9fr_0.85fr_0.8fr_0.8fr_auto_auto] ${bottomSettingsCollapsed ? "hidden lg:grid" : "grid"}`}>
                            <label className="grid gap-1 text-xs text-muted-foreground">
                                模型
                                <ModelPicker
                                    config={config}
                                    value={model}
                                    capability="image"
                                    channelId={config.imageChannelId}
                                    workflowRef={config.imageWorkflowRef}
                                    onWorkflowChange={(value) => updateConfig("imageWorkflowRef", value)}
                                    onChange={(value, channelId) => {
                                        updateConfig("imageModel", value);
                                        if (channelId) updateConfig("imageChannelId", channelId);
                                    }}
                                    className="canvas-compact-control !h-11 !rounded-xl"
                                    onMissingConfig={() => openConfigDialog(false)}
                                    fullWidth
                                />
                            </label>
                            <label className="grid gap-1 text-xs text-muted-foreground">
                                接口模式
                                <div className="flex h-11 items-center rounded-xl border border-border bg-background px-2.5">
                                    <Segmented
                                        size="small"
                                        className="canvas-config-mode !rounded-md !p-0.5 w-full"
                                        value={config.apiMode}
                                        onChange={(value) => updateConfig("apiMode", value as "images" | "responses" | "chat")}
                                        options={[
                                            { value: "images", label: "images" },
                                            { value: "responses", label: "responses" },
                                            { value: "chat", label: "chat" },
                                        ]}
                                    />
                                </div>
                            </label>
                            <QuickSelect label="尺寸" value={config.size || "auto"} options={imageSizeOptions} onChange={(value) => updateConfig("size", value)} />
                            <QuickSelect label="质量" value={config.quality || "auto"} options={quickQualityOptions} onChange={(value) => updateConfig("quality", value)} />
                            <QuickNumber label="数量" value={config.count || "1"} min={1} max={10} onChange={(value) => updateConfig("count", value)} />
                            <ReferenceQuickActions references={references} onUploadReferences={onUploadReferences} />
                            <Button type="primary" className="h-11 min-w-28 rounded-xl hidden lg:inline-flex" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                                {pendingCount ? `${pendingCount} 生成中` : "开始创作"}
                            </Button>
                        </div>
                {references.length || uploadingCount > 0 ? <ReferenceStrip references={references} compact onRemoveReference={onRemoveReference} uploadingCount={uploadingCount} /> : null}
            </BottomPromptComposer>
        );
    }

    return (
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:min-h-0">
            <div className="shrink-0 p-4 pb-3">
                <WorkbenchHeader title="生图工作台" currentLayout={currentLayout} onLayoutChange={onLayoutChange} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
                <WorkbenchPromptSection prompt={prompt} placeholder="描述画面主体、风格、构图、光线和用途" onPromptChange={onPromptChange} onPastePrompt={onPastePrompt} onClearPrompt={onClearPrompt} onOpenPromptLibrary={onOpenPromptLibrary} onOpenAssetPicker={onOpenAssetPicker} />

                <WorkbenchSection title="参考图" count={references.length}>
                    <div className="flex flex-wrap gap-1">
                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteReferences}>剪切板</Button>
                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={onOpenAssetPicker}>从素材库选择</Button>
                    </div>
                    <ReferenceStrip references={references} onRemoveReference={onRemoveReference} uploadingCount={uploadingCount} />
                </WorkbenchSection>

                <div className="space-y-3">
                    <GenerationSettings config={config} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </div>
            <div className="shrink-0 border-t border-border p-4">
                <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                    {pendingCount ? `继续提交（${pendingCount} 个生成中）` : "开始生成"}
                </Button>
            </div>
        </div>
    );
}

function ReferenceStrip({ references, compact = false, className = "", onRemoveReference, uploadingCount = 0 }: { references: ReferenceImage[]; compact?: boolean; className?: string; onRemoveReference: (id: string) => void; uploadingCount?: number }) {
    return (
        <ReferenceStripShell compact={compact} className={className}>
            {references.map((item) => (
                <div key={item.id} className={`${compact ? "size-12" : "size-20"} group relative shrink-0 overflow-hidden rounded-md border border-border`}>
                    <Image
                        src={item.dataUrl || undefined}
                        alt={item.name}
                        className="size-full object-cover cursor-pointer"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        preview={{
                            mask: "点击预览",
                        }}
                    />
                    <button type="button" className="absolute right-1 top-1 hidden z-10 size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={() => onRemoveReference(item.id)} aria-label="移除参考图">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {Array.from({ length: uploadingCount }).map((_, i) => (
                <div key={`loading-${i}`} className={`${compact ? "size-12" : "size-20"} shrink-0 flex items-center justify-center rounded-md border border-border bg-muted/50`}>
                    <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
                </div>
            ))}
            {!references.length && !uploadingCount ? <div className="flex min-w-full items-center justify-center text-sm text-muted-foreground">暂无参考图</div> : null}
        </ReferenceStripShell>
    );
}

function ReferenceQuickActions({ references, onUploadReferences }: { references: ReferenceImage[]; onUploadReferences: () => void }) {
    return (
        <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-background px-2">
            {references[0] ? <img loading="lazy" decoding="async" src={references[0].dataUrl || undefined} alt={references[0].name} className="size-7 rounded object-cover" /> : null}
            {references.length ? <span className="min-w-7 text-xs text-muted-foreground">{references.length} 张</span> : null}
            <Button size="small" type="text" icon={<Upload className="size-3.5" />} onClick={onUploadReferences} />
        </div>
    );
}

function ResultsPanel({
    className = "",
    results,
    logs,
    categories,
    resultViewMode,
    activeCategoryId,
    pendingCount,
    now,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onResultViewModeChange,
    onActiveCategoryChange,
    onCreateCategory,
    onRenameCategory,
    onDeleteCategory,
    onToggleLogCategory,
    onClearLogCategories,
    onDeleteSelected,
    onDeleteLog,
    onPreviewLog,
    onRetryLog,
    onCopyPrompt,
    onEdit,
    onMaskEdit,
    onDownload,
    onSaveAsset,
    syncingImageIds,
    onSyncResult,
    onSyncLog,
    onRetry,
}: {
    className?: string;
    results: GenerationResult[];
    logs: GenerationLog[];
    categories: GenerationCategory[];
    resultViewMode: ResultViewMode;
    activeCategoryId: string | null;
    pendingCount: number;
    now: number;
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onResultViewModeChange: (mode: ResultViewMode) => void;
    onActiveCategoryChange: (id: string | null) => void;
    onCreateCategory: (name: string) => Promise<GenerationCategory | null>;
    onRenameCategory: (category: GenerationCategory, name: string) => void;
    onDeleteCategory: (category: GenerationCategory) => void;
    onToggleLogCategory: (log: GenerationLog, categoryId: string) => void;
    onClearLogCategories: (log: GenerationLog) => void;
    onDeleteSelected: () => void;
    onDeleteLog: (log: GenerationLog) => void;
    onPreviewLog: (log: GenerationLog) => void;
    onRetryLog: (log: GenerationLog) => void;
    onCopyPrompt: (text: string) => void | Promise<void>;
    onEdit: (image: GeneratedImage, index: number) => void;
    onMaskEdit: (log: GenerationLog, image: GeneratedImage) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    syncingImageIds: string[];
    onSyncResult: (resultId: string, image: GeneratedImage, index: number) => void;
    onSyncLog: (log: GenerationLog, image: GeneratedImage, index: number) => void;
    onRetry: (result: GenerationResult) => void;
}) {
    const { message } = App.useApp();
    const [creatingCategory, setCreatingCategory] = useState(false);
    const [categoryName, setCategoryName] = useState("");
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision, getImagePreviewRevision);
    const liveImageIds = new Set(results.map((result) => result.image?.id).filter((id): id is string => Boolean(id)));
    const liveLogIds = new Set(results.flatMap(imageResultIdentityKeys));
    const baseVisibleLogs = logs.filter((log) => !imageLogIdentityKeys(log).some((key) => liveLogIds.has(key)) && !log.images.some((image) => liveImageIds.has(image.id)));
    const categoryGroups = categories.map((category) => ({ category, logs: baseVisibleLogs.filter((log) => log.categoryIds.includes(category.id)) }));
    const activeCategory = activeCategoryId ? categories.find((category) => category.id === activeCategoryId) : null;
    const visibleLogs = resultViewMode === "category" ? (activeCategoryId ? baseVisibleLogs.filter((log) => log.categoryIds.includes(activeCategoryId)) : baseVisibleLogs.filter((log) => !log.categoryIds.length)) : baseVisibleLogs;
    const totalCount = results.length + (resultViewMode === "category" ? (activeCategoryId ? visibleLogs.length : categories.length + visibleLogs.length) : visibleLogs.length);
    const shouldShowGrid = totalCount > 0;
    const allVisibleLogsSelected = Boolean(visibleLogs.length) && visibleLogs.every((log) => selectedLogIds.includes(log.id));
    const selectedImages = visibleLogs.flatMap((log) => selectedLogIds.includes(log.id) ? log.images.filter((image) => Boolean(image.dataUrl)) : []);
    const toggleVisibleLogs = () => onSelectedLogIdsChange(allVisibleLogsSelected ? selectedLogIds.filter((id) => !visibleLogs.some((log) => log.id === id)) : Array.from(new Set([...selectedLogIds, ...visibleLogs.map((log) => log.id)])));
    const createCategory = async () => {
        const name = categoryName.trim();
        if (!name) {
            message.error("请输入分类名称");
            return;
        }
        const category = await onCreateCategory(name);
        if (!category) return;
        setCategoryName("");
        setCreatingCategory(false);
    };

    useEffect(() => {
        if (activeCategoryId && !categories.some((category) => category.id === activeCategoryId)) onActiveCategoryChange(null);
    }, [activeCategoryId, categories, onActiveCategoryChange]);

    useEffect(() => {
        [...results.flatMap((result) => result.image ? [result.image] : []), ...logs.flatMap((log) => log.images)]
            .forEach((image) => void ensureImagePreview(`image-result:${image.id}`, image.dataUrl, image.storageKey));
    }, [logs, results]);

    return (
        <ResultsPanelShell
            className={className}
            title={activeCategory ? activeCategory.name : "全部结果"}
            count={totalCount}
            pendingCount={pendingCount}
            actions={
                <>
                    {activeCategory ? (
                        <Button size="small" onClick={() => onActiveCategoryChange(null)}>
                            返回分类
                        </Button>
                    ) : null}
                    <div className="flex shrink-0 rounded-lg border border-border bg-muted p-1">
                        <Button
                            size="small"
                            type={resultViewMode === "all" ? "primary" : "text"}
                            onClick={() => {
                                onActiveCategoryChange(null);
                                onResultViewModeChange("all");
                            }}
                        >
                            全部展示
                        </Button>
                        <Button size="small" type={resultViewMode === "category" ? "primary" : "text"} onClick={() => onResultViewModeChange("category")}>
                            分类展示
                        </Button>
                    </div>
                    <ResultsToolbarActions
                        onNew={resultViewMode === "category" ? () => setCreatingCategory(true) : onCreateSession}
                        newLabel={resultViewMode === "category" ? "新建分类" : "新建"}
                        onToggleSelectAll={toggleVisibleLogs}
                        selectAllLabel={allVisibleLogsSelected ? "取消" : "全选"}
                        selectAllDisabled={!visibleLogs.length}
                        onDownload={() => selectedImages.forEach(onDownload)}
                        downloadDisabled={!selectedImages.length}
                        onDelete={onDeleteSelected}
                        deleteDisabled={!selectedLogIds.length}
                    />
                </>
            }
            empty={
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center lg:min-h-[560px]">
                    <ImagePlus className="mb-4 size-11 text-muted-foreground" />
                    <EmptyState title="还没有生成图片" description="输入提示词并开始生成，结果会出现在这里。" />
                </div>
            }
        >
            {shouldShowGrid ? (
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {results.map((result, index) =>
                        result.status === "success" && result.image ? (
                            <ResultImageCard key={result.id} result={result} image={result.image} index={index} onCopyPrompt={onCopyPrompt} onEdit={onEdit} onDownload={onDownload} onSaveAsset={onSaveAsset} syncing={syncingImageIds.includes(result.image.id)} onSync={(image) => onSyncResult(result.id, image, index)} />
                        ) : result.status === "failed" ? (
                            <FailedImageCard key={result.id} result={result} error={result.error || "生成失败"} onCopyPrompt={onCopyPrompt} onRetry={() => onRetry(result)} />
                        ) : (
                            <PendingImageCard key={result.id} result={result} now={now} onCopyPrompt={onCopyPrompt} />
                        ),
                    )}
                    {resultViewMode === "category" ? (
                        <>
                            {!activeCategoryId
                                ? categoryGroups.map(({ category, logs: categoryLogs }) => (
                                      <CategoryCard key={category.id} category={category} logs={categoryLogs} onRename={onRenameCategory} onDelete={onDeleteCategory} onOpen={() => onActiveCategoryChange(category.id)} />
                                  ))
                                : null}
                        </>
                    ) : null}
                    {visibleLogs.map((log, index) => (
                        <HistoryLogCard
                            key={log.id}
                            log={log}
                            categories={categories}
                            index={index}
                            selected={selectedLogIds.includes(log.id)}
                            active={activeLogId === log.id}
                            onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                            onDelete={() => onDeleteLog(log)}
                            onToggleCategory={(categoryId) => onToggleLogCategory(log, categoryId)}
                            onClearCategories={() => onClearLogCategories(log)}
                            onCreateCategory={onCreateCategory}
                            onPreview={() => onPreviewLog(log)}
                            onRetry={() => onRetryLog(log)}
                            onCopyPrompt={onCopyPrompt}
                            onEdit={onEdit}
                            onMaskEdit={(image) => onMaskEdit(log, image)}
                            onDownload={onDownload}
                            onSaveAsset={onSaveAsset}
                            syncing={syncingImageIds.includes(log.images.find((image) => Boolean(image.dataUrl))?.id || "")}
                            onSync={(image) => onSyncLog(log, image, index)}
                        />
                    ))}
                </div>
            ) : null}
            <Modal title="新建分类" open={creatingCategory} onCancel={() => setCreatingCategory(false)} onOk={() => void createCategory()} okText="创建" cancelText="取消" destroyOnHidden>
                <Input value={categoryName} autoFocus placeholder="输入分类名称" onChange={(event) => setCategoryName(event.target.value)} onPressEnter={() => void createCategory()} />
            </Modal>
        </ResultsPanelShell>
    );
}

function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-3">
            <section className="overflow-hidden rounded-lg border border-border bg-background">
                <div className="px-3 py-2">
                    <span className="font-medium text-sm">模型</span>
                </div>
                <div className="border-t border-border p-3 space-y-2">
                    <ModelPicker config={config} value={model} capability="image" channelId={config.imageChannelId} workflowRef={config.imageWorkflowRef} onWorkflowChange={(value) => updateConfig("imageWorkflowRef", value)} onChange={(value, channelId) => { updateConfig("imageModel", value); if (channelId) updateConfig("imageChannelId", channelId); }} fullWidth onMissingConfig={() => openConfigDialog(false)} />
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="text-xs opacity-75">接口模式</div>
                        <Segmented
                            size="small"
                            className="canvas-config-mode !rounded-md !p-0.5"
                            value={config.apiMode}
                            onChange={(value) => updateConfig("apiMode", value as "images" | "responses" | "chat")}
                            options={[
                                { value: "images", label: "images" },
                                { value: "responses", label: "responses" },
                                { value: "chat", label: "chat" },
                            ]}
                        />
                    </div>
                </div>
            </section>
            <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-3" maxCount={10} />
        </div>
    );
}

function ResultImageCard({
    result,
    image,
    index,
    onCopyPrompt,
    onEdit,
    onDownload,
    onSaveAsset,
    syncing,
    onSync,
}: {
    result: GenerationResult;
    image: GeneratedImage;
    index: number;
    onCopyPrompt: (text: string) => void | Promise<void>;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    syncing: boolean;
    onSync: (image: GeneratedImage) => void;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-background transition-[border-color,box-shadow] hover:border-border/70 hover:shadow-sm">
            <div className="relative aspect-[4/3] bg-muted">
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    {!image.storageKey?.startsWith("server:") ? <Tag className="m-0 text-[10px]" color="gold">临时URL</Tag> : null}
                    <Tag className="m-0 text-[10px]" color="blue">新生成</Tag>
                </div>
                <ReferenceThumbnailOverlay references={result.references} className="left-1.5 top-1.5" />
                <Image src={previewUrlFor(`image-result:${image.id}`, image.storageKey || image.dataUrl) || image.dataUrl} preview={{ src: image.dataUrl }} alt={`生成结果 ${index + 1}`} className="aspect-[4/3] object-cover" />
            </div>
            <TaskResultInfo prompt={result.prompt} tags={<TaskTags item={result} />} onCopyPrompt={onCopyPrompt} />
            <ResultMediaMeta
                meta={
                    <>
                        <span>
                            {image.width}x{image.height}
                        </span>
                        <span>{formatBytes(image.bytes)}</span>
                        <span>{formatDuration(image.durationMs)}</span>
                    </>
                }
                actions={
                    <>
                        <Button size="small" title="同步到云端存储" aria-label="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={image.storageKey?.startsWith("server:")} onClick={() => onSync(image)} />
                        <Button size="small" aria-label="保存到我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)} />
                        <Button size="small" aria-label="继续编辑" icon={<PenLine className="size-3.5" />} onClick={() => void onEdit(image, index)} />
                        <Button size="small" aria-label="下载图片" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)} />
                    </>
                }
            />
        </div>
    );
}

function PendingImageCard({ result, now, onCopyPrompt }: { result: GenerationResult; now: number; onCopyPrompt: (text: string) => void | Promise<void> }) {
    return (
        <div className="overflow-hidden rounded-lg border border-dashed border-border bg-muted/50">
            <div className="relative aspect-[4/3]">
                <div
                    className="absolute inset-0 opacity-60"
                    style={{
                        backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                        backgroundSize: "16px 16px",
                    }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground">
                    <LoaderCircle className="size-6 animate-spin" />
                    <span>生成中</span>
                    <span className="rounded-full bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">{formatDuration(Math.max(0, now - result.createdAt))}</span>
                </div>
            </div>
            <TaskResultInfo prompt={result.prompt} tags={<TaskTags item={{ ...result, durationMs: Math.max(0, now - result.createdAt) }} />} onCopyPrompt={onCopyPrompt} />
        </div>
    );
}

function FailedImageCard({ result, error, onCopyPrompt, onRetry }: { result: GenerationResult; error: string; onCopyPrompt: (text: string) => void | Promise<void>; onRetry: () => void }) {
    return (
        <FailedResultCard
            mediaClassName="aspect-[4/3]"
            references={result.references}
            error={error}
            detail={result.errorDetail || error}
            info={<TaskResultInfo prompt={result.prompt} tags={<TaskTags item={result} />} error={error} onCopyPrompt={onCopyPrompt} />}
            onRetry={onRetry}
        />
    );
}

function TaskTags({ item }: { item: GenerationResult }) {
    return (
        <>
            {item.workflowName ? (
                <Tag className="m-0" color="cyan">
                    工作流 {item.workflowName}
                </Tag>
            ) : null}
            <Tag className="m-0">{formatTaskTime(item.createdAt)}</Tag>
            <Tag className="m-0">{item.model}</Tag>
            <Tag className="m-0">{item.config.apiMode === "chat" ? "Chat" : item.config.apiMode === "responses" ? "Responses" : "Images"}</Tag>
            <Tag className="m-0">{item.config.size || "auto"}</Tag>
            <Tag className="m-0">{item.config.quality || "auto"}</Tag>
            {item.config.apiMode !== "chat" && item.config.streamImages ? <Tag className="m-0">流式 {item.config.streamPartialImages || "1"}</Tag> : null}
            {item.durationMs ? <Tag className="m-0">{formatDuration(item.durationMs)}</Tag> : null}
        </>
    );
}
