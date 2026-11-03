"use client";

import {
    ClipboardPaste,
    FolderPlus,
    Sparkles,
    Upload,
    WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { App, Button, Drawer, Modal, Segmented } from "antd";
import { saveAs } from "file-saver";

import { imageSizeOptions } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { WorkbenchHeader, type WorkbenchLayout } from "@/components/workbench-header";
import { PunkAura } from "@/components/ui/punk-aura";
import { QuickNumber, QuickSelect } from "@/components/workbench-controls";
import { LoadingState } from "@/components/ui/state-panel";
import type { GeneratedImage, GenerationResult, GenerationLog, GenerationLogConfig, RequestSnapshot, GenerationCategory, ResultViewMode, WorkflowPollContext, UpdateAiConfig } from "./history";
import { GenerationSettings, ReferenceQuickActions, ReferenceStrip } from "./components/workbench-controls";
import { ResultsPanel } from "./components/results-panel";
import { useImageTaskPolling } from "./hooks/use-image-task-polling";
import { useImageGeneration } from "./hooks/use-image-generation";
import { CATEGORY_STORE_KEY, logStore, categoryStore, createPendingResult, shouldDeleteReferenceFile, disposableLogStorageKeys, createWorkflowResultId, updateResult, updateResultByLogId, mergePendingLogResults, imageTaskIdentityKeys, imageLogIdentityKeys, dedupeGenerationLogs, imageLogTaskId, isRecoverableImageTask, mergeBackendImageTasks, errorMessage, errorDetail, readStoredLogs, readStoredCategories, replaceStoredImageHistory, withWorkflowLogCategories, mergeGenerationLogs, serializeLog, imageTaskChannelId, resolveImageChannelId, buildGenerationLogConfig, imageExtension, clampWorkflowButtonPosition, buildLog } from "./history";
import { BottomPromptComposer, WorkbenchPromptSection, WorkbenchSection } from "@/components/workbench/prompt-composer";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/app/(user)/canvas/components/canvas-node-mask-edit-dialog";
import { IMAGE_MASK_EDIT_PROMPT_PREFIX } from "@/lib/image-reference-prompt";
import type { WorkflowExternalTaskFailure, WorkflowExternalTaskStart, WorkflowExternalTaskSuccess } from "@/components/workflows/creative-workflow-workspace";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { nanoid } from "nanoid";
import { createCanvasImageTask, deleteCanvasImageTask, listCanvasImageTasks, type CanvasImageTask } from "@/services/api/image";
import { submitWorkflowTask } from "@/services/api/workflow-generation";
import type { WorkflowRef } from "@/lib/workflow-channel";
import { deleteImageGenerationLogs, fetchImageGenerationLogs, saveImageGenerationLogs } from "@/services/api/generation-logs";
import { deleteImagePreviews, deleteStoredImages, imageToDataUrl, resolveImageUrl, uploadImage, uploadRemoteImageToServer } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";

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
    const loadAccountImageHistoryRef = useRef<() => Promise<GenerationLog[] | undefined>>(async () => undefined);
    const syncBackendImageTasksRef = useRef<(baseLogs?: GenerationLog[]) => Promise<GenerationLog[]>>(async () => []);
    const pollPendingLogsOnceRef = useRef<(sourceLogs: GenerationLog[], context: WorkflowPollContext) => void>(() => undefined);
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
    pollPendingLogsOnceRef.current = pollPendingLogsOnce;

    useEffect(() => {
        void refreshCategories();
        try {
            const storedLayout = window.localStorage?.getItem(WORKBENCH_LAYOUT_KEY);
            if (storedLayout === "side" || storedLayout === "bottom") setWorkbenchLayoutState(storedLayout);
            const storedViewMode = window.localStorage?.getItem(RESULT_VIEW_MODE_KEY);
            if (storedViewMode === "all" || storedViewMode === "category") setResultViewModeState(storedViewMode);
            const storedButtonPosition = JSON.parse(window.localStorage?.getItem(WORKFLOW_BUTTON_POSITION_KEY) || "null") as { x?: number; y?: number } | null;
            // 没有自定义位置时保持 (0,0)，由固定右下角的 CSS 兜底，避免 SSR/CSR 样式不一致导致 hydration 失配。
            if (typeof storedButtonPosition?.x === "number" && typeof storedButtonPosition?.y === "number") setWorkflowButtonPosition(clampWorkflowButtonPosition(storedButtonPosition));
        } catch {
            // Local storage can be unavailable in restricted browser contexts.
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
            void loadAccountImageHistoryRef.current().then((items) => syncBackendImageTasksRef.current(items));
            return;
        }
        void refreshLogs().then((items) => syncBackendImageTasksRef.current(items));
    }, [isUserReady, token]);

    useEffect(() => {
        if (!pendingCount && !pendingLogCount) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [pendingCount, pendingLogCount]);

    useEffect(() => {
        const context = pollContextRef.current;
        if (!pendingLogCount || !context) return;
        pollPendingLogsOnceRef.current(logsRef.current, context);
        const timer = window.setInterval(() => pollPendingLogsOnceRef.current(logsRef.current, context), IMAGE_TASK_POLL_INTERVAL_MS);
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
        const rect = event.currentTarget.getBoundingClientRect();
        const origin = workflowButtonPosition.x || workflowButtonPosition.y ? workflowButtonPosition : { x: rect.left, y: rect.top };
        if (!workflowButtonPosition.x && !workflowButtonPosition.y) {
            // 把 CSS 兜底位置固化到 inline 样式，拖动时不会被 right/bottom 拉伸。
            event.currentTarget.style.left = `${rect.left}px`;
            event.currentTarget.style.top = `${rect.top}px`;
            event.currentTarget.style.right = "auto";
            event.currentTarget.style.bottom = "auto";
        }
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
        const pendingLogs = Array.from({ length: taskCount }, () => {
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
                    { ...snapshot.requestConfig, seedIndex: index, seedCount: taskCount, count: "1" },
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
                    },
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

    loadAccountImageHistoryRef.current = loadAccountImageHistory;
    syncBackendImageTasksRef.current = syncBackendImageTasks;

    const { pollImageTaskLogsOnce } = useImageTaskPolling({
        pollingLogIdsRef,
        imageTaskConfig,
        saveLog,
        setResults,
        onError: message.error,
    });

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

    const { runGenerationTask } = useImageGeneration({ setResults });

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
        <div className="flex h-full flex-col overflow-hidden bg-transparent text-foreground">
            <main className={`${workbenchLayout === "side" ? "grid grid-cols-1 lg:grid-cols-[minmax(300px,376px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]" : "relative flex flex-col"} min-h-0 flex-1 gap-4 overflow-y-auto p-3 lg:overflow-hidden lg:p-4`}>
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
                className={`fixed z-40 inline-flex touch-none select-none items-center gap-2 rounded-lg border border-border bg-background/90 px-3.5 py-2.5 text-[13px] font-medium text-foreground shadow-lg backdrop-blur-xl transition hover:border-acid/45 hover:bg-accent ${workflowButtonPosition.x || workflowButtonPosition.y ? "" : "bottom-6 right-6"}`}
                style={workflowButtonPosition.x || workflowButtonPosition.y ? { left: workflowButtonPosition.x, top: workflowButtonPosition.y } : undefined}
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
                <span className="size-1.5 rounded-full bg-acid shadow-[0_0_10px_var(--acid)]" aria-hidden />
                <WandSparkles className="size-4 text-acid" />
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
        <div className="punk-panel flex min-h-[420px] flex-col overflow-hidden rounded-xl lg:min-h-0">
            <div className="relative shrink-0 overflow-hidden border-b border-border/70 px-4 py-3">
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><PunkAura className="punk-aura opacity-60" /></div>
                <div className="relative"><WorkbenchHeader title="生图工作台" currentLayout={currentLayout} onLayoutChange={onLayoutChange} /></div>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
            <div className="shrink-0 border-t border-border/70 px-4 py-3">
                <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                    {pendingCount ? `继续提交（${pendingCount} 个生成中）` : "开始生成"}
                </Button>
            </div>
        </div>
    );
}
