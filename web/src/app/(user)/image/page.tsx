"use client";

import { WandSparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { App, Drawer } from "antd";

import type { WorkbenchLayout } from "@/components/workbench-header";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { PageFrame } from "@/components/ui/page-frame";
import { LoadingState } from "@/components/ui/state-panel";
import { WORKBENCH_BOTTOM_RESULTS_CLASS, WorkbenchShell } from "@/components/workbench/workbench-shell";
import type { GeneratedImage, GenerationResult, GenerationLog, GenerationLogConfig, GenerationCategory, ResultViewMode, WorkflowPollContext } from "./history";
import { ImageWorkbenchPanel } from "./components/workbench-panel";
import { ResultsPanel } from "./components/results-panel";
import { useImageTaskPolling } from "./hooks/use-image-task-polling";
import { useImageTaskStop } from "./hooks/use-image-task-stop";
import { useImageGeneration } from "./hooks/use-image-generation";
import { useImageBatchGeneration } from "./hooks/use-image-batch-generation";
import { useImageHistorySync } from "./hooks/use-image-history-sync";
import { useImageResultActions } from "./hooks/use-image-result-actions";
import { logStore, shouldDeleteReferenceFile, createWorkflowResultId, mergePendingLogResults, imageLogIdentityKeys, dedupeGenerationLogs, readStoredLogs, readStoredCategories, serializeLog, imageTaskChannelId, resolveImageChannelId, buildGenerationLogConfig, imageExtension, clampWorkflowButtonPosition } from "./history";
import { readWorkbenchDraft, saveWorkbenchDraft } from "./draft";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/assets/asset-picker-modal";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/app/(user)/canvas/components/canvas-node-mask-edit-dialog";
import { IMAGE_MASK_EDIT_PROMPT_PREFIX } from "@/lib/image-reference-prompt";
import type { WorkflowExternalTaskFailure, WorkflowExternalTaskStart, WorkflowExternalTaskSuccess } from "@/components/workflows/creative-workflow-types";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { nanoid } from "nanoid";
import { deleteStoredImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { WorkflowRef } from "@/lib/workflow-channel";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import { errorMessage as toErrorMessage } from "@/lib/utils";
import { blobsFromClipboardItems, readClipboardBlobs } from "@/lib/clipboard";
import { usePasteClipboardText } from "@/hooks/use-paste-clipboard-text";
import { useCopyText } from "@/hooks/use-copy-text";
import { WORKBENCH_LAYOUT_KEY } from "@/lib/storage-keys";
import { usesBackendTasks } from "@/lib/generation-history";

const RESULT_VIEW_MODE_KEY = "infinite-canvas:image-result-view-mode";
const IMAGE_TASK_POLL_INTERVAL_MS = 10000;
const WORKFLOW_BUTTON_POSITION_KEY = "infinite-canvas:workflow-button-position";
const CreativeWorkflowWorkspace = dynamic(
    () => import("@/components/workflows/creative-workflow-workspace").then((module) => module.CreativeWorkflowWorkspace),
    { ssr: false, loading: () => <LoadingState className="h-full" label="正在加载工作流..." /> },
);
export default function ImagePage() {
    const { message } = App.useApp();
    const confirm = useConfirm();
    const copyText = useCopyText();
    const pasteClipboardText = usePasteClipboardText();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
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
    const refreshLogs = async () => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        return nextLogs;
    };
    const refreshCategories = async () => setCategories(await readStoredCategories());
    const [resultViewMode, setResultViewModeState] = useState<ResultViewMode>("all");
    const [activeResultCategoryId, setActiveResultCategoryId] = useState<string | null>(null);
    const [workbenchLayout, setWorkbenchLayoutState] = useState<WorkbenchLayout>("side");
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [maskEditTarget, setMaskEditTarget] = useState<{ image: GeneratedImage; model: string; channelId: string; quality: string; size: string; open: boolean } | null>(null);
    const [workflowDrawerOpen, setWorkflowDrawerOpen] = useState(false);
    // 工作流抽屉首次打开后 workspace 常驻，由它统一轮询工作流任务；生图页跳过这类日志的通用轮询。
    const [workflowWorkspaceReady, setWorkflowWorkspaceReady] = useState(false);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    const [now, setNow] = useState(() => Date.now());
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
    const { runGenerationTask } = useImageGeneration({ setResults });

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim() || config.imageWorkflowRef);
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));
    const pendingCount = results.filter((item) => item.status === "pending" || item.status === "stopping").length;
    // 工作流 workspace 常驻后由它轮询工作流日志（带 workflowId 或 task.source=workflow），避免父子两套轮询重复查询与写日志。
    const isWorkflowLog = (log: GenerationLog) => workflowWorkspaceReady && (Boolean(log.workflowId) || log.task?.source === "workflow");
    const pendingLogCount = logs.filter((log) => log.status === "生成中" && log.task && !log.images.length && !isWorkflowLog(log)).length;
    const hasCustomWorkflowButtonPosition = Boolean(workflowButtonPosition.x || workflowButtonPosition.y);
    const usesBackendImageTasks = (value: AiConfig) => usesBackendTasks(value, token);
    const imageTaskConfig = () => effectiveConfigRef.current;

    const restorePendingLogResults = (sourceLogs: GenerationLog[]) => {
        const pendingLogs = sourceLogs.filter((log) => log.status === "生成中" && log.task && !log.images.length);
        if (!pendingLogs.length) return;
        setResults((value) => mergePendingLogResults(value, pendingLogs));
    };

    const pollPendingLogsOnce = (sourceLogs: GenerationLog[], context: WorkflowPollContext) => {
        const pendingLogs = sourceLogs.filter((log) => log.status === "生成中" && log.task && !log.images.length && !isWorkflowLog(log) && !pollingLogIdsRef.current.has(log.id));
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
            // 没有自定义位置时保持 (0,0)，由固定右下角的 CSS 兜底，避免 SSR/CSR 样式不一致导致 hydration 失配。
            if (typeof storedButtonPosition?.x === "number" && typeof storedButtonPosition?.y === "number") setWorkflowButtonPosition(clampWorkflowButtonPosition(storedButtonPosition));
        } catch {
            // Local storage can be unavailable in restricted browser contexts.
        }

        // 监听窗口大小变化，拉窄窗口时只 clamp 已拖拽过的按钮；默认位置交给 CSS，避免被固化成左上角。
        const handleResize = () => {
            setWorkflowButtonPosition((current) => (current.x || current.y ? clampWorkflowButtonPosition(current) : current));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        logsRef.current = logs;
    }, [logs]);

    useEffect(() => {
        if (!isUserReady) return;
        let cancelled = false;
        void readWorkbenchDraft()
            .then((draft) => {
                if (cancelled) return;
                if (draft) {
                    setPrompt(draft.prompt);
                    setReferences(draft.references);
                }
                setDraftReady(true);
            })
            .catch(() => {
                if (!cancelled) setDraftReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, [isUserReady]);

    useEffect(() => {
        if (!isUserReady || !draftReady) return;
        const timer = window.setTimeout(() => {
            void saveWorkbenchDraft(prompt, references).catch(() => undefined);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [draftReady, isUserReady, prompt, references]);

    useEffect(() => {
        if (workflowDrawerOpen) setWorkflowWorkspaceReady(true);
    }, [workflowDrawerOpen]);

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

    const uploadReferences = async (items: Array<{ blob: Blob; name: string }>, source: "upload" | "clipboard") => {
        if (!items.length) return;
        setUploadingCount(items.length);
        const hideLoading = message.loading(source === "upload" ? "正在上传参考图..." : "正在上传并读取参考图...", 0);
        try {
            const nextReferences = await Promise.all(
                items.map(async ({ blob, name }) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, source, temporary: true };
                }),
            );
            setReferences((value) => [...value, ...nextReferences]);
            message.success(source === "upload" ? "参考图上传成功" : `已成功上传并读取 ${nextReferences.length} 张参考图`);
        } catch (error) {
            message.error(source === "upload" ? (error instanceof Error ? `上传参考图失败：${error.message}` : "上传参考图失败") : toErrorMessage(error, "读取参考图失败"));
        } finally {
            hideLoading();
            setUploadingCount(0);
        }
    };

    const addReferences = (files?: FileList | null) =>
        uploadReferences(Array.from(files || []).filter((file) => file.type.startsWith("image/")).map((file) => ({ blob: file, name: file.name })), "upload");

    const addReferenceBlobs = (blobs: Blob[]) =>
        uploadReferences(blobs.map((blob, index) => ({ blob, name: `clipboard-${index + 1}.png` })), "clipboard");

    const addReferencesFromClipboard = async () => {
        try {
            const blobs = await readClipboardBlobs("image/");
            if (!blobs.length) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            await addReferenceBlobs(blobs);
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    /** 底部布局只有一个剪贴板入口：有文本时写入提示词，否则读取图片作为参考图。 */
    const pasteFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const textItem = items.find((item) => item.types.includes("text/plain"));
            if (textItem) {
                const text = (await (await textItem.getType("text/plain")).text()).trim();
                if (text) {
                    setPrompt(text);
                    message.success("已读取剪贴板文本");
                    return;
                }
            }
            const blobs = await blobsFromClipboardItems(items, "image/");
            if (blobs.length) {
                await addReferenceBlobs(blobs);
                return;
            }
            message.error("剪贴板里没有可读取的文本或图片");
        } catch {
            try {
                const text = (await navigator.clipboard.readText()).trim();
                if (text) {
                    setPrompt(text);
                    message.success("已读取剪贴板文本");
                    return;
                }
            } catch {
                // Fall through to the shared empty-clipboard message.
            }
            message.error("剪贴板里没有可读取的文本或图片");
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
                message.error(toErrorMessage(error, "参考图文件删除失败"));
            }
        }
    };

    const clearPrompt = () => {
        setPrompt("");
    };

    const generate = async () => {
        const snapshot = buildRequestSnapshot({ retry: () => void generate() });
        if (!snapshot) return;
        setPrompt("");
        await submitGenerationBatch(snapshot);
    };

    const retryLog = async (log: GenerationLog) => {
        const retryChannelId = imageTaskChannelId(log.task);
        const snapshot = buildRequestSnapshot({ promptText: log.prompt, referenceItems: log.references, taskCount: Number(log.config.count) || 1, configOverride: { ...log.config, ...(retryChannelId ? { imageChannelId: retryChannelId, activeChannelId: retryChannelId } : {}) }, workflowRef: log.providerWorkflowRef || null, retry: () => void retryLog(log) });
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
                retry: () => void submitMaskEdit(payload),
            });
            if (!snapshot) return;
            setMaskEditTarget((value) => value ? { ...value, open: false } : value);
            const stored = await uploadImage(payload.markedDataUrl);
            const markedReference = { id: nanoid(), name: "mask-edit.png", type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey, temporary: true };
            await submitGenerationBatch({ ...snapshot, references: [markedReference] });
        } catch (error) {
            message.error(toErrorMessage(error, "局部重绘失败"));
        }
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

    const { submitGenerationBatch, stopLocalGeneration, isLocalGenerationActive } = useImageBatchGeneration({
        saveLog,
        setResults,
        setPreviewLog,
        setNow,
        activeResultCategoryId,
        runGenerationTask,
        usesBackendImageTasks,
        notify: message,
    });

    const { loadAccountImageHistory, persistImageHistory, syncBackendImageTasks } = useImageHistorySync({
        token,
        logsRef,
        accountHistorySyncEnabledRef,
        imageTaskConfig,
        setCategories,
        setLogs,
        setResults,
    });
    useLayoutEffect(() => {
        loadAccountImageHistoryRef.current = loadAccountImageHistory;
        syncBackendImageTasksRef.current = syncBackendImageTasks;
    });

    const { pollImageTaskLogsOnce } = useImageTaskPolling({
        pollingLogIdsRef,
        imageTaskConfig,
        saveLog,
        setResults,
        onError: message.error,
    });
    useLayoutEffect(() => {
        pollPendingLogsOnceRef.current = pollPendingLogsOnce;
    });

    const { stopImageTask } = useImageTaskStop({
        logsRef,
        setLogs,
        setResults,
        saveLog,
        onError: message.error,
    });


    const {
        downloadImage,
        addResultToReferences,
        saveResultToAssets,
        syncResultImage,
        syncLogImage,
        deleteSelectedLogs,
        deleteLog,
        createCategory,
        renameCategory,
        deleteCategory,
        updateLogCategories,
        toggleLogCategory,
    } = useImageResultActions({
        logs,
        categories,
        selectedLogIds,
        previewLog,
        syncingImageIds,
        imageTaskConfig,
        setLogs,
        setResults,
        setReferences,
        setCategories,
        setSelectedLogIds,
        setPreviewLog,
        setDeleteConfirmOpen,
        setSyncingImageIds,
        refreshLogs,
        persistImageHistory,
    });

    const applyGenerationConfig = (config: GenerationLogConfig, fallbackModel: string, task?: GenerationLog["task"], providerWorkflowRef?: WorkflowRef) => {
        updateConfig("imageWorkflowRef", providerWorkflowRef);
        const nextModel = config.imageModel || config.model || fallbackModel;
        const nextChannelId = resolveImageChannelId(effectiveConfig, nextModel, imageTaskChannelId(task), config.imageChannelId, config.activeChannelId);
        if (nextModel) updateConfig("imageModel", nextModel);
        if (nextChannelId) {
            updateConfig("imageChannelId", nextChannelId);
            updateConfig("activeChannelId", nextChannelId);
        }
        if (config.quality) updateConfig("quality", config.quality);
        if (config.size) updateConfig("size", config.size);
        if (config.count) updateConfig("count", config.count);
        if (config.apiMode) updateConfig("apiMode", config.apiMode);
        if (typeof config.streamImages === "boolean") updateConfig("streamImages", config.streamImages);
        if (config.streamPartialImages) updateConfig("streamPartialImages", config.streamPartialImages);
        if (typeof config.responseFormatB64Json === "boolean") updateConfig("responseFormatB64Json", config.responseFormatB64Json);
        if (typeof config.codexCli === "boolean") updateConfig("codexCli", config.codexCli);
    };

    const confirmDraftOverwrite = async (previewLogId?: string) => {
        if (previewLogId && previewLog?.id === previewLogId) return true;
        if (!prompt.trim() && !references.length) return true;
        return confirm({ title: "覆盖当前创作", description: "当前提示词、参考图与生成参数会被所选内容替换。", confirmText: "覆盖并复用", tone: "warning" });
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        if (!(await confirmDraftOverwrite(log.id))) return;
        setPreviewLog(log);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        applyGenerationConfig(log.config, log.model, log.task, log.providerWorkflowRef);
    };

    const reuseResultConfig = async (result: GenerationResult) => {
        if (!(await confirmDraftOverwrite())) return;
        setPreviewLog(null);
        setPrompt(result.prompt);
        setReferences(result.references || []);
        applyGenerationConfig(result.config, result.model, result.task, result.providerWorkflowRef);
        message.success("已复用该结果的生成配置");
    };

    const buildRequestSnapshot = ({ promptText = prompt, referenceItems = references, taskCount = generationCount, configOverride, workflowRef = config.imageWorkflowRef, retry }: { promptText?: string; referenceItems?: ReferenceImage[]; taskCount?: number; configOverride?: Partial<GenerationLogConfig>; workflowRef?: WorkflowRef | null; retry?: () => void } = {}) => {
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
            message.warning(retry ? "请先完成配置，保存后会自动继续" : "请先完成配置");
            openConfigDialog(true, retry);
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

    const retryResult = (result: GenerationResult) => {
        const retryChannelId = imageTaskChannelId(result.task);
        const snapshot = buildRequestSnapshot({ promptText: result.prompt, referenceItems: result.references, taskCount: 1, configOverride: { ...result.config, ...(retryChannelId ? { imageChannelId: retryChannelId, activeChannelId: retryChannelId } : {}) }, workflowRef: result.providerWorkflowRef || null, retry: () => retryResult(result) });
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

    const resultsPanel = (
        <ResultsPanel
            className={workbenchLayout === "bottom" ? WORKBENCH_BOTTOM_RESULTS_CLASS : undefined}
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
            onReuseConfig={(result) => void reuseResultConfig(result)}
            onCopyPrompt={(text) => copyText(text, "提示词已复制")}
            onEdit={addResultToReferences}
            onMaskEdit={openMaskEdit}
            onDownload={downloadImage}
            onSaveAsset={saveResultToAssets}
            syncingImageIds={syncingImageIds}
            onSyncResult={syncResultImage}
            onSyncLog={syncLogImage}
            onRetry={retryResult}
            onStop={(result) => (result.task ? void stopImageTask(result.taskLogId || result.id) : stopLocalGeneration(result.id))}
            canStopResult={(result) => Boolean(result.task) || isLocalGenerationActive(result.id)}
            onUseExample={setPrompt}
        />
    );
    const workbenchPanel = (
        <ImageWorkbenchPanel
            layout={workbenchLayout}
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
            onPastePrompt={() => void pasteClipboardText(setPrompt)}
            onClearPrompt={clearPrompt}
            onPasteReferences={() => void addReferencesFromClipboard()}
            onPasteClipboard={() => void pasteFromClipboard()}
            onOpenWorkflow={() => setWorkflowDrawerOpen(true)}
            onUploadReferences={() => fileInputRef.current?.click()}
            onRemoveReference={(id) => void removeReference(id)}
            onGenerate={() => void generate()}
            uploadingCount={uploadingCount}
        />
    );

    return (
        <PageFrame variant="workbench">
            <WorkbenchShell layout={workbenchLayout} panel={workbenchPanel} results={resultsPanel} />
            {workbenchLayout === "side" ? (
                <button
                    ref={workflowButtonRef}
                    type="button"
                    className={`fixed z-40 inline-flex touch-none select-none items-center gap-2 rounded-lg border border-border bg-background/90 px-3.5 py-2.5 text-[13px] font-medium text-foreground shadow-lg backdrop-blur-xl transition hover:border-acid/45 hover:bg-accent ${hasCustomWorkflowButtonPosition ? "max-lg:!bottom-[calc(15rem+env(safe-area-inset-bottom))] max-lg:!left-auto max-lg:!right-5 max-lg:!top-auto" : "bottom-6 right-6"}`}
                    style={hasCustomWorkflowButtonPosition ? { left: workflowButtonPosition.x, top: workflowButtonPosition.y } : undefined}
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
            ) : null}
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
                            // 后端异步工作流任务结束时会触发这里：清掉已不在「生成中」的占位结果，避免停在加载态。
                            setResults((value) => value.filter((item) => item.status !== "pending" || !item.taskLogId || nextLogs.some((log) => log.id === item.taskLogId && log.status === "生成中")));
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

