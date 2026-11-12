"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    History,
    Bot,
    Clapperboard,
    Copy,
    Cpu,
    Gauge,
    Group,
    Image as ImageIcon,
    ArrowLeftRight,
    Link2,
    Music2,
    PanelRightClose,
    Pencil,
    PlugZap,
    Plus,
    RotateCcw,
    Send,
    Settings2,
    Sparkles,
    Trash2,
    Type,
    Video,
    X,
} from "lucide-react";
import { App, AutoComplete, Button, Modal, Segmented, Switch, Tooltip } from "antd";
import { motion } from "motion/react";
import { nanoid } from "nanoid";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { canvasThemes } from "@/lib/canvas-theme";
import { cn, errorMessage } from "@/lib/utils";
import { canvasStatusColors } from "@/app/(user)/canvas/lib/canvas-palette";
import { fetchSystemAgentSkillFile } from "@/services/api/agent-skills";
import { requestCreditCost } from "@/constant/credits";
import { useAssetStore } from "@/stores/use-asset-store";
import { useAgentSkillStore } from "@/stores/use-agent-skill-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { createCanvasAgentState, runCanvasAgent } from "../agent/canvas-agent-runtime";
import { canvasAgentConfirmation } from "../agent/canvas-agent-confirmation";
import { buildCanvasAgentRequestConfig, canvasAgentJsonFallbackKey, resolveCanvasAgentSkillContents } from "../agent/canvas-agent-request";
import { createConfirmationQueue } from "./confirmation-queue";
import { runAssistantTurn } from "./canvas-assistant-turn";
import { formatAssistantBatch, mergeAssistantBatch, shouldShowAssistantBatch } from "./canvas-assistant-batch";
import { useAssistantSessionWrite } from "./use-assistant-session-write";
import { useCodexAgent } from "../agent/use-codex-agent";
import type { CanvasAgentContext } from "../agent/canvas-agent-context";
import type { CanvasAgentBatchSummary } from "../agent/canvas-agent-runtime";
import type { CanvasAgentAction, CanvasAgentToolResult } from "../agent/canvas-agent-tools";
import {
    MAX_CANVAS_AGENT_SKILLS,
    CanvasNodeType,
    type CanvasAgentConfig,
    type CanvasAssistantBatch,
    type CanvasAgentSkillSelection,
    type CanvasAgentState,
    type CanvasAssistantMessage,
    type CanvasAssistantReference,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasNodeData,
} from "../types";
import { CANVAS_Z } from "../[id]/lib/canvas-layer";
import { canvasNodeDisplayStatus } from "../[id]/lib/canvas-node-meta";
import { isCanvasImageNodeType } from "../utils/canvas-panorama";
import { assistantReferenceContentFromNode, buildAllCanvasResourceReferences, type CanvasResourceReference } from "../utils/canvas-resource-references";
import { useMenuNavigation } from "../utils/use-menu-navigation";
import { assistantToPromptReference, CanvasAssistantComposer } from "./canvas-assistant-composer";
import { CanvasCodexConnectView } from "./canvas-codex-connect-view";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";

const PANEL_MOTION_MS = 500;
const PANEL_MOTION_SECONDS = PANEL_MOTION_MS / 1000;
const ASSISTANT_NODE_TYPE_META = {
    [CanvasNodeType.Image]: { Icon: ImageIcon, label: "图片" },
    [CanvasNodeType.Panorama]: { Icon: ImageIcon, label: "全景图" },
    [CanvasNodeType.Video]: { Icon: Video, label: "视频" },
    [CanvasNodeType.Audio]: { Icon: Music2, label: "音频" },
    [CanvasNodeType.Text]: { Icon: Type, label: "文本" },
    [CanvasNodeType.Config]: { Icon: Settings2, label: "生成配置" },
    [CanvasNodeType.Director]: { Icon: Clapperboard, label: "导演台" },
    [CanvasNodeType.Group]: { Icon: Group, label: "组" },
    [CanvasNodeType.Source]: { Icon: Link2, label: "素材源" },
    [CanvasNodeType.Publish]: { Icon: Send, label: "发布" },
};
const ASSISTANT_NODE_STATUS_COLOR: Record<string, string> = {
    success: canvasStatusColors.success,
    loading: canvasStatusColors.loading,
    error: canvasStatusColors.error,
};

type CanvasAssistantPanelProps = {
    canvasId: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    referenceNodeClick: { nodeId: string | null; version: number };
    sessions: CanvasAssistantSession[];
    activeSessionId: string | null;
    agentConfig: CanvasAgentConfig;
    width: number;
    onWidthChange: (width: number) => void;
    onFocusNode: (nodeId: string) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null) => void;
    onAgentConfigChange: (patch: Partial<CanvasAgentConfig>) => void;
    onPasteImage: (file: File) => void;
    onOpenUpload: () => void;
    onOpenAssets: () => void;
    getAgentContext: (state: CanvasAgentState) => CanvasAgentContext;
    onExecuteAction: (action: CanvasAgentAction, messageReferenceNodeIds: string[]) => Promise<CanvasAgentToolResult>;
    onBatchStart?: () => void;
    onBatchEnd?: (summary: CanvasAgentBatchSummary) => void;
    onCollapseStart: () => void;
    onCollapse: () => void;
    initialRequest?: { prompt: string; references: CanvasAssistantReference[]; skills: CanvasAgentSkillSelection[] } | null;
    onInitialRequestConsumed?: () => void;
};

type PendingConfirmation = {
    title: string;
    detail: string;
    okText: string;
    danger: boolean;
    resolve: (confirmed: boolean) => void;
};

type PanelCardAction = { label: string; onClick: () => void | Promise<void>; danger?: boolean };
type CodexConfirmation = { id: string; title: string; content: ReactNode; actions: PanelCardAction[] };

export function CanvasAssistantPanel({
    canvasId,
    nodes,
    connections,
    selectedNodeIds,
    referenceNodeClick,
    sessions,
    activeSessionId,
    agentConfig,
    width,
    onWidthChange,
    onFocusNode,
    onSessionsChange,
    onAgentConfigChange,
    onPasteImage,
    onOpenUpload,
    onOpenAssets,
    getAgentContext,
    onExecuteAction,
    onBatchStart,
    onBatchEnd,
    onCollapseStart,
    onCollapse,
    initialRequest,
    onInitialRequestConsumed,
}: CanvasAssistantPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const { message: appMessage } = App.useApp();
    const mode = agentConfig.mode || "api";
    const { sessionsRef, activeSessionIdRef, lastSessionIds, syncSessions, commitSessions, updateSession, appendMessage, updateMessage } = useAssistantSessionWrite(onSessionsChange);
    const abortRef = useRef<AbortController | null>(null);
    const consumedInitialRequestRef = useRef<typeof initialRequest>(null);
    const pendingConfirmationRef = useRef<PendingConfirmation | null>(null);
    const confirmationQueueRef = useRef(createConfirmationQueue());
    const lastBatchRef = useRef<CanvasAssistantBatch | null>(null);
    const messageListRef = useRef<HTMLDivElement>(null);
    const consumedReferenceNodeClickVersionRef = useRef(0);
    const [view, setView] = useState<"chat" | "history" | "connect">("chat");
    const [prompt, setPrompt] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [checkedChatIds, setCheckedChatIds] = useState<string[]>([]);
    const [deleteChatIds, setDeleteChatIds] = useState<string[]>([]);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [composerReferenceIds, setComposerReferenceIds] = useState<string[]>([]);
    const [selectedSkills, setSelectedSkills] = useState<CanvasAgentSkillSelection[]>([]);
    const [removedReferenceIds, setRemovedReferenceIds] = useState<Set<string>>(new Set());
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
    const [codexConfirmations, setCodexConfirmations] = useState<CodexConfirmation[]>([]);
    const [initialSession] = useState(() => createSession(mode));
    const drafts = useRef<Partial<Record<"api" | "codex", { prompt: string; references: string[]; skills: CanvasAgentSkillSelection[] }>>>({});
    const safeSessions = useMemo(() => sessions.length ? sessions : [initialSession], [initialSession, sessions]);
    const visibleSessions = safeSessions.filter((session) => (session.provider || "api") === mode);
    const rememberedId = lastSessionIds.current[mode] || activeSessionId;
    const resolvedActiveSessionId = visibleSessions.find((session) => session.id === rememberedId)?.id || visibleSessions[0]?.id || null;
    useEffect(() => {
        syncSessions(safeSessions, resolvedActiveSessionId);
    }, [resolvedActiveSessionId, safeSessions, syncSessions]);

    useEffect(() => () => {
        abortRef.current?.abort();
        pendingConfirmationRef.current?.resolve(false);
        pendingConfirmationRef.current = null;
    }, []);

    const activeSession = visibleSessions.find((session) => session.id === resolvedActiveSessionId) || visibleSessions[0] || null;
    const historySessions = visibleSessions.filter((session) => session.messages.length > 0);
    const messages = useMemo(() => activeSession?.messages || [], [activeSession]);
    const hasMessages = messages.length > 0;
    const selectedNodeKey = useMemo(() => Array.from(selectedNodeIds).sort().join(","), [selectedNodeIds]);

    const resourceReferences = useMemo(() => buildAllCanvasResourceReferences(nodes), [nodes]);
    const resourceReferenceById = useMemo(() => new Map(resourceReferences.map((reference) => [reference.nodeId, reference])), [resourceReferences]);
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const resolveReferences = useCallback((ids: string[]) => ids.flatMap((id) => {
        const node = nodeById.get(id);
        const resource = resourceReferenceById.get(id);
        const reference = node && resource ? nodeToReference(node, resource) : null;
        return reference ? [reference] : [];
    }), [nodeById, resourceReferenceById]);
    const composerReferences = useMemo(() => resolveReferences(composerReferenceIds), [composerReferenceIds, resolveReferences]);
    const pendingReferences = useMemo(() => {
        const pendingClickNodeId = referenceNodeClick.version > consumedReferenceNodeClickVersionRef.current ? referenceNodeClick.nodeId : null;
        return resourceReferences.filter(
            (reference) => selectedNodeIds.has(reference.nodeId) && ((!composerReferenceIds.includes(reference.nodeId) && !removedReferenceIds.has(reference.nodeId)) || reference.nodeId === pendingClickNodeId),
        );
    }, [composerReferenceIds, referenceNodeClick, removedReferenceIds, resourceReferences, selectedNodeIds]);
    const iconButtonStyle = { color: theme.node.muted };
    const handleBatchEnd = (summary: CanvasAgentBatchSummary) => {
        lastBatchRef.current = mergeAssistantBatch(lastBatchRef.current, summary);
        onBatchEnd?.(summary);
        if (summary.rolledBack) appMessage.warning("本批操作未完成，已回滚本次画布结构变更");
    };

    /** 媒体确认卡上的预估算力点：复用工作台的计价工具，本地渠道为 0。 */
    const estimateMediaCredits = (action: CanvasAgentAction) => {
        const args = action.arguments;
        const channelMode = effectiveConfig.channelMode;
        if (action.name === "generate_image" || action.name === "edit_image") {
            return requestCreditCost({ channelMode, modelCosts, model: effectiveConfig.imageModel || effectiveConfig.model, count: typeof args.count === "number" ? args.count : 1 });
        }
        if (action.name === "generate_video") {
            return requestCreditCost({
                channelMode,
                modelCosts,
                model: effectiveConfig.videoModel || effectiveConfig.model,
                resolution: effectiveConfig.vquality,
                seconds: typeof args.seconds === "number" ? args.seconds : effectiveConfig.videoSeconds,
            });
        }
        if (action.name === "generate_audio") return requestCreditCost({ channelMode, modelCosts, model: effectiveConfig.audioModel, count: 1 });
        return 0;
    };

    const settleConfirmation = (confirmed: boolean) => {
        const pending = pendingConfirmationRef.current;
        if (!pending) return;
        pendingConfirmationRef.current = null;
        setPendingConfirmation(null);
        pending.resolve(confirmed);
    };

    /** 并行工具调用时逐个弹确认，避免后一个覆盖前一个。 */
    const requestConfirmation = (confirmation: Omit<PendingConfirmation, "resolve">, provider: "api" | "codex", signal: AbortSignal) =>
        confirmationQueueRef.current(async () => {
            if (signal.aborted) return false;
            if (provider === "codex") return confirmCodex(confirmation.title, <div className="text-xs opacity-55">{confirmation.detail}</div>, signal, confirmation.okText, "取消", confirmation.danger);
            return new Promise<boolean>((resolve) => {
                const finish = (value: boolean) => {
                    signal.removeEventListener("abort", cancel);
                    resolve(value);
                };
                const cancel = () => settleConfirmation(false);
                signal.addEventListener("abort", cancel, { once: true });
                pendingConfirmationRef.current?.resolve(false);
                const pending = { ...confirmation, resolve: finish };
                pendingConfirmationRef.current = pending;
                setPendingConfirmation(pending);
            });
        });

    useEffect(() => {
        setRemovedReferenceIds(new Set());
    }, [selectedNodeKey]);

    const startChatSession = () => {
        setSelectedSkills([]);
        if (activeSession && activeSession.messages.length === 0) {
            commitSessions(sessionsRef.current, activeSession.id);
            return;
        }
        const session = createSession(mode);
        commitSessions([session, ...sessionsRef.current], session.id);
    };

    const removeSessions = async (ids: string[]) => {
        const removing = sessionsRef.current.filter((session) => (session.provider || "api") === mode && ids.includes(session.id));
        await Promise.all(removing.filter((session) => session.codexThreadId).map((session) => codex.archive(session.codexThreadId!, session.codexServiceId)));
        const next = sessionsRef.current.filter((session) => !removing.some((item) => item.id === session.id));
        let selected = next.find((session) => session.id === activeSessionIdRef.current)
            || next.find((session) => (session.provider || "api") === mode);
        if (!selected) { selected = createSession(mode); next.unshift(selected); }
        commitSessions(next, selected.id);
        if (!next.some((session) => (session.provider || "api") === mode && session.messages.length)) {
            const draft = drafts.current[mode];
            if (draft?.skills === selectedSkills) draft.skills = [];
            setSelectedSkills((current) => current === selectedSkills ? [] : current);
        }
        cleanupImages({ sessions: next });
        setCheckedChatIds((previous) => previous.filter((id) => !ids.includes(id)));
    };

    const selectComposerSkill = (skill: CanvasAgentSkillSelection) => {
        const existingIndex = selectedSkills.findIndex((selected) => selected.id === skill.id && selected.source === skill.source);
        if (existingIndex >= 0) {
            setSelectedSkills(selectedSkills.map((selected, index) => (index === existingIndex ? skill : selected)));
            return;
        }
        if (selectedSkills.length >= MAX_CANVAS_AGENT_SKILLS) {
            appMessage.warning(`最多选择 ${MAX_CANVAS_AGENT_SKILLS} 个 Skill`);
            return;
        }
        setSelectedSkills([...selectedSkills, skill]);
    };

    const removeComposerSkill = (id: string, source: CanvasAgentSkillSelection["source"]) => {
        setSelectedSkills((current) => current.filter((skill) => skill.id !== id || skill.source !== source));
    };

    const executeCanvasTool = async (action: CanvasAgentAction, messageReferenceNodeIds: string[], activeSkills: CanvasAgentSkillSelection[], provider: "api" | "codex", signal: AbortSignal): Promise<CanvasAgentToolResult> => {
        signal.throwIfAborted();
        if (action.name === "read_skill_file") {
            const skillId = typeof action.arguments.skillId === "string" ? action.arguments.skillId : "";
            const filePath = typeof action.arguments.path === "string" ? action.arguments.path : "";
            const activeSkill = activeSkills.find((skill) => skill.id === skillId && skill.source === "system");
            if (!activeSkill) return { ok: false, code: "skill_not_active", message: "只能读取当前激活的系统 Skill 文件" };
            try {
                const file = await fetchSystemAgentSkillFile(skillId, filePath);
                return { ok: true, skillId, path: file.path, content: file.content };
            } catch (error) {
                return { ok: false, code: "skill_file_not_found", message: errorMessage(error, "Skill 文件读取失败") };
            }
        }
        const creditCost = estimateMediaCredits(action);
        const confirmation = canvasAgentConfirmation(action, { nodes, connections, autoGenerateMedia: Boolean(agentConfig.autoGenerateMedia), confirmMediaGeneration: agentConfig.confirmMediaGeneration, creditCost });
        if (!confirmation) return onExecuteAction(action, messageReferenceNodeIds);
        const confirmed = await requestConfirmation(confirmation, provider, signal);
        signal.throwIfAborted();
        if (confirmed) return onExecuteAction(action, messageReferenceNodeIds);
        return { ok: false, code: action.name === "delete_node" ? "delete_cancelled" : "action_cancelled", message: action.name === "delete_node" ? "用户取消删除，原节点已保留" : "用户取消操作，画布未变更" };
    };

    const confirmCodex = (title: string, content: ReactNode, signal: AbortSignal, okText = "允许一次", cancelText = "拒绝", danger = false) => new Promise<boolean>((resolve) => {
        const finish = (allowed: boolean) => { signal.removeEventListener("abort", cancel); setCodexConfirmations((current) => current.filter((item) => item !== confirmation)); resolve(allowed); };
        const cancel = () => finish(false);
        const confirmation = { id: nanoid(), title, content, actions: [{ label: cancelText, onClick: cancel }, { label: okText, danger, onClick: () => finish(true) }] };
        setCodexConfirmations((current) => [...current, confirmation]);
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
    });
    const codex = useCodexAgent({
        canvasId,
        onBootstrap: () => { if (mode === "api") switchMode(); else setView("chat"); },
        executeTool: async (action, signal) => {
            if (action.name === "arrange_nodes" && !(await confirmCodex("允许 Codex 整理画布？", <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(action.arguments, null, 2)}</pre>, signal))) return { ok: false, code: "action_not_requested", message: "未允许整理画布" };
            return executeCanvasTool(action, [], [], "codex", signal);
        },
        onApproval: async ({ method, params }, signal) => {
            if (method === "mcpServer/elicitation/request") {
                appMessage.info("Codex 工具请求了额外信息，本次请求已取消");
                return { action: "decline", content: null };
            }
            const questions = method === "item/tool/requestUserInput"
                ? params.questions as Array<{ id: string; question: string; options?: Array<{ label: string; description?: string }> }> : null;
            const answers: Record<string, { answers: string[] }> = {};
            const accepted = await confirmCodex(
                questions ? "Codex 需要补充信息" : "Codex 请求授权",
                questions ? <div className="space-y-3">{questions.map((question) => <div key={question.id}>
                    <div className="mb-1 text-sm">{question.question}</div>
                    <AutoComplete className="w-full" aria-label={question.question} options={question.options?.map((option) => ({ value: option.label, label: option.description ? `${option.label}：${option.description}` : option.label }))} onChange={(value) => { answers[question.id] = { answers: [value] }; }} />
                </div>)}</div> : <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(params, null, 2)}</pre>,
                signal, questions ? "提交" : "允许一次", questions ? "取消" : "拒绝",
            );
            return questions ? { answers: accepted ? answers : {} } : method === "item/permissions/requestApproval"
                ? { permissions: accepted ? params.permissions || {} : {}, scope: "turn" }
                : { decision: accepted ? "accept" : "decline" };
        },
    });
    const switchMode = () => {
        if (isRunning) return;
        const next = mode === "api" ? "codex" : "api";
        if (activeSessionIdRef.current) lastSessionIds.current[mode] = activeSessionIdRef.current;
        drafts.current[mode] = { prompt, references: composerReferenceIds, skills: selectedSkills };
        const nextSessions = sessionsRef.current.filter((session) => (session.provider || "api") === next);
        commitSessions(sessionsRef.current, nextSessions.find((session) => session.id === lastSessionIds.current[next])?.id || nextSessions[0]?.id || null);
        onAgentConfigChange({ mode: next });
        setView("chat");
        setPrompt(drafts.current[next]?.prompt || "");
        setComposerReferenceIds(drafts.current[next]?.references || []);
        setRemovedReferenceIds(new Set());
        setSelectedSkills(drafts.current[next]?.skills || []);
        setCheckedChatIds([]);
        setDeleteChatIds([]);
    };
    const codexModel = codex.models.find((item) => item.model === agentConfig.codexModel) || codex.models.find((item) => item.isDefault) || codex.models[0];
    const effortLabels: Record<string, string> = { none: "不推理", minimal: "最低", low: "低", medium: "中", high: "高", xhigh: "极高", max: "最大", ultra: "超高" };
    const codexEffort = agentConfig.codexEffort || codexModel?.defaultReasoningEffort;
    const showCodexConnection = mode === "codex" && (view === "connect" || (view === "chat" && codex.status !== "ready"));
    useEffect(() => {
        if (view !== "chat" || showCodexConnection) return;
        const frame = window.requestAnimationFrame(() => {
            const element = messageListRef.current;
            if (element) element.scrollTop = element.scrollHeight;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [messages, view, showCodexConnection]);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const [effortMenuOpen, setEffortMenuOpen] = useState(false);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const effortMenuRef = useRef<HTMLDivElement>(null);
    const modelTriggerRef = useRef<HTMLButtonElement>(null);
    const effortTriggerRef = useRef<HTMLButtonElement>(null);

    const modelMenuNavigation = useMenuNavigation({ open: modelMenuOpen, onClose: () => setModelMenuOpen(false), panelRef: modelMenuRef, triggerRef: modelTriggerRef, stopEscapePropagation: true });
    const effortMenuNavigation = useMenuNavigation({ open: effortMenuOpen, onClose: () => setEffortMenuOpen(false), panelRef: effortMenuRef, triggerRef: effortTriggerRef, stopEscapePropagation: true });
    const codexControls = mode === "codex" ? (
        <>
            <div className="relative">
                <Button ref={modelTriggerRef} type="text" className="!h-9 !min-w-8 !shrink-0 !px-2" style={{ color: theme.node.text, background: modelMenuOpen ? theme.toolbar.activeBg : undefined }} icon={<Cpu className="size-4" />} aria-label="选择 Codex 模型" aria-haspopup="menu" aria-expanded={modelMenuOpen} disabled={isRunning || !codex.models.length} onClick={() => setModelMenuOpen((value) => !value)}><span className="hidden max-w-28 truncate @[660px]:inline">{codexModel?.displayName || "选择模型"}</span></Button>
                {modelMenuOpen ? (
                    <div ref={modelMenuRef} role="menu" className="absolute bottom-full left-0 mb-2 max-h-64 w-44 overflow-y-auto rounded-xl border p-1" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, boxShadow: theme.shadow.float, zIndex: CANVAS_Z.toolbarMenu, "--canvas-menu-hover": theme.toolbar.itemHover } as CSSProperties} onKeyDown={modelMenuNavigation.handleKeyDown}>
                        {codex.models.map((item) => (
                            <button key={item.model} type="button" role="menuitem" className="w-full truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[var(--canvas-menu-hover)]" style={{ color: theme.node.text, background: codexModel?.model === item.model ? theme.toolbar.activeBg : undefined }} onClick={() => { setModelMenuOpen(false); onAgentConfigChange({ codexModel: item.model, codexEffort: undefined }); }}>{item.displayName}</button>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="relative">
                <Button ref={effortTriggerRef} type="text" className="!h-9 !min-w-8 !shrink-0 !px-2" style={{ color: theme.node.text, background: effortMenuOpen ? theme.toolbar.activeBg : undefined }} icon={<Gauge className="size-4" />} aria-label="选择 Codex 推理强度" aria-haspopup="menu" aria-expanded={effortMenuOpen} disabled={isRunning || !codexModel?.supportedReasoningEfforts.length} onClick={() => setEffortMenuOpen((value) => !value)}><span className="hidden @[660px]:inline">{effortLabels[codexEffort || ""] || codexEffort}</span></Button>
                {effortMenuOpen ? (
                    <div ref={effortMenuRef} role="menu" className="absolute bottom-full left-0 mb-2 max-h-64 w-36 overflow-y-auto rounded-xl border p-1" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, boxShadow: theme.shadow.float, zIndex: CANVAS_Z.toolbarMenu, "--canvas-menu-hover": theme.toolbar.itemHover } as CSSProperties} onKeyDown={effortMenuNavigation.handleKeyDown}>
                        {codexModel?.supportedReasoningEfforts.map((item) => (
                            <button key={item.reasoningEffort} type="button" role="menuitem" className="w-full truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[var(--canvas-menu-hover)]" style={{ color: theme.node.text, background: codexEffort === item.reasoningEffort ? theme.toolbar.activeBg : undefined }} onClick={() => { setEffortMenuOpen(false); onAgentConfigChange({ codexEffort: item.reasoningEffort }); }}>{effortLabels[item.reasoningEffort] || item.reasoningEffort}</button>
                        ))}
                    </div>
                ) : null}
            </div>
        </>
    ) : undefined;

    const sendMessage = async (text: string, savedReferences?: CanvasAssistantReference[], skillOverride?: CanvasAgentSkillSelection[] | null, showSelectedSkills = skillOverride === undefined && selectedSkills.length > 0) => {
        if (abortRef.current) return;
        if (mode === "codex" && codex.status !== "ready") { setView("connect"); appMessage.info("请先连接本地 Codex 服务"); return; }
        const session = activeSession || createSession(mode);
        const activeSkills = skillOverride !== undefined ? skillOverride || [] : selectedSkills.length ? selectedSkills : session.activeSkills || [];
        let activeSkillContents: Array<{ id: string; source: CanvasAgentSkillSelection["source"]; name: string; content: string; hasFiles?: boolean }> = [];

        if (activeSkills.length) {
            const skillStore = useAgentSkillStore.getState();
            if (!skillStore.systemSkills.length && !skillStore.userSkills.length) {
                try {
                    await skillStore.loadSkills();
                } catch (error) {
                    appMessage.error(errorMessage(error, "Skill 加载失败"));
                    return;
                }
            }
            const availableSkills = [...useAgentSkillStore.getState().systemSkills, ...useAgentSkillStore.getState().userSkills];
            const resolvedSkills = resolveCanvasAgentSkillContents(activeSkills, availableSkills);
            if (!resolvedSkills.ok) {
                appMessage.error(resolvedSkills.message);
                return;
            }
            activeSkillContents = resolvedSkills.contents;
        }

        if (!activeSession) commitSessions([session, ...sessionsRef.current], session.id);
        updateSession(session.id, (current) => ({
            ...current,
            activeSkills,
            updatedAt: new Date().toISOString(),
        }));

        const references = savedReferences || composerReferences;
        const messageReferenceNodeIds = references.map((reference) => reference.id);
        const userMessage: CanvasAssistantMessage = { id: nanoid(), role: "user", text, references, skills: activeSkills, skillsSelected: showSelectedSkills, status: "success" };
        const assistantId = nanoid();
        appendMessage(session.id, userMessage);
        appendMessage(session.id, { id: assistantId, role: "assistant", text: "", status: "thinking", activity: "正在理解画布和创作目标" });
        setPrompt("");
        setComposerReferenceIds([]);
        setSelectedSkills([]);
        setRemovedReferenceIds(new Set(selectedNodeIds));

        const requestConfig = buildCanvasAgentRequestConfig(effectiveConfig, agentConfig);
        const jsonToolFallbackKey = canvasAgentJsonFallbackKey(requestConfig);
        if (mode === "api" && !isAiConfigReady(requestConfig, requestConfig.model)) {
            updateMessage(session.id, assistantId, {
                text: "全局文本模型尚未配置完成。请先从应用原有的全局配置入口选择文本模型和渠道，然后再继续。",
                status: "error",
                activity: undefined,
            });
            return;
        }

        lastBatchRef.current = null;
        await runAssistantTurn({
            session,
            assistantId,
            userText: text,
            references,
            activeSkillContents,
            requestConfig,
            jsonToolFallbackKey,
            createRunner: (turnSession, turnAssistantId) =>
                mode === "codex"
                    ? (agentInput) => codex.run({
                        ...agentInput,
                        threadId: turnSession.codexThreadId,
                        serviceId: turnSession.codexServiceId,
                        model: codexModel?.model,
                        effort: codexEffort,
                        onThread: (codexThreadId, codexServiceId) => updateSession(turnSession.id, (current) => ({ ...current, codexThreadId, codexServiceId })),
                        onText: (nextText) => updateMessage(turnSession.id, turnAssistantId, { text: nextText }),
                    })
                    : runCanvasAgent,
            getAgentContext,
            executeAction: (action, signal) => executeCanvasTool(action, messageReferenceNodeIds, activeSkills, mode, signal),
            onBatchStart,
            onBatchEnd: handleBatchEnd,
            updateSession,
            updateMessage,
            takeAbort: (controller) => { abortRef.current = controller; },
            releaseAbort: (controller) => { if (abortRef.current === controller) abortRef.current = null; },
            onRunningChange: setIsRunning,
        });
        const batch = lastBatchRef.current;
        lastBatchRef.current = null;
        if (batch && shouldShowAssistantBatch(batch)) updateMessage(session.id, assistantId, { batch });
    };
    const sendMessageRef = useRef(sendMessage);
    sendMessageRef.current = sendMessage;

    useEffect(() => {
        if (!initialRequest || consumedInitialRequestRef.current === initialRequest) return;
        consumedInitialRequestRef.current = initialRequest;
        onInitialRequestConsumed?.();
        void sendMessageRef.current(initialRequest.prompt, initialRequest.references, initialRequest.skills, initialRequest.skills.length > 0);
    }, [initialRequest, onInitialRequestConsumed]);

    const submit = async (nextPrompt = prompt, referenceIds = composerReferenceIds) => {
        const text = nextPrompt.trim();
        if (!text || isRunning) return;
        await sendMessage(text, resolveReferences(referenceIds));
    };

    const retryMessage = (message: CanvasAssistantMessage) => {
        const index = messages.findIndex((item) => item.id === message.id);
        const user = messages.slice(0, index).findLast((item) => item.role === "user");
        if (user) void sendMessage(user.text, user.references, user.skills || []);
    };

    const startResize = () => {
        const move = (event: MouseEvent) => onWidthChange(Math.min(760, Math.max(464, window.innerWidth - event.clientX)));
        const stop = () => {
            setResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    };

    const collapse = () => {
        setClosing(true);
        onCollapseStart();
        window.setTimeout(onCollapse, PANEL_MOTION_MS);
    };

    return (
        <>
            {!closing ? <div className="fixed inset-0 z-[65] bg-black/35 md:hidden" onClick={collapse} aria-hidden /> : null}
            <motion.div
                className={cn("flex shrink-0 max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-[70]", !closing && "max-md:!w-[92vw]")}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: closing ? 0 : width + 1, opacity: closing ? 0 : 1 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: "clip", pointerEvents: closing ? "none" : undefined }}
            >
            <motion.aside
                data-canvas-agent-panel
                className={cn("relative flex shrink-0 flex-col border-l max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-2xl", !closing && "max-md:!w-[92vw]")}
                initial={{ x: 48 }}
                animate={{ x: closing ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 hidden w-4 -translate-x-1/2 cursor-col-resize md:block" onMouseDown={(event) => { event.preventDefault(); startResize(); }} aria-label="调整右侧面板宽度" />
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Bot className="size-4" />
                        {view === "history" ? "历史记录" : mode === "codex" ? "Codex" : "创作 Agent"}
                        <Tooltip title={mode === "codex" ? "切换回创作 Agent" : "切换到 Codex"}>
                            <Button size="small" className="!h-7 !rounded-md !px-2.5 !shadow-none" style={{ font: "inherit", color: theme.node.text, background: "transparent", borderColor: theme.node.stroke }} icon={<ArrowLeftRight className="size-3.5" />} disabled={isRunning} onClick={switchMode}>{mode === "codex" ? "创作 Agent" : "Codex"}</Button>
                        </Tooltip>
                    </div>
                    <div className="flex items-center gap-1">
                        {mode === "codex" ? <Tooltip title="连接教程"><Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<PlugZap className="size-4" />} aria-label="连接教程" disabled={isRunning} onClick={() => { setView("connect"); messageListRef.current?.scrollTo({ top: 0 }); }} /></Tooltip> : null}
                        {view === "history" ? (
                            <>
                                <Tooltip title="删除选中">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Trash2 className="size-4" />} disabled={!checkedChatIds.length} onClick={() => setDeleteChatIds(checkedChatIds)} />
                                </Tooltip>
                                <Tooltip title="删除全部">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<X className="size-4" />} disabled={!historySessions.length} onClick={() => setDeleteChatIds(historySessions.map((session) => session.id))} />
                                </Tooltip>
                            </>
                        ) : null}
                        <Tooltip title={view === "history" ? "返回对话" : "历史记录"}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<History className="size-4" />} onClick={() => setView(view === "history" ? "chat" : "history")} />
                        </Tooltip>
                        <Tooltip title="新对话">
                            <Button
                                type="text"
                                shape="circle"
                                className="!h-8 !w-8 !min-w-8"
                                style={iconButtonStyle}
                                icon={<Plus className="size-4" />}
                                disabled={!hasMessages}
                                onClick={() => {
                                    startChatSession();
                                    setView("chat");
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="Agent 设置">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Settings2 className="size-4" />} onClick={() => setSettingsOpen(true)} />
                        </Tooltip>
                        <Tooltip title="收起对话">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<PanelRightClose className="size-4" />} onClick={collapse} />
                        </Tooltip>
                    </div>
                </div>

                <div ref={messageListRef} className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                    {showCodexConnection ? <CanvasCodexConnectView agent={codex} onChat={() => setView("chat")} /> : view === "history" ? (
                        <AssistantHistory
                            sessions={historySessions}
                            activeSession={activeSession}
                            checkedIds={checkedChatIds.filter((id) => historySessions.some((session) => session.id === id))}
                            onToggleChecked={(id, checked) => setCheckedChatIds((previous) => (checked ? [...new Set([...previous, id])] : previous.filter((item) => item !== id)))}
                            onOpen={(id) => {
                                commitSessions(sessionsRef.current, id);
                                setSelectedSkills([]);
                                setView("chat");
                            }}
                            onRename={(id, title) => updateSession(id, (session) => ({ ...session, title, updatedAt: new Date().toISOString() }))}
                            onDelete={(id) => setDeleteChatIds([id])}
                        />
                    ) : messages.length ? (
                        <AssistantMessages messages={messages} nodeById={nodeById} onFocusNode={onFocusNode} onRetry={retryMessage} codexMode={mode === "codex"} />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                            <div className="grid size-12 place-items-center rounded-2xl" style={{ background: theme.node.fill }}>
                                <Sparkles className="size-5" />
                            </div>
                            <div className="mt-4 text-base font-medium">从一个想法开始</div>
                            <div className="mt-2 max-w-[260px] text-sm leading-6 opacity-55">描述故事、宣传片或现有素材，Agent 会与你沟通并直接操作当前画布</div>
                        </div>
                    )}
                </div>

                {(mode === "api" ? pendingConfirmation : codexConfirmations.length) ? (
                    <div className="thin-scrollbar max-h-[50%] shrink-0 space-y-2 overflow-y-auto pb-2">
                        {mode === "api" && pendingConfirmation ? <AssistantPanelCard title={pendingConfirmation.title} actions={[
                            { label: "取消", onClick: () => settleConfirmation(false) },
                            { label: pendingConfirmation.okText, danger: pendingConfirmation.danger, onClick: () => settleConfirmation(true) },
                        ]}><div className="text-xs opacity-55">{pendingConfirmation.detail}</div></AssistantPanelCard> : null}
                        {mode === "codex" ? codexConfirmations.map((confirmation) => <AssistantPanelCard key={confirmation.id} title={confirmation.title} actions={confirmation.actions}>{confirmation.content}</AssistantPanelCard>) : null}
                    </div>
                ) : null}
                {view === "chat" && !showCodexConnection ? (
                    <CanvasAssistantComposer
                        prompt={prompt}
                        isRunning={isRunning}
                        codexControls={codexControls}
                        references={composerReferences}
                        availableReferences={resourceReferences}
                        pendingReferences={pendingReferences}
                        selectedSkills={selectedSkills}
                        agentConfig={agentConfig}
                        onAgentConfigChange={onAgentConfigChange}
                        onPromptChange={setPrompt}
                        onSkillSelect={selectComposerSkill}
                        onSkillRemove={removeComposerSkill}
                        onReferenceIdsChange={(ids) => {
                            consumedReferenceNodeClickVersionRef.current = referenceNodeClick.version;
                            const removedSelectedIds = composerReferenceIds.filter((id) => selectedNodeIds.has(id) && !ids.includes(id));
                            if (removedSelectedIds.length) setRemovedReferenceIds((previous) => new Set([...previous, ...removedSelectedIds]));
                            setComposerReferenceIds(ids);
                        }}
                        onSubmit={submit}
                        onStop={() => abortRef.current?.abort()}
                        onOpenUpload={onOpenUpload}
                        onOpenAssets={onOpenAssets}
                        onPasteImage={onPasteImage}
                    />
                ) : null}

                <Modal
                    title="Agent 设置"
                    open={settingsOpen}
                    centered
                    width={520}
                    onCancel={() => setSettingsOpen(false)}
                    footer={<Button type="primary" onClick={() => setSettingsOpen(false)}>完成</Button>}
                >
                    {mode !== "codex" ? <div className="flex items-center justify-between gap-6 py-2">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">文本接口</div>
                            <div className="mt-1 text-xs leading-5 opacity-55">选择使用 Chat Completions 或 Responses 接口</div>
                        </div>
                        <Segmented
                            value={agentConfig.textApiMode}
                            options={[{ label: "Chat", value: "chat" }, { label: "Responses", value: "responses" }]}
                            onChange={(textApiMode) => onAgentConfigChange({ textApiMode: textApiMode as CanvasAgentConfig["textApiMode"] })}
                        />
                    </div> : null}
                    {mode !== "codex" ? <div className="flex items-center justify-between gap-6 py-2">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">流式响应</div>
                            <div className="mt-1 text-xs leading-5 opacity-55">开启后以流式读取文本模型回复</div>
                        </div>
                        <Switch checked={agentConfig.textStreaming === true} onChange={(textStreaming) => onAgentConfigChange({ textStreaming })} />
                    </div> : null}
                    <div className="flex items-center justify-between gap-6 py-2">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">自动生成图片/视频/音频</div>
                            <div className="mt-1 text-xs leading-5 opacity-55">开启后，Agent 可直接提交图片/视频/音频生成</div>
                        </div>
                        <Switch checked={agentConfig.autoGenerateMedia} onChange={(autoGenerateMedia) => onAgentConfigChange({ autoGenerateMedia })} />
                    </div>
                    <div className="flex items-center justify-between gap-6 py-2">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">提交生成前确认</div>
                            <div className="mt-1 text-xs leading-5 opacity-55">仅在自动生成开启时生效；关闭后媒体任务直接提交，不再弹出确认卡</div>
                        </div>
                        <Switch checked={agentConfig.confirmMediaGeneration !== false} onChange={(confirmMediaGeneration) => onAgentConfigChange({ confirmMediaGeneration })} />
                    </div>
                </Modal>

                <ConfirmDialog
                    open={deleteChatIds.length > 0}
                    title="删除对话记录？"
                    description={`将删除 ${deleteChatIds.length} 条对话记录，此操作不可撤销`}
                    confirmText="删除"
                    cancelText="取消"
                    tone="danger"
                    onConfirm={async () => {
                        try {
                            await removeSessions(deleteChatIds);
                            setDeleteChatIds((current) => current === deleteChatIds ? [] : current);
                        } catch (error) { appMessage.error(errorMessage(error, "删除会话失败")); }
                    }}
                    onCancel={() => setDeleteChatIds([])}
                />
            </motion.aside>
            </motion.div>
        </>
    );
}

function AssistantPanelCard({ title, children, actions }: { title: string; children: ReactNode; actions: PanelCardAction[] }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <section className="mx-2 overflow-hidden rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }} aria-label={title}>
        <div className="min-w-0 px-3 py-2.5">
            <div className="break-words text-sm font-medium">{title}</div>
            <div className="mt-1">{children}</div>
        </div>
        <div className="flex border-t" style={{ borderColor: theme.node.stroke }}>
            {actions.map((action, index) => <button key={action.label} type="button" className={cn("h-9 min-w-0 flex-1 cursor-pointer bg-transparent text-sm", index > 0 && "border-l", action.danger && "font-medium")} style={{ borderColor: theme.node.stroke, color: action.danger ? "var(--destructive)" : theme.node.text }} onClick={action.onClick}>{action.label}</button>)}
        </div>
    </section>;
}

const ASSISTANT_MARKDOWN_COMPONENTS: Components = {
    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4" />,
};

function AssistantMarkdown({ children, components }: { children: string; components: Components }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div
            className={cn(
                "min-w-0 whitespace-normal break-words",
                "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h1:first-child]:mt-0",
                "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2:first-child]:mt-0",
                "[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3:first-child]:mt-0",
                "[&_h4]:my-2 [&_h4]:font-semibold",
                "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
                "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[color:var(--agent-markdown-border)] [&_blockquote]:pl-3 [&_blockquote]:opacity-80",
                "[&_hr]:my-3 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[color:var(--agent-markdown-border)]",
                "[&_code]:rounded [&_code]:bg-[var(--agent-markdown-surface)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
                "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--agent-markdown-surface)] [&_pre]:p-3",
                "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
                "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border-b [&_th]:border-[color:var(--agent-markdown-border)] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_td]:border-b [&_td]:border-[color:var(--agent-markdown-border)] [&_td]:px-2 [&_td]:py-1.5",
            )}
            style={
                {
                    "--agent-markdown-surface": theme.toolbar.itemHover,
                    "--agent-markdown-border": theme.node.stroke,
                } as CSSProperties
            }
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
                {children}
            </ReactMarkdown>
        </div>
    );
}

function AssistantMessages({ messages, nodeById, onFocusNode, onRetry, codexMode }: { messages: CanvasAssistantMessage[]; nodeById: ReadonlyMap<string, CanvasNodeData>; onFocusNode: (nodeId: string) => void; onRetry: (message: CanvasAssistantMessage) => void; codexMode?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const copyText = useCopyText();
    const markdownComponents = useMemo<Components>(() => ({
        ...ASSISTANT_MARKDOWN_COMPONENTS,
        code: ({ node, className, children, ...props }) => {
            const canvasNode = nodeById.get(String(children).trim());
            if (node?.position?.start.line === node?.position?.end.line && canvasNode) {
                const { Icon, label: typeLabel } = ASSISTANT_NODE_TYPE_META[canvasNode.type];
                const hasImage = isCanvasImageNodeType(canvasNode.type) && canvasNode.metadata?.content;
                const nodeStatus = canvasNodeDisplayStatus(canvasNode);
                return (
                    <span className="my-1 flex w-full min-w-0 items-center rounded-lg transition-opacity hover:opacity-80" style={{ background: theme.toolbar.itemHover }}>
                        <button type="button" onClick={() => onFocusNode(canvasNode.id)} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left outline-none" title={`定位到画布节点：${canvasNode.title || typeLabel}`}>
                            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md">
                                {hasImage ? <img loading="lazy" decoding="async" src={canvasNode.metadata?.content} alt={canvasNode.title || typeLabel} className="size-full object-cover" /> : <Icon className="size-5 opacity-60" />}
                            </span>
                            <span className="min-w-0 flex-1 space-y-0.5">
                                <span className="block truncate text-sm font-medium leading-snug">{canvasNode.title || `${typeLabel}节点`}</span>
                                <span className="block truncate text-xs leading-snug opacity-50">{canvasNode.type === CanvasNodeType.Text ? canvasNode.metadata?.content || canvasNode.metadata?.prompt || "" : typeLabel}</span>
                            </span>
                            {nodeStatus && nodeStatus !== "idle" ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: ASSISTANT_NODE_STATUS_COLOR[nodeStatus] || "transparent", boxShadow: `0 0 0 2px color-mix(in srgb, ${ASSISTANT_NODE_STATUS_COLOR[nodeStatus] || "transparent"} 22%, transparent), 0 0 8px ${ASSISTANT_NODE_STATUS_COLOR[nodeStatus] || "transparent"}` }} /> : null}
                        </button>
                    </span>
                );
            }
            return <code {...props} className={className}>{children}</code>;
        },
    }), [nodeById, onFocusNode, theme]);
    let previousUserSkills: CanvasAgentSkillSelection[] = [];

    return (
        <>
            {messages.map((message) => {
                const running = message.status === "thinking" || message.status === "running";
                const showSkills = message.skillsSelected ?? Boolean(message.skills?.length && !sameSkillSelections(message.skills, previousUserSkills));
                if (message.role === "user") previousUserSkills = message.skills || [];
                return (
                    <div key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
                        {message.text ? (
                            <div
                                className="max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6"
                                style={
                                    message.role === "user"
                                        ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText }
                                        : message.status === "error"
                                            ? { background: theme.node.fill, color: theme.node.text }
                                            : { background: theme.node.fill, color: theme.node.text }
                                }
                            >
                                {message.role === "assistant" ? (
                                    <div className="mb-1 flex items-center gap-1.5 text-xs opacity-60">
                                        <Bot className="size-3.5" />
                                        {codexMode ? "Codex" : "Agent"}
                                    </div>
                                ) : null}
                                {message.role === "assistant" ? <AssistantMarkdown components={markdownComponents}>{message.text}</AssistantMarkdown> : <UserMessageContent message={message} showSkills={showSkills} />}
                                {message.role === "assistant" && message.batch ? <div className="mt-1 text-[11px] leading-4 opacity-55">{formatAssistantBatch(message.batch)}</div> : null}
                                {message.role === "assistant" && message.batch?.nodeIds?.length ? (
                                    <div className="mt-1 flex max-w-full flex-wrap gap-1">
                                        {message.batch.nodeIds.map((nodeId) => {
                                            const node = nodeById.get(nodeId);
                                            if (!node) return null;
                                            return (
                                                <button
                                                    key={nodeId}
                                                    type="button"
                                                    className="max-w-[160px] cursor-pointer truncate rounded-full border px-2 py-0.5 text-[11px] opacity-70 transition-opacity hover:opacity-100"
                                                    style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                                                    onClick={() => onFocusNode(node.id)}
                                                    title={`定位到「${node.title}」`}
                                                >
                                                    {node.title}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        {running ? <ImageGenerationPending compact label={message.activity || "正在执行"} className="w-[250px] rounded-2xl border" /> : null}
                        {!running && message.text ? (
                            <div className="flex gap-1">
                                <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<Copy className="size-3.5" />} onClick={() => copyText(message.text, "消息已复制")} title="复制" />
                                {message.role === "assistant" ? <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(message)} title="重试" /> : null}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </>
    );
}

function AssistantHistory({
    sessions,
    activeSession,
    checkedIds,
    onToggleChecked,
    onOpen,
    onRename,
    onDelete,
}: {
    sessions: CanvasAssistantSession[];
    activeSession: CanvasAssistantSession | null;
    checkedIds: string[];
    onToggleChecked: (id: string, checked: boolean) => void;
    onOpen: (id: string) => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [editingId, setEditingId] = useState<string | null>(null);

    return (
        <div className="space-y-1">
            {sessions.map((session) => (
                <div key={session.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition" style={session.id === activeSession?.id ? { background: theme.node.fill } : undefined}>
                    <input type="checkbox" className="size-4" style={{ accentColor: theme.node.text }} checked={checkedIds.includes(session.id)} onChange={(event) => onToggleChecked(session.id, event.target.checked)} />
                    <div className="min-w-0 flex-1 text-sm">
                        {editingId === session.id ? (
                            <input
                                autoFocus
                                defaultValue={session.title}
                                onBlur={(event) => {
                                    const title = event.currentTarget.value.trim();
                                    if (title && title !== session.title) onRename(session.id, title);
                                    setEditingId(null);
                                }}
                                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                                className="block w-full rounded-sm bg-transparent outline-none"
                                style={{ color: theme.node.text, boxShadow: `inset 0 0 0 1px ${theme.node.muted}` }}
                            />
                        ) : (
                            <button type="button" className="block w-full text-left" onClick={() => onOpen(session.id)}>
                                <span className="block truncate">{session.title}</span>
                            </button>
                        )}
                        <span className="block text-xs opacity-50">{session.messages.length} 条消息</span>
                    </div>
                    <Button type="text" shape="circle" size="small" className="opacity-0 transition group-hover:opacity-100" icon={<Pencil className="size-3.5" />} onClick={() => setEditingId(session.id)} title="重命名" />
                    <Button type="text" shape="circle" size="small" className="opacity-0 transition group-hover:opacity-100" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(session.id)} title="删除" />
                </div>
            ))}
        </div>
    );
}

function UserMessageContent({ message, showSkills }: { message: CanvasAssistantMessage; showSkills: boolean }) {
    const references = useMemo(() => message.references?.map(assistantToPromptReference) || [], [message.references]);
    return <CanvasPromptChipInput value={message.text} references={references} skills={showSkills ? message.skills : undefined} onChange={ignorePromptChange} readOnly />;
}

function ignorePromptChange() {}

function sameSkillSelections(left: CanvasAgentSkillSelection[] = [], right: CanvasAgentSkillSelection[] = []) {
    return left.length === right.length && left.every((skill, index) => skill.id === right[index]?.id && skill.source === right[index]?.source);
}

function nodeToReference(node: CanvasNodeData, resource: CanvasResourceReference): CanvasAssistantReference | null {
    const content = assistantReferenceContentFromNode(node);
    return content ? { id: node.id, type: node.type, title: node.title, label: resource.label, ...content } : null;
}

function createSession(provider: "api" | "codex"): CanvasAssistantSession {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        provider,
        title: "新对话",
        messages: [],
        agentState: createCanvasAgentState(),
        protocolMessages: [],
        createdAt: now,
        updatedAt: now,
    };
}
