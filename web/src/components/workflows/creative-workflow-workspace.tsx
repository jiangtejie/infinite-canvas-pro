"use client";

import { App, Button, Image, Input, Modal, Pagination, Select, Tag, Typography } from "antd";
import { Bot, Copy, Download, Layers3, LoaderCircle, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { accountScopedStore } from "@/lib/account-storage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/state-panel";
import { useCopyText } from "@/hooks/use-copy-text";
import { useScreenLoadTiming } from "@/hooks/use-screen-load-timing";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/assets/asset-picker-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes, formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { createCanvasImageTask, requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { deleteUserWorkflow, draftUserWorkflow, fetchUserConfig, fetchUserWorkflows, saveUserWorkflow } from "@/services/api/user-config";
import { deleteStoredImages, imageToDataUrl, uploadImage } from "@/services/image-storage";
import { channelProtocolForConfig, localChannelForActiveModel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import { errorMessage } from "@/lib/utils";
import { nowMs, nowPerformanceMs } from "@/lib/now";

import { buildImageHistoryLog, buildRunConfig, buildSeriesPromptDraftRequest, createBlankWorkflow, createDefaultInputValues, createStarterWorkflows, describeModelSelection, isDisposableReferenceFile, normalizeAgentDraft, normalizeSeriesDraft, normalizeWorkflow, parseSeriesPromptDrafts, recordToWorkflow, referenceUsedByWorkflowTask, renderWorkflowPrompt, resolveWorkflowRuntime, serializeHistoryLog, serializeSeriesDraft, seriesDraftStorageKey, workflowForRetry, workflowToRecord } from "./creative-workflow-model";
import type { CreativeWorkflow, GenerationCategory, ImageHistoryLog, SeriesPromptDraft, WorkflowExternalTaskFailure, WorkflowExternalTaskStart, WorkflowExternalTaskSuccess, WorkflowGenerationConfig, WorkflowRunResult, WorkflowTask } from "./creative-workflow-types";
import { useWorkflowTaskRecovery } from "./use-workflow-task-recovery";
import { WorkflowAgentModal } from "./workflow-agent-modal";
import { SeriesPromptDraftCard, WorkflowCard, WorkflowTaskCard } from "./workflow-cards";
import { WorkflowEditorModal, WorkflowVariableInput } from "./workflow-editor-modal";

const WORKFLOW_STORE_KEY = "infinite-canvas:creative-workflows";
const ACTIVE_SERIES_WORKFLOW_KEY = "infinite-canvas:series-drafts:active";
const CATEGORY_STORE_KEY = "infinite-canvas:image_generation_categories";
const workflowStore = accountScopedStore("creative_workflows");
const imageLogStore = accountScopedStore("image_generation_logs");
const categoryStore = accountScopedStore("image_generation_categories");

const WORKFLOW_TASK_POLL_INTERVAL_MS = 10000;

export function CreativeWorkflowWorkspace({
    embedded = false,
    hideTaskList = false,
    onGenerationLogSaved,
    onWorkflowTaskStarted,
    onWorkflowTaskSuccess,
    onWorkflowTaskFailure,
}: {
    embedded?: boolean;
    hideTaskList?: boolean;
    onGenerationLogSaved?: () => void;
    onWorkflowTaskStarted?: (task: WorkflowExternalTaskStart) => void;
    onWorkflowTaskSuccess?: (task: WorkflowExternalTaskSuccess) => void;
    onWorkflowTaskFailure?: (task: WorkflowExternalTaskFailure) => void;
} = {}) {
    useScreenLoadTiming(embedded ? "工作流（嵌入）" : "工作流");
    const { message } = App.useApp();
    const copyText = useCopyText();
    const confirm = useConfirm();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const effectiveConfig = useEffectiveConfig();
    const user = useUserStore((state) => state.user);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const token = useUserStore((state) => state.token);
    const isUserReady = useUserStore((state) => state.isReady);
    const ownerId = useUserStore((state) => state.user?.id || "guest");
    const [workflows, setWorkflows] = useState<CreativeWorkflow[]>([]);
    const [editingWorkflow, setEditingWorkflow] = useState<CreativeWorkflow | null>(null);
    const [runningWorkflow, setRunningWorkflow] = useState<CreativeWorkflow | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [workflowReferences, setWorkflowReferences] = useState<ReferenceImage[]>([]);
    const workflowReferenceInputRef = useRef<HTMLInputElement>(null);
    const [workflowAssetPickerOpen, setWorkflowAssetPickerOpen] = useState(false);
    const [runResults, setRunResults] = useState<WorkflowRunResult[]>([]);
    const [workflowTasks, setWorkflowTasks] = useState<WorkflowTask[]>([]);
    const [stoppingTaskIds, setStoppingTaskIds] = useState<string[]>([]);
    const [seriesDrafts, setSeriesDrafts] = useState<SeriesPromptDraft[]>([]);
    const [seriesDraftLoading, setSeriesDraftLoading] = useState(false);
    const [seriesBatchAppend, setSeriesBatchAppend] = useState("");
    const [now, setNow] = useState(() => nowMs());
    const [query, setQuery] = useState("");
    const [workflowCategory, setWorkflowCategory] = useState("all");
    const [workflowPage, setWorkflowPage] = useState(1);
    const [agentOpen, setAgentOpen] = useState(false);
    const [agentPrompt, setAgentPrompt] = useState("");
    const [agentScope, setAgentScope] = useState<"private" | "public">("private");
    const [agentTextModel, setAgentTextModel] = useState("");
    const [agentTextChannelId, setAgentTextChannelId] = useState("");
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentDraft, setAgentDraft] = useState<CreativeWorkflow | null>(null);
    const [agentWarnings, setAgentWarnings] = useState<string[]>([]);
    const [agentReferences, setAgentReferences] = useState<ReferenceImage[]>([]);
    const [agentAssetPickerOpen, setAgentAssetPickerOpen] = useState(false);
    const workflowSyncEnabledRef = useRef(false);
    const seriesDraftsLoadedRef = useRef(false);
    const recoverWorkflowTasksRef = useRef<() => Promise<void>>(async () => undefined);
    const pollRecoveredTasksRef = useRef<() => Promise<void>>(async () => undefined);

    const filteredWorkflows = useMemo(() => {
        const text = query.trim().toLowerCase();
        return workflows.filter((workflow) => {
            if (workflowCategory !== "all" && (workflow.category || "未分类") !== workflowCategory) return false;
            if (!text) return true;
            return [workflow.name, workflow.category, workflow.description].some((value) => value.toLowerCase().includes(text));
        });
    }, [query, workflowCategory, workflows]);

    const workflowCategories = useMemo(() => Array.from(new Set(workflows.map((workflow) => workflow.category || "未分类"))).sort((a, b) => a.localeCompare(b, "zh-CN")), [workflows]);
    const workflowPageSize = 12;
    const workflowMaxPage = Math.max(1, Math.ceil(filteredWorkflows.length / workflowPageSize));
    const visibleWorkflows = filteredWorkflows.slice((workflowPage - 1) * workflowPageSize, workflowPage * workflowPageSize);

    useEffect(() => {
        setWorkflowPage(1);
    }, [query, workflowCategory]);

    useEffect(() => {
        setWorkflowPage((current) => Math.min(current, workflowMaxPage));
    }, [workflowMaxPage]);

    const renderedPrompt = useMemo(() => (runningWorkflow ? renderWorkflowPrompt(runningWorkflow, inputValues) : ""), [inputValues, runningWorkflow]);
    const runningTasks = workflowTasks.filter((task) => task.status === "running");
    const runningTaskCount = runningTasks.length;
    const activeSeriesDrafts = seriesDrafts.filter((item) => item.status !== "success");
    const agentModel = agentTextModel || effectiveConfig.textModel || "";
    const agentChannelId = agentTextChannelId || effectiveConfig.textChannelId;
    const agentModelInfo = useMemo(() => describeModelSelection(effectiveConfig, agentModel, agentChannelId), [agentChannelId, agentModel, effectiveConfig]);

    const refreshWorkflowsRef = useRef<() => Promise<void>>(async () => undefined);

    useEffect(() => {
        if (!isUserReady) return;
        // 先加载模板再恢复任务，避免恢复出的任务点「重试」时还查不到对应工作流。
        void (async () => {
            await refreshWorkflowsRef.current().catch(() => undefined);
            // 嵌入生图页时工作流抽屉一旦打开就由 workspace 统一恢复/轮询任务（生图页随后跳过工作流日志的通用轮询）。
            await recoverWorkflowTasksRef.current().catch(() => undefined);
        })();
    }, [embedded, isUserReady, token]);

    useEffect(() => {
        if (!agentTextModel && effectiveConfig.textModel) setAgentTextModel(effectiveConfig.textModel);
        if (!agentTextChannelId && effectiveConfig.textChannelId) setAgentTextChannelId(effectiveConfig.textChannelId);
    }, [agentTextChannelId, agentTextModel, effectiveConfig.model, effectiveConfig.textChannelId, effectiveConfig.textModel]);

    useEffect(() => {
        if (!runningTaskCount) return;
        const timer = window.setInterval(() => setNow(nowMs()), 1000);
        return () => window.clearInterval(timer);
    }, [runningTaskCount]);

    useEffect(() => {
        if (!runningTaskCount) return;
        void pollRecoveredTasksRef.current();
        const timer = window.setInterval(() => {
            void pollRecoveredTasksRef.current();
        }, WORKFLOW_TASK_POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [runningTaskCount]);

    const runningWorkflowId = runningWorkflow?.id;
    const runningWorkflowMode = runningWorkflow?.mode;

    useEffect(() => {
        if (!runningWorkflowId || runningWorkflowMode !== "multi_image_series" || !seriesDraftsLoadedRef.current) return;
        // 只持久化可恢复字段（id/标题/提示词），任务状态与结果 id 不落盘；清空时直接删 key，避免脏数据。
        if (!seriesDrafts.length) {
            void workflowStore.removeItem(seriesDraftStorageKey(runningWorkflowId, ownerId));
            void workflowStore.removeItem(ACTIVE_SERIES_WORKFLOW_KEY);
            return;
        }
        void workflowStore.setItem(seriesDraftStorageKey(runningWorkflowId, ownerId), seriesDrafts.map(serializeSeriesDraft));
    }, [ownerId, runningWorkflowId, runningWorkflowMode, seriesDrafts]);

    const refreshWorkflows = async () => {
        if (token) {
            try {
                const config = await fetchUserConfig(token);
                workflowSyncEnabledRef.current = config.syncCapabilities?.workflows === true;
                if (!workflowSyncEnabledRef.current) throw new Error("workflow sync unavailable");
                const remote = await fetchUserWorkflows<CreativeWorkflow>(token);
                const workflows = remote.map(recordToWorkflow).sort((a, b) => b.updatedAt - a.updatedAt);
                if (workflows.length) {
                    setWorkflows(workflows);
                    await workflowStore.setItem(WORKFLOW_STORE_KEY, workflows);
                    return;
                }
                const local = await workflowStore.getItem<CreativeWorkflow[]>(WORKFLOW_STORE_KEY);
                const seed = local?.length ? local.map(normalizeWorkflow) : createStarterWorkflows(effectiveConfig);
                const saved = await Promise.all(seed.map((workflow) => saveUserWorkflow(token, workflowToRecord(normalizeWorkflow(workflow)))));
                setWorkflows(saved.map(recordToWorkflow).sort((a, b) => b.updatedAt - a.updatedAt));
                return;
            } catch {
                // Use local workflows when account sync is unavailable.
            }
        }
        const stored = await workflowStore.getItem<CreativeWorkflow[]>(WORKFLOW_STORE_KEY);
        if (stored?.length) {
            setWorkflows(stored.map(normalizeWorkflow).sort((a, b) => b.updatedAt - a.updatedAt));
            return;
        }
        const seed = createStarterWorkflows(effectiveConfig);
        setWorkflows(seed);
        await workflowStore.setItem(WORKFLOW_STORE_KEY, seed);
    };
    useLayoutEffect(() => {
        refreshWorkflowsRef.current = refreshWorkflows;
    });

    const saveWorkflows = async (items: CreativeWorkflow[]) => {
        const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
        setWorkflows(sorted);
        await workflowStore.setItem(WORKFLOW_STORE_KEY, sorted);
    };

    const openRunner = useCallback((workflow: CreativeWorkflow) => {
        seriesDraftsLoadedRef.current = false;
        setRunningWorkflow(workflow);
        setInputValues(createDefaultInputValues(workflow));
        setWorkflowReferences([]);
        setSeriesDrafts([]);
        if (workflow.mode === "multi_image_series") {
            void workflowStore.setItem(ACTIVE_SERIES_WORKFLOW_KEY, workflow.id);
            void workflowStore.getItem<PersistedSeriesDraft[]>(seriesDraftStorageKey(workflow.id, ownerId)).then((drafts) => {
                setSeriesDrafts((drafts || []).map(normalizeSeriesDraft));
                seriesDraftsLoadedRef.current = true;
            });
        } else {
            seriesDraftsLoadedRef.current = true;
        }
    }, [ownerId]);

    const closeRunner = () => {
        setRunningWorkflow(null);
        setSeriesDrafts([]);
        setSeriesBatchAppend("");
        seriesDraftsLoadedRef.current = false;
    };

    const restoredSeriesRunnerRef = useRef(false);
    useEffect(() => {
        if (restoredSeriesRunnerRef.current || !workflows.length) return;
        restoredSeriesRunnerRef.current = true;
        void (async () => {
            const activeId = await workflowStore.getItem<string>(ACTIVE_SERIES_WORKFLOW_KEY);
            if (!activeId) return;
            const workflow = workflows.find((item) => item.id === activeId && item.mode === "multi_image_series");
            if (!workflow) return;
            const drafts = await workflowStore.getItem<PersistedSeriesDraft[]>(seriesDraftStorageKey(activeId, ownerId));
            if (drafts?.length) openRunner(workflow);
        })();
    }, [openRunner, ownerId, workflows]);

    const addWorkflowReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const next = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, source: "upload" as const, temporary: true };
            }),
        );
        setWorkflowReferences((value) => [...value, ...next]);
    };

    const removeWorkflowReference = async (id: string) => {
        const reference = workflowReferences.find((item) => item.id === id);
        setWorkflowReferences((value) => value.filter((item) => item.id !== id));
        if (reference?.storageKey && isDisposableReferenceFile(reference) && !referenceUsedByWorkflowTask(reference, workflowTasks)) {
            try {
                await deleteStoredImages([reference.storageKey]);
            } catch (error) {
                message.error(errorMessage(error, "参考图文件删除失败"));
            }
        }
    };

    const addAgentReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const next = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, source: "upload" as const, temporary: true };
            }),
        );
        setAgentReferences((value) => [...value, ...next]);
    };

    const removeAgentReference = async (id: string) => {
        const reference = agentReferences.find((item) => item.id === id);
        setAgentReferences((value) => value.filter((item) => item.id !== id));
        if (reference?.storageKey && isDisposableReferenceFile(reference)) {
            try {
                await deleteStoredImages([reference.storageKey]);
            } catch (error) {
                message.error(errorMessage(error, "参考图文件删除失败"));
            }
        }
    };

    const cleanupAgentReferences = async () => {
        const keys = agentReferences.filter(isDisposableReferenceFile).map((item) => item.storageKey).filter((key): key is string => Boolean(key));
        setAgentReferences([]);
        if (keys.length) await deleteStoredImages(keys).catch((error) => message.error(errorMessage(error, "参考图文件删除失败")));
    };

    const insertWorkflowAsset = (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            const text = payload.content.trim();
            if (text) setInputValues((value) => ({ ...value, [runningWorkflow?.variables[0]?.key || "asset_text"]: text }));
            setWorkflowAssetPickerOpen(false);
            return;
        }
        if (payload.kind !== "image") {
            message.warning("视频素材不能作为工作流参考图");
            return;
        }
        setWorkflowReferences((value) => [
            ...value,
            {
                id: nanoid(),
                name: payload.title,
                type: payload.mimeType || "image/png",
                dataUrl: payload.dataUrl,
                storageKey: payload.storageKey,
                source: payload.source === "asset" ? "asset" : "library",
                assetId: payload.assetId,
                temporary: false,
            },
        ]);
        setWorkflowAssetPickerOpen(false);
    };

    const insertAgentAsset = (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            const text = payload.content.trim();
            if (text) setAgentPrompt((value) => (value.trim() ? `${value.trim()}\n\n${text}` : text));
            setAgentAssetPickerOpen(false);
            return;
        }
        if (payload.kind !== "image") {
            message.warning("视频素材不能作为工作流 Agent 参考图");
            return;
        }
        setAgentReferences((value) => [
            ...value,
            {
                id: nanoid(),
                name: payload.title,
                type: payload.mimeType || "image/png",
                dataUrl: payload.dataUrl,
                storageKey: payload.storageKey,
                source: payload.source === "asset" ? "asset" : "library",
                assetId: payload.assetId,
                temporary: false,
            },
        ]);
        setAgentAssetPickerOpen(false);
    };

    const saveWorkflow = async (workflow: CreativeWorkflow) => {
        if (!workflow.name.trim()) {
            message.error("请输入工作流名称");
            return;
        }
        if (!workflow.config.promptTemplate.trim()) {
            message.error("请输入提示词模板");
            return;
        }
        const now = nowMs();
        let normalized = normalizeWorkflow({ ...workflow, name: workflow.name.trim(), category: workflow.category.trim(), updatedAt: now, createdAt: workflow.createdAt || now });
        try {
            if (token && workflowSyncEnabledRef.current) {
                normalized = recordToWorkflow(await saveUserWorkflow(token, workflowToRecord(normalized)));
                await refreshWorkflows();
            } else {
                await saveWorkflows([normalized, ...workflows.filter((item) => item.id !== normalized.id)]);
            }
        } catch (error) {
            await saveWorkflows([normalized, ...workflows.filter((item) => item.id !== normalized.id)]);
            message.warning(error instanceof Error && error.message === "接口不存在" ? "工作流同步接口不可用，已先保存到本地。请重启后端后再同步到账号。" : "远端保存失败，已先保存到本地");
        }
        if (agentDraft?.id === workflow.id) {
            await cleanupAgentReferences();
            setAgentDraft(null);
        }
        setEditingWorkflow(null);
        message.success("工作流已保存");
    };

    const duplicateWorkflow = async (workflow: CreativeWorkflow) => {
        const now = nowMs();
        const copy = normalizeWorkflow({ ...workflow, id: nanoid(), ownerUserId: undefined, editable: true, scope: "private", name: `${workflow.name} 副本`, createdAt: now, updatedAt: now, lastRunAt: undefined });
        try {
            if (token && workflowSyncEnabledRef.current) {
                await saveUserWorkflow(token, workflowToRecord(copy));
                await refreshWorkflows();
            } else {
                await saveWorkflows([copy, ...workflows]);
            }
        } catch (error) {
            await saveWorkflows([copy, ...workflows]);
            message.warning(error instanceof Error && error.message === "接口不存在" ? "工作流同步接口不可用，副本已先保存到本地。请重启后端。" : "远端复制失败，副本已先保存到本地");
        }
    };

    const deleteWorkflow = async (workflow: CreativeWorkflow) => {
        const confirmed = await confirm({
            title: "删除工作流",
            description: `确定删除「${workflow.name}」吗？本地模板会被移除，已生成的图片历史不受影响。`,
            confirmText: "删除",
            tone: "danger",
        });
        if (!confirmed) return;
        try {
            if (token && workflowSyncEnabledRef.current) {
                await deleteUserWorkflow(token, workflow.id);
                await refreshWorkflows();
            } else {
                await saveWorkflows(workflows.filter((item) => item.id !== workflow.id));
            }
        } catch (error) {
            await saveWorkflows(workflows.filter((item) => item.id !== workflow.id));
            message.warning(error instanceof Error && error.message === "接口不存在" ? "工作流同步接口不可用，已先从本地移除。请重启后端。" : "远端删除失败，已先从本地移除");
        }
        void workflowStore.removeItem(seriesDraftStorageKey(workflow.id, ownerId)).catch(() => undefined);
        if (runningWorkflow?.id === workflow.id) setRunningWorkflow(null);
    };

    const runWorkflowAgent = async () => {
        const text = agentPrompt.trim();
        if (!text) {
            message.error("请输入工作流需求");
            return;
        }
        if (!token) {
            message.warning("请先登录后使用工作流创建 Agent");
            return;
        }
        setAgentLoading(true);
        try {
            const textModel = agentTextModel || effectiveConfig.textModel || effectiveConfig.model;
            const textChannelId = agentTextChannelId || effectiveConfig.textChannelId;
            const textConfig = { ...effectiveConfig, model: textModel, textModel, textChannelId, activeChannelId: textChannelId };
            if (!isAiConfigReady(textConfig, textModel)) {
                openConfigDialog(true);
                return;
            }
            const localChannel = effectiveConfig.channelMode === "local" ? localChannelForActiveModel(textConfig) : null;
            const referenceDataUrls = await Promise.all(agentReferences.map((image) => imageToDataUrl(image)));
            const result = await draftUserWorkflow<Partial<CreativeWorkflow>>(token, {
                prompt: text,
                scope: agentScope,
                model: textModel,
                channelId: textChannelId,
                channelMode: effectiveConfig.channelMode,
                protocol: channelProtocolForConfig(textConfig),
                baseUrl: localChannel?.baseUrl,
                apiKey: localChannel?.apiKey,
                references: referenceDataUrls.filter(Boolean),
            });
            setAgentDraft(normalizeAgentDraft(result.draft, effectiveConfig, agentScope));
            setAgentWarnings(result.warnings || []);
        } catch (error) {
            message.error(errorMessage(error, "工作流 Agent 生成失败"));
        } finally {
            setAgentLoading(false);
        }
    };

    const applyAgentDraft = () => {
        if (!agentDraft) return;
        setEditingWorkflow(agentDraft);
        setAgentOpen(false);
    };

    const runWorkflow = async () => {
        if (!runningWorkflow) return;
        const missing = runningWorkflow.variables.find((item) => item.required && !String(inputValues[item.key] || "").trim());
        if (missing) {
            message.error(`请填写 ${missing.label}`);
            return;
        }
        if (runningWorkflow.mode === "multi_image_series") {
            await generateSeriesPromptDrafts();
            return;
        }
        void startWorkflowImageTask(runningWorkflow, renderedPrompt, { ...inputValues }, [...workflowReferences]);
    };

    const generateSeriesPromptDrafts = async () => {
        if (!runningWorkflow) return;
        const promptModel = runningWorkflow.seriesConfig.promptModel || effectiveConfig.textModel || effectiveConfig.model;
        const promptChannelId = runningWorkflow.seriesConfig.promptChannelId || effectiveConfig.textChannelId;
        const textConfig = { ...effectiveConfig, model: promptModel, textModel: promptModel, textChannelId: promptChannelId, activeChannelId: promptChannelId, systemPrompt: effectiveConfig.systemPrompts.workflow || effectiveConfig.systemPrompt };
        if (!isAiConfigReady(textConfig, promptModel)) {
            message.warning("请先完成文本模型配置");
            openConfigDialog(true);
            return;
        }
        setSeriesDraftLoading(true);
        try {
            const count = Math.max(1, Math.min(20, Number(runningWorkflow.seriesConfig.targetCount) || Number(runningWorkflow.config.count) || 4));
            const answer = await requestImageQuestion(textConfig, [{ role: "user", content: buildSeriesPromptDraftRequest(runningWorkflow, renderedPrompt, count, inputValues) }], () => {});
            const drafts = parseSeriesPromptDrafts(answer, count, renderedPrompt);
            setSeriesDrafts(drafts);
            message.success("多图提示词已生成，请审核后生成图片");
            if (runningWorkflow.seriesConfig.reviewRequired === false) {
                window.setTimeout(() => {
                    drafts.forEach((draft, index) => void runSeriesDraft(draft, index));
                }, 0);
            }
        } catch (error) {
            message.error(errorMessage(error, "多图提示词生成失败"));
        } finally {
            setSeriesDraftLoading(false);
        }
    };

    const updateSeriesDraft = (id: string, patch: Partial<SeriesPromptDraft>) => {
        setSeriesDrafts((value) => value.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };

    const { pollRecoveredWorkflowTasks, recoverWorkflowTasks, trackWorkflowTaskLogs, untrackWorkflowTask, completeTrackedWorkflowTask, stopWorkflowTask } = useWorkflowTaskRecovery({
        token,
        effectiveConfig,
        stoppingTaskIds,
        setWorkflowTasks,
        setRunResults,
        setStoppingTaskIds,
        updateSeriesDraft,
        onGenerationLogSaved,
        onWorkflowTaskSuccess,
        onWorkflowTaskFailure,
    });
    useLayoutEffect(() => {
        pollRecoveredTasksRef.current = pollRecoveredWorkflowTasks;
        recoverWorkflowTasksRef.current = recoverWorkflowTasks;
    });

    const moveSeriesDraft = (id: string, direction: -1 | 1) => {
        setSeriesDrafts((value) => {
            const index = value.findIndex((item) => item.id === id);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= value.length) return value;
            const next = [...value];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const deleteSeriesDraft = (id: string) => {
        setSeriesDrafts((value) => value.filter((item) => item.id !== id));
    };

    const clearSeriesDrafts = async () => {
        setSeriesDrafts([]);
        if (runningWorkflow) await workflowStore.removeItem(seriesDraftStorageKey(runningWorkflow.id, ownerId)).catch(() => undefined);
        message.success("已清空多图草稿");
    };

    const applySeriesBatchAppend = () => {
        const text = seriesBatchAppend.trim();
        if (!text) {
            message.warning("请输入要追加的批量要求");
            return;
        }
        setSeriesDrafts((value) => value.map((item) => ({ ...item, prompt: `${item.prompt.trim()}\n${text}`.trim(), status: item.status === "success" ? "draft" : item.status })));
        setSeriesBatchAppend("");
    };

    const runSeriesDraft = (draft: SeriesPromptDraft, index: number) => {
        if (!runningWorkflow || draft.status === "running" || !draft.prompt.trim()) return Promise.resolve();
        updateSeriesDraft(draft.id, { status: "running", error: undefined });
        return startWorkflowImageTask(runningWorkflow, draft.prompt.trim(), { ...inputValues }, [...workflowReferences], 1, draft.id, draft.title || `第 ${index + 1} 张`, index + 1);
    };

    const runAllSeriesDrafts = async () => {
        if (!runningWorkflow) return;
        const drafts = activeSeriesDrafts.filter((item) => item.prompt.trim() && item.status !== "running");
        if (!drafts.length) {
            message.warning("没有可生成的提示词");
            return;
        }
        const concurrency = Math.max(1, Math.min(6, Number(runningWorkflow.seriesConfig.concurrency) || 3));
        for (let index = 0; index < drafts.length; index += concurrency) {
            const batch = drafts.slice(index, index + concurrency);
            await Promise.all(batch.map((draft) => runSeriesDraft(draft, Math.max(0, seriesDrafts.findIndex((item) => item.id === draft.id)))));
        }
    };

    const startWorkflowImageTask = (workflow: CreativeWorkflow, promptSnapshot: string, inputSnapshot: Record<string, string>, referencesSnapshot: ReferenceImage[], countOverride?: number, seriesDraftId?: string, seriesTitle?: string, seriesIndex?: number) => {
        const runtime = resolveWorkflowRuntime(workflow, effectiveConfig);
        const model = runtime.model;
        const runConfig = buildRunConfig(effectiveConfig, workflow.config, runtime);
        if (!isAiConfigReady(runConfig, model)) {
            message.warning("请先完成 API 配置");
            openConfigDialog(true);
            return;
        }

        const startedAt = nowMs();
        const performanceStartedAt = nowPerformanceMs();
        const count = Math.max(1, Math.min(10, countOverride || Number(runConfig.count) || 1));
        const taskId = nanoid();
        const taskConfig = { ...workflow.config, model, imageModel: model, imageChannelId: runtime.channelId, apiMode: runtime.apiMode, count: String(count) };
        onWorkflowTaskStarted?.({
            taskId,
            workflowId: workflow.id,
            workflowName: workflow.name,
            prompt: promptSnapshot,
            inputs: inputSnapshot,
            references: referencesSnapshot,
            model,
            apiMode: runtime.apiMode,
            config: taskConfig,
            count,
            startedAt,
        });
        setWorkflowTasks((value) => [
            {
                id: taskId,
                status: "running",
                workflowId: workflow.id,
                workflowName: workflow.name,
                prompt: promptSnapshot,
                inputs: inputSnapshot,
                references: referencesSnapshot,
                model,
                apiMode: runtime.apiMode,
                config: taskConfig,
                count,
                startedAt,
                images: [],
                seriesTitle,
                seriesIndex,
            },
            ...value,
        ]);
        message.success(seriesTitle ? `${seriesTitle} 已开始生成` : "工作流任务已开始");
        if (runConfig.channelMode === "remote" || (runConfig.channelMode === "local" && token)) {
            return createWorkflowImageTasks({ taskId, workflow, prompt: promptSnapshot, inputSnapshot, references: referencesSnapshot, runConfig, taskConfig, model, count, startedAt, seriesDraftId, seriesTitle, seriesIndex });
        }
        return executeWorkflowTask({ taskId, workflow, prompt: promptSnapshot, inputSnapshot, references: referencesSnapshot, runConfig, taskConfig, model, count, startedAt, performanceStartedAt, seriesDraftId, seriesTitle, seriesIndex });
    };

    const retryWorkflowTask = (task: WorkflowTask) => {
        // 模板被删/换设备恢复时用日志快照配置按 workflow id 临时重试，不伪造或写回模板。
        const workflow = workflows.find((item) => item.id === task.workflowId) || workflowForRetry(task);
        if (!workflow) {
            message.warning("模板信息缺失，无法重试");
            return;
        }
        untrackWorkflowTask(task.id);
        setWorkflowTasks((value) => value.filter((item) => item.id !== task.id));
        void startWorkflowImageTask(workflow, task.prompt, { ...task.inputs }, task.references, task.count, undefined, task.seriesTitle, task.seriesIndex);
    };

    const createWorkflowImageTasks = async ({
        taskId,
        workflow,
        prompt,
        inputSnapshot,
        references,
        runConfig,
        taskConfig,
        model,
        count,
        startedAt,
        seriesDraftId,
        seriesTitle,
        seriesIndex,
    }: {
        taskId: string;
        workflow: CreativeWorkflow;
        prompt: string;
        inputSnapshot: Record<string, string>;
        references: ReferenceImage[];
        runConfig: AiConfig;
        taskConfig: WorkflowGenerationConfig;
        model: string;
        count: number;
        startedAt: number;
        seriesDraftId?: string;
        seriesTitle?: string;
        seriesIndex?: number;
    }) => {
        const category = await ensureWorkflowCategory(workflow.name);
        const taskLogs = Array.from({ length: count }, (_, index) => {
            const id = nanoid();
            const clientTaskId = `client_workflow_image_task_${taskId}_${index}`;
            return buildImageHistoryLog({
                id,
                workflow,
                prompt,
                config: { ...taskConfig, channelMode: runConfig.channelMode, activeChannelId: runConfig.activeChannelId },
                model,
                images: [],
                durationMs: 0,
                inputs: inputSnapshot,
                references,
                categoryIds: category ? [category.id] : [],
                seriesTitle,
                seriesIndex,
                status: "生成中",
                task: { id: clientTaskId, status: "queued", progress: 0, source: "workflow", source_id: id, createdAt: startedAt.toString(), created_at: startedAt.toString() },
            });
        });
        const createdLogs: ImageHistoryLog[] = [];
        const settled = await Promise.allSettled(
            taskLogs.map(async (log, index) => {
                try {
                    const task = await createCanvasImageTask({ ...runConfig, seedIndex: index, seedCount: count, count: "1" }, prompt, references, { source: "workflow", sourceId: log.id, clientTaskId: log.task?.id || `${taskId}:${index}` });
                    const savedLog = { ...log, task, lastPolledAt: nowMs() };
                    await saveWorkflowTaskLog(savedLog);
                    createdLogs.push(savedLog);
                } catch (error) {
                    const messageText = errorMessage(error, "工作流图片任务创建失败");
                    await saveWorkflowTaskLog({ ...log, status: "失败", durationMs: nowMs() - startedAt, failCount: 1, errors: [messageText], lastPolledAt: nowMs() });
                    throw error;
                }
            }),
        );
        const createdCount = settled.filter((item) => item.status === "fulfilled").length;
        if (createdCount) trackWorkflowTaskLogs(taskId, createdLogs, startedAt, seriesDraftId);
        onGenerationLogSaved?.();
        if (!createdCount) {
            const messageText = "工作流图片任务创建失败";
            if (seriesDraftId) updateSeriesDraft(seriesDraftId, { status: "failed", error: messageText });
            setWorkflowTasks((value) => value.map((task) => (task.id === taskId ? { ...task, status: "failed", endedAt: nowMs(), durationMs: nowMs() - startedAt, error: messageText } : task)));
            onWorkflowTaskFailure?.({ taskId, error: messageText, durationMs: nowMs() - startedAt, endedAt: nowMs() });
            message.error(messageText);
            return;
        }
        message.success(`已创建 ${createdCount} 个工作流图片任务`);
        if (createdCount < count) message.warning(`${count - createdCount} 个工作流图片任务创建失败`);
    };

    const executeWorkflowTask = async ({
        taskId,
        workflow,
        prompt,
        inputSnapshot,
        references,
        runConfig,
        taskConfig,
        model,
        count,
        startedAt,
        performanceStartedAt,
        seriesDraftId,
        seriesTitle,
        seriesIndex,
    }: {
        taskId: string;
        workflow: CreativeWorkflow;
        prompt: string;
        inputSnapshot: Record<string, string>;
        references: ReferenceImage[];
        runConfig: AiConfig;
        taskConfig: WorkflowGenerationConfig;
        model: string;
        count: number;
        startedAt: number;
        performanceStartedAt: number;
        seriesDraftId?: string;
        seriesTitle?: string;
        seriesIndex?: number;
    }) => {
        try {
            const images = await Promise.all(Array.from({ length: count }, () => (references.length ? requestEdit({ ...runConfig, count: "1" }, prompt, references) : requestGeneration({ ...runConfig, count: "1" }, prompt))));
            const flattened = images.flat();
            if (!flattened.length) throw new Error("接口没有返回图片");
            const durationMs = nowPerformanceMs() - performanceStartedAt;
            const storedImages = await Promise.all(
                flattened.map(async (image) => {
                    const meta = image.width && image.height && image.mimeType ? { width: image.width, height: image.height, mimeType: image.mimeType } : await readImageMeta(image.dataUrl);
                    return {
                        id: image.id,
                        dataUrl: image.dataUrl,
                        displayUrl: image.dataUrl,
                        storageKey: image.storageKey || "",
                        durationMs,
                        width: meta.width,
                        height: meta.height,
                        bytes: image.bytes || getDataUrlByteSize(image.dataUrl),
                        mimeType: image.mimeType || meta.mimeType,
                    };
                }),
            );
            const category = await ensureWorkflowCategory(workflow.name);
            const log = buildImageHistoryLog({
                workflow,
                prompt,
                config: taskConfig,
                model,
                images: storedImages,
                durationMs,
                inputs: inputSnapshot,
                references,
                categoryIds: category ? [category.id] : [],
                seriesTitle,
                seriesIndex,
            });
            await imageLogStore.setItem(log.id, serializeHistoryLog(log));
            onGenerationLogSaved?.();
            const finishedAt = nowMs();
            setWorkflows((value) => {
                const next = value.map((item) => (item.id === workflow.id ? { ...item, lastRunAt: finishedAt, updatedAt: finishedAt } : item)).sort((a, b) => b.updatedAt - a.updatedAt);
                void workflowStore.setItem(WORKFLOW_STORE_KEY, next);
                return next;
            });
            if (token && workflowSyncEnabledRef.current && workflow.editable !== false) void saveUserWorkflow(token, workflowToRecord({ ...workflow, lastRunAt: finishedAt, updatedAt: finishedAt })).catch(() => {});
            setRunningWorkflow((value) => (value?.id === workflow.id ? { ...value, lastRunAt: finishedAt, updatedAt: finishedAt } : value));
            const nextResults = storedImages.map((image) => ({
                id: image.id,
                workflowId: workflow.id,
                workflowName: workflow.name,
                prompt,
                imageUrl: image.displayUrl,
                storageKey: image.storageKey,
                width: image.width,
                height: image.height,
                bytes: image.bytes,
                mimeType: image.mimeType,
                durationMs,
                createdAt: finishedAt,
            }));
            if (seriesDraftId) {
                updateSeriesDraft(seriesDraftId, { status: "success", resultIds: nextResults.map((image) => image.id) });
            }
            setWorkflowTasks((value) =>
                value.map((task) =>
                    task.id === taskId
                        ? {
                              ...task,
                              status: "success",
                              endedAt: finishedAt,
                              durationMs,
                              images: nextResults,
                          }
                        : task,
                ),
            );
            setRunResults((value) => [...nextResults, ...value]);
            onWorkflowTaskSuccess?.({ taskId, images: nextResults, durationMs, endedAt: finishedAt });
            message.success("工作流运行完成，结果已写入生图历史");
        } catch (error) {
            const finishedAt = nowMs();
            const messageText = errorMessage(error, "工作流运行失败");
            if (seriesDraftId) {
                updateSeriesDraft(seriesDraftId, { status: "failed", error: messageText });
            }
            setWorkflowTasks((value) =>
                value.map((task) =>
                    task.id === taskId
                        ? {
                              ...task,
                              status: "failed",
                              endedAt: finishedAt,
                              durationMs: finishedAt - startedAt,
                              error: messageText,
                          }
                        : task,
                ),
            );
            onWorkflowTaskFailure?.({ taskId, error: messageText, durationMs: finishedAt - startedAt, endedAt: finishedAt });
            message.error(messageText);
        }
    };

    const createActions = (
        <>
            <Button icon={<Bot className="size-4" />} onClick={() => setAgentOpen(true)}>
                AI 创建
            </Button>
            <Button icon={<Layers3 className="size-4" />} onClick={() => setEditingWorkflow(createBlankWorkflow(effectiveConfig, "multi_image_series"))}>
                新建多图
            </Button>
            <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setEditingWorkflow(createBlankWorkflow(effectiveConfig))}>
                新建工作流
            </Button>
        </>
    );

    return (
        <main className={`${embedded ? "h-full" : "h-full overflow-y-auto bg-transparent"} text-foreground`}>
            <div className={`relative isolate flex flex-col ${embedded ? "h-full gap-4 overflow-y-auto p-4" : "page-shell gap-6 py-10 sm:py-12"}`}>
                {embedded ? (
                    <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                        <p className="min-w-0 text-xs leading-5 text-muted-foreground">选择模板并启动任务，结果会写入生图历史。</p>
                        <div className="flex flex-wrap items-center gap-2">{createActions}</div>
                    </section>
                ) : (
                    <PageHeader
                        eyebrow="创作工作台"
                        title="工作流"
                        description="把固定提示词与参数沉淀成模板，每次只填变量，就能批量复用同一套创作方法。"
                        meta={
                            <>
                                <span className="chip chip-acid">{filteredWorkflows.length} 个模板</span>
                                {runningTaskCount ? <span className="chip">{runningTaskCount} 运行中</span> : null}
                            </>
                        }
                        actions={createActions}
                    />
                )}

                {embedded && runningTaskCount ? (
                    <section className="rounded-xl border border-border/70 bg-card/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <LoaderCircle className="size-4 animate-spin" />
                                运行中任务
                                <Tag className="m-0" color="processing">{runningTaskCount}</Tag>
                            </div>
                            <span className="text-xs text-muted-foreground">完成后结果会写入生图历史，可随时停止</span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                            {runningTasks.map((task) => (
                                <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs">
                                    <span className="min-w-0 flex-1 truncate" title={task.prompt}>{task.workflowName}{task.seriesTitle ? ` · ${task.seriesTitle}` : ""}</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">{task.images.length}/{task.count} 张</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">已用 {formatDuration(now - task.startedAt)}</span>
                                    <Button size="small" danger loading={stoppingTaskIds.includes(task.id)} onClick={() => void stopWorkflowTask(task)}>停止</Button>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border/70 bg-card/60 p-2.5 lg:p-3">
                    <Input.Search allowClear placeholder="搜索名称、分类、描述" className="w-full max-w-sm" value={query} onChange={(event) => setQuery(event.target.value)} />
                    <Select
                        className="w-36"
                        aria-label="工作流分类"
                        value={workflowCategory}
                        options={[{ value: "all", label: "全部分类" }, ...workflowCategories.map((category) => ({ value: category, label: category }))]}
                        onChange={setWorkflowCategory}
                    />
                    <span className="ml-auto font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">
                        {workflowCategory === "all" ? "全部分类" : workflowCategory} · {filteredWorkflows.length} 个结果
                    </span>
                </section>

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleWorkflows.map((workflow) => (
                        <WorkflowCard key={workflow.id} workflow={workflow} onRun={() => openRunner(workflow)} onEdit={() => setEditingWorkflow(workflow)} onCopy={() => void duplicateWorkflow(workflow)} onDelete={() => void deleteWorkflow(workflow)} />
                    ))}
                    {!filteredWorkflows.length ? (
                        <div className="col-span-full rounded-xl border border-dashed border-border/70 bg-card/30">
                            <EmptyState title="暂无工作流" description="新建一个模板，或让 AI 根据描述生成工作流。" />
                        </div>
                    ) : null}
                </section>
                {filteredWorkflows.length > workflowPageSize ? <Pagination className="justify-center" current={workflowPage} pageSize={workflowPageSize} total={filteredWorkflows.length} showSizeChanger={false} onChange={setWorkflowPage} /> : null}

                {!hideTaskList && workflowTasks.length ? (
                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-base font-semibold">
                                <LoaderCircle className={`size-4 ${runningTaskCount ? "animate-spin" : ""}`} />
                                工作流任务
                                <Tag className="m-0">{workflowTasks.length} 个</Tag>
                                {runningTaskCount ? (
                                    <Tag className="m-0" color="processing">
                                        {runningTaskCount} 运行中
                                    </Tag>
                                ) : null}
                            </div>
                            <Button size="small" onClick={() => setWorkflowTasks((value) => value.filter((task) => task.status === "running"))}>
                                清理已完成
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                            {workflowTasks.map((task) => (
                                <WorkflowTaskCard key={task.id} task={task} now={now} stopping={stoppingTaskIds.includes(task.id)} onCopyPrompt={() => copyText(task.prompt)} onRetry={() => retryWorkflowTask(task)} onStop={() => void stopWorkflowTask(task)} onDownload={(image, index) => saveAs(image.imageUrl, `workflow-task-${index + 1}.png`)} />
                            ))}
                        </div>
                    </section>
                ) : null}

                {!hideTaskList && runResults.length ? (
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <Sparkles className="size-4" />
                            最近运行结果
                            <Tag className="m-0">{runResults.length} 张</Tag>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                            {runResults.map((result, index) => (
                                <div key={result.id} className="overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] hover:border-border/70 hover:shadow-sm">
                                    <Image src={result.imageUrl} alt={result.workflowName} className="aspect-[4/3] object-cover" />
                                    <div className="space-y-1 p-2 text-xs">
                                        <div className="line-clamp-1 font-medium">{result.workflowName}</div>
                                        <div className="flex flex-wrap gap-1 text-muted-foreground">
                                            <Tag className="m-0 text-[10px]">
                                                {result.width}x{result.height}
                                            </Tag>
                                            <Tag className="m-0 text-[10px]">{formatBytes(result.bytes)}</Tag>
                                            <Tag className="m-0 text-[10px]">{formatDuration(result.durationMs)}</Tag>
                                        </div>
                                        <div className="flex justify-end gap-1">
                                            <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(result.prompt)} />
                                            <Button size="small" icon={<Download className="size-3.5" />} onClick={() => saveAs(result.imageUrl, `workflow-${index + 1}.png`)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>

            <WorkflowEditorModal
                open={Boolean(editingWorkflow)}
                workflow={editingWorkflow}
                modelConfig={effectiveConfig}
                theme={theme}
                onChange={setEditingWorkflow}
                onCancel={() => setEditingWorkflow(null)}
                onSave={(workflow) => void saveWorkflow(workflow)}
            />
            <WorkflowAgentModal
                open={agentOpen}
                onClose={() => setAgentOpen(false)}
                effectiveConfig={effectiveConfig}
                openConfigDialog={openConfigDialog}
                agentPrompt={agentPrompt}
                onPromptChange={setAgentPrompt}
                agentScope={agentScope}
                onScopeChange={setAgentScope}
                agentModel={agentModel}
                agentChannelId={agentChannelId}
                onModelChange={(model, channelId) => {
                    setAgentTextModel(model);
                    setAgentTextChannelId(channelId || "");
                }}
                agentModelInfo={agentModelInfo}
                agentReferences={agentReferences}
                onAddReferences={addAgentReferences}
                onRemoveReference={removeAgentReference}
                onOpenAssetPicker={() => setAgentAssetPickerOpen(true)}
                agentLoading={agentLoading}
                onGenerate={runWorkflowAgent}
                agentDraft={agentDraft}
                agentWarnings={agentWarnings}
                onApplyDraft={applyAgentDraft}
            />
            <Modal title={runningWorkflow?.name || "运行工作流"} open={Boolean(runningWorkflow)} width={980} onCancel={closeRunner} footer={null} destroyOnHidden>
                {runningWorkflow ? (
                    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                        <div className="space-y-3">
                            <div className="rounded-lg border border-border p-3">
                                <div className="text-sm font-medium">变量输入</div>
                                <div className="mt-3 space-y-3">
                                    {runningWorkflow.variables.map((variable) => (
                                        <WorkflowVariableInput key={variable.id} variable={variable} value={inputValues[variable.key] || ""} onChange={(value) => setInputValues((current) => ({ ...current, [variable.key]: value }))} />
                                    ))}
                                    {!runningWorkflow.variables.length ? <EmptyState className="py-6" title="此工作流没有变量" /> : null}
                                </div>
                            </div>
                            <div className="rounded-lg border border-border p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium">参考图</div>
                                    <div className="flex gap-2">
                                        <Button size="small" onClick={() => setWorkflowAssetPickerOpen(true)}>
                                            我的素材
                                        </Button>
                                        <Button size="small" onClick={() => workflowReferenceInputRef.current?.click()}>
                                            上传
                                        </Button>
                                    </div>
                                </div>
                                <input
                                    ref={workflowReferenceInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(event) => {
                                        const input = event.currentTarget;
                                        void addWorkflowReferences(input.files).finally(() => {
                                            input.value = "";
                                        });
                                    }}
                                />
                                {workflowReferences.length ? (
                                    <div className="mt-3 grid grid-cols-4 gap-2">
                                        {workflowReferences.map((image) => (
                                            <div key={image.id} className="group relative overflow-hidden rounded-md border border-border">
                                                <img loading="lazy" decoding="async" src={image.dataUrl} alt={image.name} className="aspect-square w-full object-cover" />
                                                <button
                                                    type="button"
                                                    className="absolute right-1 top-1 grid size-6 place-items-center rounded bg-black/65 text-white opacity-0 transition group-hover:opacity-100"
                                                    onClick={() => void removeWorkflowReference(image.id)}
                                                    aria-label="删除参考图"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-3 rounded-md border border-dashed border-border py-5 text-center text-xs text-muted-foreground">未添加参考图</div>
                                )}
                            </div>
                            <Button block type="primary" size="large" loading={seriesDraftLoading} icon={runningWorkflow.mode === "multi_image_series" ? <Layers3 className="size-4" /> : <Play className="size-4" />} onClick={() => void runWorkflow()}>
                                {runningWorkflow.mode === "multi_image_series" ? "生成提示词" : "启动任务"}
                            </Button>
                            <p className="mt-1.5 text-center text-[10px] leading-4 text-muted-foreground/70">
                                计费：平台工作流按后台单价扣算力点{user ? ` · 当前余额 ${user.credits.toLocaleString()}` : ""}；个人渠道工作流不扣积分。
                            </p>
                        </div>
                        <div className="space-y-3">
                            <div className="rounded-lg border border-border p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-sm font-medium">生成提示词预览</span>
                                    <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(renderedPrompt)}>
                                        复制
                                    </Button>
                                </div>
                                <Typography.Paragraph className="!mb-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm dark:bg-background">{renderedPrompt || "填写变量后会在这里预览最终提示词"}</Typography.Paragraph>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                <InfoPill label="模型" value={resolveWorkflowRuntime(runningWorkflow, effectiveConfig).model} />
                                <InfoPill label="接口" value={resolveWorkflowRuntime(runningWorkflow, effectiveConfig).apiMode === "chat" ? "Chat" : resolveWorkflowRuntime(runningWorkflow, effectiveConfig).apiMode === "responses" ? "Responses" : "Images"} />
                                <InfoPill label="尺寸" value={runningWorkflow.config.size || effectiveConfig.size} />
                                <InfoPill label={runningWorkflow.mode === "multi_image_series" ? "草稿数量" : "数量"} value={`${runningWorkflow.mode === "multi_image_series" ? runningWorkflow.seriesConfig.targetCount || "4" : runningWorkflow.config.count || "1"} 张`} />
                            </div>
                            {runningWorkflow.mode === "multi_image_series" ? (
                                <div className="rounded-lg border border-border p-3">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <Layers3 className="size-4" />
                                            多图提示词
                                            <Tag className="m-0">{seriesDrafts.length} 条</Tag>
                                        </div>
                                        <div className="flex gap-2">
                                            {seriesDrafts.length ? (
                                                <Button size="small" danger onClick={() => void clearSeriesDrafts()}>
                                                    清空草稿
                                                </Button>
                                            ) : null}
                                            <Button size="small" loading={seriesDraftLoading} onClick={() => void generateSeriesPromptDrafts()}>
                                                重新生成
                                            </Button>
                                            <Button size="small" type="primary" disabled={!activeSeriesDrafts.length} onClick={() => void runAllSeriesDrafts()}>
                                                全部生成
                                            </Button>
                                        </div>
                                    </div>
                                    {seriesDrafts.length ? (
                                        <>
                                            <div className="mb-3 flex gap-2">
                                                <Input value={seriesBatchAppend} placeholder="批量追加要求，例如：统一使用同一套品牌色和字体风格" onChange={(event) => setSeriesBatchAppend(event.target.value)} />
                                                <Button onClick={applySeriesBatchAppend}>批量追加</Button>
                                            </div>
                                            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                                                {seriesDrafts.map((draft, index) => (
                                                    <SeriesPromptDraftCard
                                                        key={draft.id}
                                                        draft={draft}
                                                        index={index}
                                                        isFirst={index === 0}
                                                        isLast={index === seriesDrafts.length - 1}
                                                        onChange={(patch) => updateSeriesDraft(draft.id, patch)}
                                                        onGenerate={() => void runSeriesDraft(draft, index)}
                                                        onCopy={() => copyText(draft.prompt)}
                                                        onMoveUp={() => moveSeriesDraft(draft.id, -1)}
                                                        onMoveDown={() => moveSeriesDraft(draft.id, 1)}
                                                        onDelete={() => deleteSeriesDraft(draft.id)}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">点击“生成提示词”后在这里审核每张图的提示词</div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </Modal>
            <AssetPickerModal open={agentAssetPickerOpen} defaultTab="my-assets" onInsert={insertAgentAsset} onClose={() => setAgentAssetPickerOpen(false)} />
            <AssetPickerModal open={workflowAssetPickerOpen} defaultTab="my-assets" onInsert={insertWorkflowAsset} onClose={() => setWorkflowAssetPickerOpen(false)} />
        </main>
    );
}

function InfoPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-muted px-3 py-2 dark:bg-background">
            <div>{label}</div>
            <div className="mt-1 truncate text-foreground">{value}</div>
        </div>
    );
}

async function ensureWorkflowCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const categories = (await categoryStore.getItem<GenerationCategory[]>(CATEGORY_STORE_KEY)) || [];
    const existing = categories.find((item) => item.name === trimmed);
    if (existing) return existing;
    const nextCategory = { id: nanoid(), name: trimmed, createdAt: nowMs() };
    await categoryStore.setItem(CATEGORY_STORE_KEY, [...categories, nextCategory]);
    return nextCategory;
}

