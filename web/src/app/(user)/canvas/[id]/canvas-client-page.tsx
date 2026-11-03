"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { saveAs } from "file-saver";

import { deleteCanvasProjects } from "@/services/api/canvas-tasks";
import { createCanvasImageTask, requestImageQuestion, type CanvasImageTask } from "@/services/api/image";
import { createCanvasAudioTask, type CanvasAudioTask } from "@/services/api/audio";
import { createVideoGenerationTask, type VideoResponse } from "@/services/api/video";
import { channelProtocolForConfig, defaultConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { collectImageStorageKeys, deleteImagePreviews, deleteStoredImages, deleteUnusedImagePreviews, ensureImagePreview, resolveImageUrl, uploadImage, uploadRemoteImageToServer, type UploadedImage } from "@/services/image-storage";
import { downloadRemoteMedia, resolveMediaUrl, uploadMediaFile, uploadRemoteMediaToServer } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "../utils/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { captureVideoFrame, type VideoFramePosition } from "../utils/canvas-video-frame";
import { PANORAMA_IMAGE_SIZE, PANORAMA_NODE_SIZE, buildPanoramaPrompt, isCanvasImageNodeType, isPanoramaNodeType } from "../utils/canvas-panorama";
import { applyCameraPrompt } from "../utils/canvas-camera";
import { GROUP_PADDING, findContainingGroupId, findGroupDropTarget, getNodeBounds, snapNodesIntoGroup } from "../utils/canvas-group";
import {
    calculateCanvasAlignment,
    createCanvasAlignmentContext,
    type CanvasAlignmentContext,
    type CanvasAlignmentGuides,
} from "../utils/canvas-alignment";
import { App, Button, Modal, Slider } from "antd";
import { supportsVideoAudioGeneration, supportsVideoFrameReferences } from "@/lib/video-model-capabilities";
import { isAutoDLConfig } from "@/lib/autodl";
import { isGlmTtsModel } from "@/lib/audio-generation";
import { isGrok2APITtsConfig } from "@/lib/grok-tts";
import { isGeminiConfig, isGeminiTtsModel } from "@/lib/gemini";
import { isMiniMaxTtsConfig } from "@/lib/minimax-tts";
import { isKIESeedreamLayerDecompositionModel } from "@/lib/kie-models";
import { IMAGE_MASK_EDIT_PROMPT_PREFIX } from "@/lib/image-reference-prompt";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import { canvasTaskCompleted, canvasTaskFailed, canvasTaskMediaURL, parseCanvasTaskTime } from "./lib/canvas-task-helpers";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "./lib/canvas-node-constants";
import { applyCanvasAudioTaskUpdate, applyCanvasImageTaskConnections, applyCanvasImageTaskUpdate, applyCanvasVideoTaskUpdate, fitCanvasMediaNode, resetInterruptedGeneration } from "./lib/canvas-task-updates";
import { canvasAgentNodeSummary, canvasAgentTaskSummary, canvasAgentVideoDurationHint, validateCanvasAgentVideoSeconds } from "./lib/canvas-agent-summary";
import { getConnectionTargetAnchor, normalizeConnection } from "./lib/canvas-connections";
import { applyNodeConfigPatch, audioExtension, audioMetadata, buildAudioGenerationMetadata, buildImageGenerationMetadata, buildImportedVideoNode, getGenerationCount, getInputSummary, getNextDirectorOutputY, imageExtension, imageMetadata, videoMetadata } from "./lib/canvas-node-builders";
import { buildGenerationConfig } from "./lib/canvas-generation-config";
import { createCanvasNode } from "./lib/canvas-node-factory";
import { generationReferenceUrls, selectAudioReference, withCanvasVideoAdvancedConfig } from "./lib/canvas-generation-helpers";
import { syncAssistantReferences } from "./lib/canvas-assistant-references";
import { buildAngleLabel, buildAnglePrompt, findRetrySourceNode, isAudioFile, isHiddenBatchChild, isHiddenBatchConnectionEndpoint, sourceNodeReferenceImages } from "./lib/canvas-graph";
import { submitCanvasWorkflowTask, workflowAudioTask, workflowImageTask, workflowVideoTask } from "./lib/canvas-workflow-tasks";
import { useCanvasViewport } from "./hooks/use-canvas-viewport";
import { useCanvasSelection } from "./hooks/use-canvas-selection";
import type { CanvasNodeTaskRun } from "./hooks/use-canvas-tasks";
import { useCanvasTaskSystem } from "./hooks/use-canvas-task-system";
import { ActiveConnectionPath, ConnectionPath } from "../components/canvas-connections";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import { CanvasConfigNodePanel } from "../components/canvas-config-node-panel";
import { CanvasDirector } from "../components/canvas-director";
import { CanvasDirectorNodePanel } from "../components/canvas-director-node-panel";
import { CanvasAssistantPanel } from "../components/canvas-assistant-panel";
import { CanvasNodeContextMenu } from "../components/canvas-context-menu";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "../components/canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "../components/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "../components/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "../components/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog, type CanvasImageUpscaleParams } from "../components/canvas-node-upscale-dialog";
import { buildNodeChatMessages, buildNodeGenerationContext, buildNodeGenerationInputs, hydrateNodeGenerationContext, type NodeGenerationInput } from "../components/canvas-node-generation";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "../components/canvas-node-hover-toolbar";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { Minimap } from "../components/canvas-mini-map";
import { CanvasNode } from "../components/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode, type CanvasVideoFrameOption } from "../components/canvas-node-prompt-panel";
import type { CanvasVideoResourceOption } from "../components/canvas-video-settings-popover";
import { CanvasToolbar } from "../components/canvas-toolbar";
import { AssetPickerModal, type AssetPickerTab } from "../components/asset-picker-modal";
import { CanvasRefreshShell } from "./components/canvas-refresh-shell";
import { CanvasTopBar } from "./components/canvas-top-bar";
import { FullscreenPreview } from "./components/fullscreen-preview";
import { ConnectionCreateMenu, NodeCreateMenu } from "./components/canvas-create-menus";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { CANVAS_ASSET_DRAG_TYPE, CanvasSidePanel } from "../components/canvas-side-panel";
import { DEFAULT_CANVAS_AGENT_PANEL, DEFAULT_CANVAS_SIDE_PANEL, useCanvasStore } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { buildNodeMentionReferences, isCanvasReferenceNode } from "../utils/canvas-resource-references";
import { buildCanvasAgentContext } from "../agent/canvas-agent-context";
import type { CanvasAgentAction, CanvasAgentToolResult } from "../agent/canvas-agent-tools";
import {
    CanvasNodeType,
    type CanvasAgentConfig,
    type CanvasAgentState,
    type CanvasAssistantImage,
    type CanvasAssistantReference,
    type CanvasAssistantSession,
    type CanvasConnection,
    type PendingConnectionCreate,
    type CanvasDirectorCapture,
    type CanvasDirectorPanorama,
    type CanvasDirectorVideo,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type CanvasPendingAgentRequest,
    type ConnectionHandle,
    type ContextMenuState,
    type InsertAssetPayload,
    type Position,
    type SelectionBox,
} from "../types";
import type { ReferenceImage } from "@/types/image";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type PendingPanoramaImport = {
    image: UploadedImage;
    title: string;
    position: Position;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const AGENT_PRIMARY_SCRIPT_NODE_SIZE = { width: 550, height: 600 };
const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

export default function CanvasPage() {
    const params = useParams<{ id: string }>();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage key={params.id} projectId={params.id} />;
}

function InfiniteCanvasPage({ projectId }: { projectId: string }) {
    const { message } = App.useApp();
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const assetInsertPositionRef = useRef<Position | null>(null);
    const draggedAssetPayloadRef = useRef<InsertAssetPayload | null>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const historyCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const historyCleanupKeysRef = useRef(new Map<string, string>());
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sidePanelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const didInitialCenterRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const uploadingMediaNodeIdsRef = useRef(new Set<string>());
    const uploadingImageNodeIdsRef = useRef(new Set<string>());
    const nodeDraggingRef = useRef(false);
    const alignmentContextRef = useRef<CanvasAlignmentContext | null>(null);
    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        initialSelectedNodes: { id: string; x: number; y: number }[];
        clickedGroupId: string | null;
    }>({
        isDraggingNode: false,
        hasMoved: false,
        clickedGroupId: null,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [],
    });

    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [agentConfig, setAgentConfig] = useState<CanvasAgentConfig | null>(null);
    const [initialAgentRequest, setInitialAgentRequest] = useState<{ prompt: CanvasPendingAgentRequest["prompt"]; references: CanvasAssistantReference[]; skills: CanvasPendingAgentRequest["skills"] } | null>(null);
    const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select");
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const { selectedNodeIds, selectedConnectionId, setSelectedConnectionId, selectedNodeIdsRef, selectOnly, selectMany, clearSelection } = useCanvasSelection();
    const [agentReferenceNodeClick, setAgentReferenceNodeClick] = useState<{ nodeId: string | null; version: number }>({ nodeId: null, version: 0 });
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreatePosition, setNodeCreatePosition] = useState<Position | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const closeContextMenu = useCallback(() => setContextMenu(null), []);
    const { viewport, setViewport, viewportRef, focusAnimationRef, screenToCanvas, fitNodesToView, setZoomScale } = useCanvasViewport({ containerRef, size, onBeforeChange: closeContextMenu });
    const setShortcutsOpen = useCanvasUiStore((state) => state.setShortcutsOpen);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [sidePanel, setSidePanel] = useState(() => DEFAULT_CANVAS_SIDE_PANEL);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTab, setAssetPickerTab] = useState<AssetPickerTab>("my-assets");
    const [pendingPanoramaImport, setPendingPanoramaImport] = useState<PendingPanoramaImport | null>(null);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [openDirectorNodeId, setOpenDirectorNodeId] = useState<string | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [audioTrimNodeId, setAudioTrimNodeId] = useState<string | null>(null);
    const [audioTrimStart, setAudioTrimStart] = useState(0);
    const [audioTrimEnd, setAudioTrimEnd] = useState(0);
    const [audioTrimDuration, setAudioTrimDuration] = useState(0);
    const [audioTrimPlaying, setAudioTrimPlaying] = useState(false);
    const [trimmingAudio, setTrimmingAudio] = useState(false);
    const audioTrimRef = useRef<HTMLAudioElement | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [maskEditModel, setMaskEditModel] = useState("");
    const [maskEditChannelId, setMaskEditChannelId] = useState("");
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [agentPanel, setAgentPanel] = useState(DEFAULT_CANVAS_AGENT_PANEL);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
    const [alignmentGuides, setAlignmentGuides] = useState<CanvasAlignmentGuides>({});
    const [referencePickerNodeId, setReferencePickerNodeId] = useState<string | null>(null);
    const [canvasNow, setCanvasNow] = useState(Date.now());
    const resolvedAgentConfig = useMemo<CanvasAgentConfig>(
        () => {
            const defaults = { textApiMode: "chat" as const, autoGenerateMedia: false };
            return agentConfig ? { ...defaults, ...agentConfig } : {
                textApiMode: "chat",
                autoGenerateMedia: false,
                imageQuality: effectiveConfig.quality,
                imageSize: effectiveConfig.size,
                videoQuality: effectiveConfig.vquality,
                videoSize: effectiveConfig.videoSize,
            };
        },
        [agentConfig, effectiveConfig.quality, effectiveConfig.size, effectiveConfig.videoSize, effectiveConfig.vquality],
    );
    const agentEffectiveConfig = useMemo(
        () => ({ ...effectiveConfig, quality: resolvedAgentConfig.imageQuality, size: resolvedAgentConfig.imageSize, vquality: resolvedAgentConfig.videoQuality, videoSize: resolvedAgentConfig.videoSize, count: "1", canvasImageCount: "1" }),
        [effectiveConfig, resolvedAgentConfig],
    );

    const nodesRef = useRef(nodes);
    const previewSourcesRef = useRef(new Map<string, string>());
    const consumedAgentRequestProjectRef = useRef<string | null>(null);
    const connectionsRef = useRef(connections);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const hasLoadingTimedNodes = nodes.some((node) => node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content && (node.type === CanvasNodeType.Video || isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Audio));

    const { runningNodeId, setRunningNodeId, runningRequestRef, nodeTaskRunsRef, submitNodeTask, isNodeTaskActive, handleStopNode, abortNodePolling } = useCanvasTaskSystem({
        projectLoaded,
        nodesRef,
        historyRef,
        lastHistoryRef,
        setNodes,
        setConnections,
        effectiveConfig,
        isAiConfigReady,
        onError: message.error,
    });

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            backgroundMode,
            showImageInfo,
        }),
        [backgroundMode, showImageInfo],
    );

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown, storageKeys?: ReadonlyMap<string, string>) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current, tasks: Array.from(nodeTaskRunsRef.current.values()) }, storageKeys);
        },
        [cleanupAssetImages, nodeTaskRunsRef],
    );

    const getBatchGroupNodes = useCallback((activeNode: CanvasNodeData | null) => {
        if (!activeNode) return [];
        const rootId = activeNode.metadata?.batchRootId || (activeNode.metadata?.isBatchRoot ? activeNode.id : null);
        if (!rootId) return [activeNode];
        return nodes.filter(
            (n) =>
                n.metadata?.batchRootId === rootId &&
                isCanvasImageNodeType(n.type) &&
                n.metadata?.content
        );
    }, [nodes]);

    useEffect(() => () => {
        const storageKeys = historyCleanupKeysRef.current;
        collectImageStorageKeys([historyRef.current, lastHistoryRef.current, Array.from(nodeTaskRunsRef.current.values())], new Set(), undefined, storageKeys).forEach((key) => storageKeys.set(key, key));
        historyCleanupKeysRef.current = new Map<string, string>();
        if (historyCleanupTimerRef.current) {
            clearTimeout(historyCleanupTimerRef.current);
            historyCleanupTimerRef.current = null;
        }
        const usedKeys = collectImageStorageKeys(nodesRef.current, new Set(), storageKeys);
        if (Array.from(storageKeys.values()).some((key) => !usedKeys.has(key))) cleanupAssetImages({ nodes: nodesRef.current }, storageKeys, useUserStore.getState().token);
    }, [cleanupAssetImages, nodeTaskRunsRef]);

    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);
        setInitialAgentRequest(null);
        setReferencePickerNodeId(null);
        consumedAgentRequestProjectRef.current = null;
        const project = openProject(projectId);
        if (!project) {
            router.replace("/canvas");
            return;
        }

        const restore = async () => {
            const resetNodes = resetInterruptedGeneration(project.nodes);
            const previewKeys = new Set(
                resetNodes
                    .filter((node) => isCanvasImageNodeType(node.type))
                    .map((node) => `canvas-node:${projectId}:${node.id}`),
            );
            void deleteUnusedImagePreviews(`canvas-node:${projectId}:`, previewKeys);
            await Promise.all(
                resetNodes.map((node) => {
                    if (!isCanvasImageNodeType(node.type)) return undefined;
                    const content = node.metadata?.content || "";
                    const storageKey = node.metadata?.storageKey;
                    const source = `${node.metadata?.primaryImageId || ""}:${node.metadata?.imageTaskResultId || ""}:${storageKey || content}`;
                    return ensureImagePreview(`canvas-node:${projectId}:${node.id}`, content, storageKey, source, true);
                }),
            );
            const restoredNodes = await hydrateCanvasImages(resetNodes);
            for (const node of restoredNodes) {
                const id = node.metadata?.clientTaskId;
                if (!id) continue;
                const run: CanvasNodeTaskRun = { id, controller: new AbortController(), backend: node.metadata?.taskBackend };
                nodeTaskRunsRef.current.set(node.id, run);
                nodeTaskRunsRef.current.set(`${node.id}:${id}`, run);
            }
            const restoredSessions = syncAssistantReferences(project.chatSessions || [], restoredNodes, true);
            setNodes(restoredNodes);
            setConnections(project.connections);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setAgentConfig(project.agentConfig || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            didInitialCenterRef.current = restoredNodes.length > 0 || project.viewport.x !== 0 || project.viewport.y !== 0 || project.viewport.k !== 1;
            setViewport(project.viewport);
            setSidePanel(project.sidePanel || DEFAULT_CANVAS_SIDE_PANEL);
            const restoredAgentPanel = project.agentPanel || DEFAULT_CANVAS_AGENT_PANEL;
            setAgentPanel(restoredAgentPanel);
            setAssistantMounted(restoredAgentPanel.open);
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: project.connections,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
            };
            setHistoryState({ canUndo: false, canRedo: false });
            setProjectLoaded(true);
        };
        void restore();
    }, [hydrated, openProject, projectId, router, nodeTaskRunsRef, setViewport]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (window.matchMedia("(max-width: 767px)").matches) {
            setSidePanel((current) => current.open ? { ...current, open: false } : current);
        }
    }, [projectLoaded, projectId]);

    useEffect(() => {
        if (!projectLoaded) return;
        const openFromLink = () => {
            const params = new URLSearchParams(window.location.hash.slice(1));
            if (!params.has("agentUrl") && !params.has("agentToken")) return;
            setAssistantMounted(true);
            setAgentPanel((current) => ({ ...current, open: true }));
        };
        openFromLink();
        window.addEventListener("hashchange", openFromLink);
        return () => window.removeEventListener("hashchange", openFromLink);
    }, [projectLoaded, projectId]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (previous?.nodes === next.nodes && previous.connections === next.connections && previous.backgroundMode === next.backgroundMode && previous.showImageInfo === next.showImageInfo) return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            const historyDropped = historyRef.current.past.length >= 10 || historyRef.current.future.length > 0;
            if (historyDropped) {
                const dropped = [...historyRef.current.past.slice(0, -9), ...historyRef.current.future];
                collectImageStorageKeys([dropped, Array.from(nodeTaskRunsRef.current.values())], new Set(), undefined, historyCleanupKeysRef.current).forEach((key) => historyCleanupKeysRef.current.set(key, key));
                const retainedNodes = [...current.nodes, ...last.nodes, ...historyRef.current.past.slice(-9).flatMap((entry) => entry.nodes)];
                const retainedRuns = new Set(retainedNodes.map((node) => `${node.id}:${node.metadata?.clientTaskId || ""}`));
                nodeTaskRunsRef.current.forEach((run, key) => {
                    if (key.includes(":") && !retainedRuns.has(key)) { delete run.task; delete run.mediaSize; nodeTaskRunsRef.current.delete(key); }
                });
            }
            historyRef.current.past = [...historyRef.current.past.slice(-9), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
            if (historyDropped) {
                if (historyCleanupTimerRef.current) clearTimeout(historyCleanupTimerRef.current);
                historyCleanupTimerRef.current = setTimeout(() => {
                    historyCleanupTimerRef.current = null;
                    const storageKeys = historyCleanupKeysRef.current;
                    historyCleanupKeysRef.current = new Map<string, string>();
                    cleanupCanvasFiles(undefined, storageKeys);
                }, 2000);
            }
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [backgroundMode, cleanupCanvasFiles, connections, createHistoryEntry, nodes, projectLoaded, showImageInfo, nodeTaskRunsRef]);

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        updateProject(projectId, { nodes, connections, chatSessions, activeChatId, agentConfig, backgroundMode, showImageInfo });
    }, [activeChatId, agentConfig, backgroundMode, chatSessions, connections, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!hasLoadingTimedNodes) return;
        setCanvasNow(Date.now());
        const timer = window.setInterval(() => setCanvasNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [hasLoadingTimedNodes]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport, viewportRef]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (sidePanelSaveTimerRef.current) clearTimeout(sidePanelSaveTimerRef.current);
        sidePanelSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { sidePanel, agentPanel });
            sidePanelSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (sidePanelSaveTimerRef.current) clearTimeout(sidePanelSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, sidePanel, agentPanel, updateProject]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

    useEffect(() => {
        const previous = previewSourcesRef.current;
        const next = new Map<string, string>();

        nodes.forEach((node) => {
            if (!isCanvasImageNodeType(node.type)) return;
            const content = node.metadata?.content || "";
            const storageKey = node.metadata?.storageKey;
            if (!content && !storageKey) return;
            const source = `${node.metadata?.primaryImageId || ""}:${node.metadata?.imageTaskResultId || ""}:${storageKey || content}`;
            next.set(node.id, source);
            if (previous.get(node.id) !== source) void ensureImagePreview(`canvas-node:${projectId}:${node.id}`, content, storageKey, source);
        });

        const removed = [...previous.keys()].filter((id) => !next.has(id));
        previewSourcesRef.current = next;
        if (removed.length) void deleteImagePreviews(removed.map((id) => `canvas-node:${projectId}:${id}`));
    }, [nodes, projectId]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded, setViewport]);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2 + Math.random() * 360 - 180, (rect?.top || 0) + (rect?.height || size.height) / 2 + Math.random() * 240 - 120);
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen, selectedNodeIdsRef],
    );

    const hideNodeToolbar = useCallback(() => { }, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, fromNodeId, toNodeId }]);
            }
            setContextMenu(null);
        },
        [message],
    );

    const createConnectedNode = useCallback(
        (type: CanvasNodeType, pending: PendingConnectionCreate) => {
            const workflowRef = isCanvasImageNodeType(type) ? effectiveConfig.imageWorkflowRef : type === CanvasNodeType.Video ? effectiveConfig.videoWorkflowRef : type === CanvasNodeType.Audio ? effectiveConfig.audioWorkflowRef : undefined;
            const metadata = type === CanvasNodeType.Config
                ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count), workflowRef: effectiveConfig.imageWorkflowRef }
                : workflowRef ? { workflowRef } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            selectOnly(newNode.id);
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Director) setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [effectiveConfig.audioWorkflowRef, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.imageWorkflowRef, effectiveConfig.model, effectiveConfig.size, effectiveConfig.videoWorkflowRef, message, setConnecting, selectOnly, setSelectedConnectionId],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
                .reverse()
                .forEach((node) => {
                    const anchor = getConnectionTargetAnchor(node, current);
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType)) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas, viewportRef],
    );

    const visibleNodes = useMemo(() => {
        const padding = 280;
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + width / viewport.k + padding * 2;
        const viewBottom = viewTop + height / viewport.k + padding * 2;

        return nodes.filter((node) => !isHiddenBatchChild(node, nodes, collapsingBatchIds) && node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
    }, [collapsingBatchIds, nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const audioTrimNode = audioTrimNodeId ? nodeById.get(audioTrimNodeId) || null : null;
    const audioTrimTooShort = Math.round((audioTrimEnd - audioTrimStart) * 100) < 50;

    useEffect(() => {
        setAudioTrimPlaying(false);
        const src = audioTrimNode?.metadata?.content;
        if (!src) return;

        const audio = new Audio(src);
        audioTrimRef.current = audio;
        audio.preload = "metadata";
        setAudioTrimStart(0);
        setAudioTrimEnd(0);
        setAudioTrimDuration(0);

        audio.onloadedmetadata = () => {
            const duration = Number.isFinite(audio.duration)
                ? Math.floor(audio.duration * 100) / 100
                : 0;
            setAudioTrimDuration(duration);
            setAudioTrimEnd(duration);
        };
        audio.onplay = () => setAudioTrimPlaying(true);
        audio.onpause = () => setAudioTrimPlaying(false);
        audio.onended = () => setAudioTrimPlaying(false);
        audio.onerror = () => message.error("音频加载失败");

        return () => {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            audioTrimRef.current = null;
        };
    }, [audioTrimNode?.id, audioTrimNode?.metadata?.content, message]);

    useEffect(() => {
        if (!audioTrimPlaying) return;

        let frame = 0;
        const checkEnd = () => {
            const audio = audioTrimRef.current;
            if (!audio || audio.paused) return;

            if (audio.currentTime >= audioTrimEnd) {
                audio.pause();
            } else {
                frame = requestAnimationFrame(checkEnd);
            }
        };

        frame = requestAnimationFrame(checkEnd);
        return () => cancelAnimationFrame(frame);
    }, [audioTrimPlaying, audioTrimEnd]);

    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const maskEditConfig = maskEditNode ? buildGenerationConfig(effectiveConfig, maskEditNode, "image") : null;
    const currentMaskEditModel = maskEditModel || maskEditConfig?.model || "";
    const currentMaskEditChannelId = maskEditChannelId || maskEditConfig?.imageChannelId || "";
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const contextMenuNode = contextMenu?.type === "node" ? nodeById.get(contextMenu.nodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const openDirectorNode = openDirectorNodeId ? nodeById.get(openDirectorNodeId) || null : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const batchChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (node.metadata?.isBatchRoot) map.set(node.id, node.metadata.batchChildIds?.length || 0);
        });
        return map;
    }, [nodes]);
    const groupChildCountById = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId) map.set(groupId, (map.get(groupId) || 0) + 1);
        });
        return map;
    }, [nodes]);
    const batchMotionById = useMemo(() => {
        const map = new Map<string, { x: number; y: number; index: number }>();
        nodes.forEach((node) => {
            const rootId = node.metadata?.batchRootId;
            if (!rootId) return;
            const root = nodeById.get(rootId);
            const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
            const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
            const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
            map.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
        });
        return map;
    }, [nodeById, nodes]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        nodeIds.add(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Config) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);
    const directorPanoramasByNodeId = useMemo(() => {
        const map = new Map<string, CanvasDirectorPanorama[]>();
        nodes.forEach((node) => {
            if (node.type === CanvasNodeType.Director) map.set(node.id, []);
        });
        connections.forEach((connection) => {
            const target = nodeById.get(connection.toNodeId);
            const source = nodeById.get(connection.fromNodeId);
            if (target?.type !== CanvasNodeType.Director || !isCanvasImageNodeType(source?.type) || !source?.metadata?.content) return;
            map.get(target.id)?.push({
                edgeId: connection.id,
                sourceNodeId: source.id,
                imageUrl: source.metadata.content,
                fileName: source.title || "画布图片.png",
                projectionMode: source.metadata.panoramaProjection === "equirectangular" ? "equirectangular" : "backdrop",
            });
        });
        return map;
    }, [connections, nodeById, nodes]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
        return map;
    }, [connections, nodes]);
    const connectedNodesByNodeId = useMemo(() => {
        const map = new Map<string, CanvasNodeData[]>();
        connections.forEach((connection) => {
            const source = nodeById.get(connection.fromNodeId);
            if (!source || !isCanvasReferenceNode(source)) return;
            const connected = map.get(connection.toNodeId);
            if (connected) connected.push(source);
            else map.set(connection.toNodeId, [source]);
        });
        return map;
    }, [connections, nodeById]);
    const referenceConnectedNodeIds = useMemo(() => new Set([referencePickerNodeId, ...(referencePickerNodeId ? connectedNodesByNodeId.get(referencePickerNodeId)?.map((node) => node.id) || [] : [])].filter((id): id is string => Boolean(id))), [connectedNodesByNodeId, referencePickerNodeId]);
    const videoFrameOptionsByNodeId = useMemo(() => {
        const map = new Map<string, CanvasVideoFrameOption[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Config) return;
            const options = connections.flatMap((connection) => {
                if (connection.toNodeId !== node.id) return [];
                const imageNode = nodeById.get(connection.fromNodeId);
                return isCanvasImageNodeType(imageNode?.type) && imageNode?.metadata?.content ? [{ nodeId: imageNode.id, label: imageNode.title || "图片节点", previewUrl: imageNode.metadata.content }] : [];
            });
            map.set(node.id, options);
        });
        return map;
    }, [connections, nodeById, nodes]);
    const videoResourceOptionsByNodeId = useMemo(() => {
        const map = new Map<string, CanvasVideoResourceOption[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Config && node.type !== CanvasNodeType.Audio) return;
            const options: CanvasVideoResourceOption[] = connections.flatMap<CanvasVideoResourceOption>((connection) => {
                if (connection.toNodeId !== node.id) return [];
                const source = nodeById.get(connection.fromNodeId);
                if (!source) return [];
                const label = source.title || source.id;
                if (source.type === CanvasNodeType.Text) {
                    const text = source.metadata?.content || source.metadata?.prompt || "";
                    return text.trim() ? [{ nodeId: source.id, kind: "text" as const, label, text }] : [];
                }
                if (isCanvasImageNodeType(source.type) && source.metadata?.content) return [{ nodeId: source.id, kind: "image" as const, label, previewUrl: source.metadata.content }];
                if (source.type === CanvasNodeType.Video && source.metadata?.content) return [{ nodeId: source.id, kind: "video" as const, label, previewUrl: source.metadata.content }];
                if (source.type === CanvasNodeType.Audio && source.metadata?.content) return [{ nodeId: source.id, kind: "audio" as const, label }];
                return [];
            });
            map.set(node.id, options);
        });
        return map;
    }, [connections, nodeById, nodes]);
    const createNode = useCallback(
        (type: CanvasNodeType, position?: Position, textContent?: string, nodeId?: string) => {
            const targetPosition = position || getCanvasCenter();
            const workflowRef = isCanvasImageNodeType(type) ? effectiveConfig.imageWorkflowRef : type === CanvasNodeType.Video ? effectiveConfig.videoWorkflowRef : type === CanvasNodeType.Audio ? effectiveConfig.audioWorkflowRef : undefined;
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                        model: effectiveConfig.imageModel || effectiveConfig.model,
                        size: effectiveConfig.size,
                        count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                        workflowRef: effectiveConfig.imageWorkflowRef,
                    }
                    : workflowRef ? { workflowRef } : undefined;
            const newNode = createCanvasNode(
                type,
                targetPosition,
                type === CanvasNodeType.Text && textContent !== undefined
                    ? { content: textContent, status: NODE_STATUS_SUCCESS }
                    : configMetadata,
                nodeId,
            );
            if (type === CanvasNodeType.Text && textContent !== undefined) newNode.title = textContent.slice(0, 32) || "Assistant Text";
            setNodes((prev) => [...prev, newNode]);
            selectOnly(newNode.id);
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Director) setDialogNodeId(newNode.id);
        },
        [effectiveConfig.audioWorkflowRef, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.imageWorkflowRef, effectiveConfig.model, effectiveConfig.size, effectiveConfig.videoWorkflowRef, getCanvasCenter, selectOnly, setSelectedConnectionId],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            nodesRef.current.forEach((node) => {
                if (ids.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
            });
            nodesRef.current.forEach((node) => {
                if (node.metadata?.isBatchRoot && node.metadata?.batchChildIds) {
                    const allChildrenDeleted = node.metadata.batchChildIds.every((childId) => allIds.has(childId));
                    if (allChildrenDeleted) allIds.add(node.id);
                }
            });
            const removedNodes = nodesRef.current.filter((node) => allIds.has(node.id));
            const remainingNodes = nodesRef.current.filter((node) => !allIds.has(node.id));
            const removedKeys = collectImageStorageKeys(removedNodes);
            const usedKeys = collectImageStorageKeys({ nodes: remainingNodes, assets: useAssetStore.getState().assets, history: historyRef.current, lastHistory: lastHistoryRef.current });
            const disposableKeys = [...removedKeys].filter((key) => !usedKeys.has(key));
            setChatSessions((sessions) => sessions.map((session) => ({
                ...session,
                messages: session.messages.map((message) => ({
                    ...message,
                    references: message.references?.map((reference) => allIds.has(reference.id) ? {
                        ...reference,
                        dataUrl: undefined,
                        url: undefined,
                        storageKey: undefined,
                    } : reference),
                })),
            })));
            if (disposableKeys.length) void deleteStoredImages(disposableKeys).catch((error) => message.error(error instanceof Error ? error.message : "图片文件删除失败"));
            const nextNodes = remainingNodes.map((node) => {
                const nextNode = node.metadata?.groupId && allIds.has(node.metadata.groupId) ? { ...node, metadata: { ...node.metadata, groupId: undefined } } : node;
                const childIds = nextNode.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                if (!nextNode.metadata?.isBatchRoot || childIds?.length === nextNode.metadata.batchChildIds?.length) return nextNode;
                const primaryImageId = childIds?.includes(nextNode.metadata.primaryImageId || "") ? nextNode.metadata.primaryImageId : childIds?.[0];
                const primaryNode = remainingNodes.find((item) => item.id === primaryImageId);
                const syncPrimary = primaryImageId !== nextNode.metadata.primaryImageId && nextNode.type === CanvasNodeType.Image && !nextNode.metadata.clientTaskId;
                return {
                    ...nextNode,
                    metadata: {
                        ...nextNode.metadata,
                        batchChildIds: childIds,
                        primaryImageId,
                        status: syncPrimary ? primaryNode?.metadata?.status : nextNode.metadata.status,
                        imageTaskId: syncPrimary ? (primaryNode?.metadata?.workflowRef ? undefined : primaryNode?.metadata?.imageTaskId) : nextNode.metadata.imageTaskId,
                        workflowRef: syncPrimary ? primaryNode?.metadata?.workflowRef : nextNode.metadata.workflowRef,
                        content: primaryNode?.metadata?.content || (syncPrimary ? undefined : nextNode.metadata.content),
                        storageKey: primaryNode?.metadata?.content ? primaryNode.metadata.storageKey : syncPrimary ? "" : nextNode.metadata.storageKey,
                        bytes: primaryNode?.metadata?.content ? primaryNode.metadata.bytes : nextNode.metadata.bytes,
                        mimeType: primaryNode?.metadata?.content ? primaryNode.metadata.mimeType : nextNode.metadata.mimeType,
                        naturalWidth: primaryNode?.metadata?.naturalWidth || nextNode.metadata.naturalWidth,
                        naturalHeight: primaryNode?.metadata?.naturalHeight || nextNode.metadata.naturalHeight,
                        panoramaProjection: primaryNode?.metadata?.panoramaProjection || nextNode.metadata.panoramaProjection,
                    },
                };
            });
            const nextConnections = connectionsRef.current.filter((connection) => !allIds.has(connection.fromNodeId) && !allIds.has(connection.toNodeId));
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            selectedNodeIdsRef.current = new Set();
            setNodes(nextNodes);
            setConnections(nextConnections);
            clearSelection();
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setReferencePickerNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nextNodes, chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, projectId, clearSelection, message, selectedNodeIdsRef, setRunningNodeId, setSelectedConnectionId],
    );

    const deleteConnection = useCallback((connectionId: string) => {
        const nextConnections = connectionsRef.current.filter((connection) => connection.id !== connectionId);
        connectionsRef.current = nextConnections;
        setConnections(nextConnections);
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, [setSelectedConnectionId]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        clearSelection();
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, [cancelPendingConnectionCreate, clearSelection, setSelectedConnectionId]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        setReferencePickerNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId, setRunningNodeId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next: CanvasNodeData = {
            ...source,
            id,
            title: `${source.title} Copy`,
            position: { x: source.position.x + 36, y: source.position.y + 36 },
            metadata: source.metadata ? {
                ...source.metadata,
                clientTaskId: undefined,
                taskBackend: undefined,
                ...(source.metadata.status === "stopping" || source.metadata.status === "stopped"
                    ? { status: source.metadata.content ? NODE_STATUS_SUCCESS : "idle" as const, errorDetails: undefined }
                    : {}),
            } : undefined,
        };

        setNodes((prev) => [...prev, next]);
        selectOnly(id);
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, [selectOnly, setSelectedConnectionId]);

    const createGroupFromSelection = useCallback((nodeIds?: string[]) => {
        const selectedIds = new Set(nodeIds || Array.from(selectedNodeIdsRef.current));
        const selectedNodes = nodesRef.current.filter((node) => selectedIds.has(node.id));
        if (selectedNodes.length < 2 || selectedNodes.some((node) => node.type === CanvasNodeType.Group || node.metadata?.groupId)) return null;

        const bounds = getNodeBounds(selectedNodes);
        const width = bounds.right - bounds.left + GROUP_PADDING * 2;
        const height = bounds.bottom - bounds.top + GROUP_PADDING * 2;
        const group = createCanvasNode(CanvasNodeType.Group, {
            x: bounds.left - GROUP_PADDING + width / 2,
            y: bounds.top - GROUP_PADDING + height / 2,
        });
        group.width = width;
        group.height = height;
        group.position = { x: bounds.left - GROUP_PADDING, y: bounds.top - GROUP_PADDING };

        const nextNodes = [
            ...nodesRef.current.map((node) => (selectedIds.has(node.id) ? { ...node, metadata: { ...node.metadata, groupId: group.id } } : node)),
            group,
        ];
        nodesRef.current = nextNodes;
        selectedNodeIdsRef.current = new Set([group.id]);
        setNodes(nextNodes);
        selectOnly(group.id);
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        return group.id;
    }, [selectOnly, selectedNodeIdsRef, setSelectedConnectionId]);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedIds = new Set(selectedIds);
        nodesRef.current.forEach((node) => {
            if (node.type !== CanvasNodeType.Group || !selectedIds.has(node.id)) return;
            nodesRef.current.forEach((child) => {
                if (child.metadata?.groupId === node.id) copiedIds.add(child.id);
            });
        });

        const copiedNodes = nodesRef.current
            .filter((node) => copiedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => copiedIds.has(connection.fromNodeId) && copiedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, [selectedNodeIdsRef]);

    const pasteCopiedNodes = useCallback((offsetFromSelection = false) => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = offsetFromSelection ? 36 : center.x - (bounds.left + bounds.right) / 2;
        const dy = offsetFromSelection ? 36 : center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? {
                    ...node.metadata,
                    clientTaskId: undefined,
                    taskBackend: undefined,
                    ...(node.metadata.status === "stopping" || node.metadata.status === "stopped"
                        ? { status: node.metadata.content ? NODE_STATUS_SUCCESS : "idle" as const, errorDetails: undefined }
                        : {}),
                } : undefined,
            };
        });

        const pastedNodes = nextNodes.map((node) => {
            const groupId = node.metadata?.groupId;
            const nextGroupId = groupId ? idMap.get(groupId) : undefined;
            if (!groupId || nextGroupId) return nextGroupId ? { ...node, metadata: { ...node.metadata, groupId: nextGroupId } } : node;
            return { ...node, metadata: { ...node.metadata, groupId: undefined } };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const fromNodeId = idMap.get(connection.fromNodeId);
            const toNodeId = idMap.get(connection.toNodeId);
            if (!fromNodeId || !toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...pastedNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        selectMany(pastedNodes.map((node) => node.id));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(pastedNodes[0]?.type === CanvasNodeType.Group ? null : pastedNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter, selectMany, setSelectedConnectionId]);

    const duplicateSelectedNodes = useCallback(() => {
        const selectedIds = Array.from(selectedNodeIdsRef.current);
        if (!selectedIds.length) return;
        if (selectedIds.length === 1) {
            duplicateNode(selectedIds[0]);
            return;
        }
        copySelectedNodes();
        pasteCopiedNodes(true);
    }, [copySelectedNodes, duplicateNode, pasteCopiedNodes, selectedNodeIdsRef]);

    const fitAllNodes = useCallback(() => {
        fitNodesToView(nodesRef.current.filter((node) => !isHiddenBatchChild(node, nodesRef.current)));
    }, [fitNodesToView]);

    const fitSelectedNodes = useCallback(() => {
        const selected = nodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id)).map((node) =>
            isHiddenBatchChild(node, nodesRef.current) ? nodesRef.current.find((root) => root.id === node.metadata?.batchRootId) || node : node);
        if (selected.length) fitNodesToView(selected);
    }, [fitNodesToView, selectedNodeIdsRef]);

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        let restoredConnections = entry.connections;
        const pendingRestores: [CanvasNodeData, CanvasNodeTaskRun][] = [];
        let mediaSizeChanged = false;
        let restoredNodes = entry.nodes.map((node) => {
            const id = node.metadata?.clientTaskId;
            if (!id) {
                if (nodeTaskRunsRef.current.get(node.id)?.id) nodeTaskRunsRef.current.set(node.id, { id: "", controller: new AbortController() });
                return node;
            }
            const run: CanvasNodeTaskRun = nodeTaskRunsRef.current.get(`${node.id}:${id}`) || { id, controller: new AbortController(), backend: node.metadata?.taskBackend };
            nodeTaskRunsRef.current.set(node.id, run);
            nodeTaskRunsRef.current.set(`${node.id}:${id}`, run);
            if (run.backend || (run.task && !run.controller.signal.aborted && node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content)) pendingRestores.push([node, run]);
            const updated = fitCanvasMediaNode(node, run.mediaSize);
            mediaSizeChanged ||= updated !== node;
            return updated;
        });
        if (!mediaSizeChanged) restoredNodes = entry.nodes;
        for (const [node, run] of pendingRestores) {
            const id = node.metadata!.clientTaskId!;
            if (run.backend) restoredNodes = restoredNodes.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, taskBackend: run.backend } } : item);
            if (!run.task || run.controller.signal.aborted || node.metadata?.status !== NODE_STATUS_LOADING || node.metadata.content) continue;
            const startedAt = node.metadata.startedAt || Date.now();
            const size = { width: node.width, height: node.height };
            if (node.type === CanvasNodeType.Video) {
                restoredNodes = applyCanvasVideoTaskUpdate(restoredNodes, node.id, run.task as VideoResponse, buildGenerationConfig(effectiveConfig, node, "video"), startedAt, size, id);
            } else if (node.type === CanvasNodeType.Audio) {
                restoredNodes = applyCanvasAudioTaskUpdate(restoredNodes, node.id, run.task as CanvasAudioTask, startedAt, id);
            } else if (isCanvasImageNodeType(node.type)) {
                const task = run.task as CanvasImageTask;
                restoredNodes = applyCanvasImageTaskUpdate(restoredNodes, node.id, task, startedAt, size, id);
                restoredConnections = applyCanvasImageTaskConnections(restoredConnections, node.id, task, node.metadata.batchRootId);
                const root = restoredNodes.find((item) => item.id === node.metadata?.batchRootId);
                if (task.source !== "workflow" && root?.metadata?.primaryImageId === node.id) restoredNodes = applyCanvasImageTaskUpdate(restoredNodes, root.id, task, startedAt, size);
            }
        }
        const restoredEntry = { ...entry, nodes: restoredNodes, connections: restoredConnections };
        lastHistoryRef.current = restoredEntry;
        nodesRef.current = restoredNodes;
        connectionsRef.current = restoredConnections;
        setNodes(restoredNodes);
        setConnections(restoredConnections);
        setBackgroundMode(entry.backgroundMode);
        setShowImageInfo(entry.showImageInfo);
        clearSelection();
        setSelectedConnectionId(null);
        setContextMenu(null);
        setReferencePickerNodeId(null);
        setTimeout(() => {
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, [effectiveConfig, clearSelection, nodeTaskRunsRef, setSelectedConnectionId]);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(() => {
        const id = createProject(`矩灵画布 ${useCanvasStore.getState().projects.length + 1}`);
        router.push(`/canvas/${id}`);
    }, [createProject, router]);

    const deleteCurrentProject = useCallback(() => {
        void deleteCanvasProjects([projectId]).catch(() => undefined);
        deleteProjects([projectId]);
        cleanupAssetImages();
        router.push("/canvas");
    }, [cleanupAssetImages, deleteProjects, projectId, router]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            setNodeCreatePosition(null);
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;
            setAgentReferenceNodeClick((current) => ({ ...current, nodeId: null }));

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                clearSelection();
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, screenToCanvas, clearSelection, selectedNodeIdsRef, setSelectedConnectionId],
    );

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.stopPropagation();
        if (event.button === 0) setAgentReferenceNodeClick((current) => ({ nodeId, version: current.version + 1 }));
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setSelectedConnectionId(null);
        if (nodesRef.current.find((node) => node.id === nodeId)?.type === CanvasNodeType.Group) setDialogNodeId(null);

        const currentSelected = selectedNodeIdsRef.current;
        const currentNodes = nodesRef.current;
        const nextSelected = new Set(currentSelected);

        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) {
                nextSelected.delete(nodeId);
            } else {
                nextSelected.add(nodeId);
            }
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }

        selectMany(nextSelected);
        setToolbarNodeId(nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null);
        const dragIds = new Set(nextSelected);
        currentNodes.forEach((node) => {
            if (!nextSelected.has(node.id)) return;
            node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
            if (node.type === CanvasNodeType.Group) {
                currentNodes.forEach((child) => {
                    if (child.metadata?.groupId === node.id) dragIds.add(child.id);
                });
            }
        });
        dragRef.current = {
            isDraggingNode: true,
            hasMoved: false,
            clickedGroupId: currentNodes.find((node) => node.id === nodeId)?.type === CanvasNodeType.Group ? nodeId : null,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes: currentNodes.filter((node) => dragIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
        };
        alignmentContextRef.current = createCanvasAlignmentContext(
            currentNodes.filter((node) => !isHiddenBatchChild(node, currentNodes)),
            dragIds,
        );
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
        setAlignmentGuides({});
    }, [selectMany, selectedNodeIdsRef, setSelectedConnectionId]);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) {
            setDropTargetGroupId(null);
            return;
        }

        const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
        const clickedNodeId = dragRef.current.clickedGroupId || dragRef.current.initialSelectedNodes[0]?.id;
        const currentViewport = viewportRef.current;
        const rawOffset = {
            x: clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k,
            y: clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k,
        };
        const { x: dx, y: dy } = calculateCanvasAlignment(
            alignmentContextRef.current,
            rawOffset,
            7 / currentViewport.k,
        ).offset;
        const initialPositions = dragRef.current.initialSelectedNodes;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            const movedIds = new Set(initialPositions.map((item) => item.id));
            setNodes((prev) => {
                const moved = prev.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                const targetGroup = findGroupDropTarget(movedIds, moved);
                if (targetGroup) return snapNodesIntoGroup(movedIds, moved, targetGroup);
                return moved.map((node) => {
                    if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
                    const groupId = findContainingGroupId(node, moved);
                    return node.metadata?.groupId === groupId ? node : { ...node, metadata: { ...node.metadata, groupId } };
                });
            });
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.clickedGroupId = null;
        dragRef.current.initialSelectedNodes = [];
        alignmentContextRef.current = null;
        setDropTargetGroupId(null);
        setAlignmentGuides({});
        if (wasClick && clickedNodeId) {
            const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
            if (clickedNode?.type === CanvasNodeType.Group) {
                setDialogNodeId(null);
            } else if (clickedNode?.type === CanvasNodeType.Text) {
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else {
                setDialogNodeId(clickedNodeId);
            }
        }
    }, [viewportRef]);

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            const currentViewport = viewportRef.current;

            if (dragRef.current.isDraggingNode) {
                const rawOffset = {
                    x: (event.clientX - dragRef.current.startX) / currentViewport.k,
                    y: (event.clientY - dragRef.current.startY) / currentViewport.k,
                };
                const initialPositions = dragRef.current.initialSelectedNodes;
                if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
                    dragRef.current.hasMoved = true;
                }

                const aligned = calculateCanvasAlignment(
                    alignmentContextRef.current,
                    rawOffset,
                    7 / currentViewport.k,
                );
                const { x: dx, y: dy } = aligned.offset;
                const nextGuides = dragRef.current.hasMoved ? aligned.guides : {};
                const movedIds = new Set(initialPositions.map((item) => item.id));
                const previewNodes = nodesRef.current.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                });
                setDropTargetGroupId(findGroupDropTarget(movedIds, previewNodes)?.id || null);

                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    setAlignmentGuides((current) =>
                        current.vertical === nextGuides.vertical && current.horizontal === nextGuides.horizontal
                            ? current
                            : nextGuides,
                    );
                    setNodes((prev) =>
                        prev.map((node) => {
                            const initial = initialPositions.find((item) => item.id === node.id);
                            return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                        }),
                    );
                    rafRef.current = null;
                });
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [getConnectionDropTarget, screenToCanvas, viewportRef],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            selectMany(nextSelected);
        },
        [screenToCanvas, selectMany],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (currentConnection) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
                if (dropTarget.nodeId) {
                    connectNodes(currentConnection, dropTarget.nodeId);
                    setConnecting(null);
                } else if (dropTarget.isNearNode) {
                    setConnecting(null);
                } else {
                    setMouseWorld(screenToCanvas(event.clientX, event.clientY));
                    setPendingConnectionCreate({ connection: currentConnection, position: screenToCanvas(event.clientX, event.clientY) });
                }
            }
        },
        [connectNodes, finishNodeDrag, getConnectionDropTarget, screenToCanvas, setConnecting],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    const appendImportedImageNode = useCallback((image: UploadedImage, title: string, position: Position, type: CanvasNodeType.Image | CanvasNodeType.Panorama) => {
        const isPanorama = type === CanvasNodeType.Panorama;
        const size = isPanorama ? PANORAMA_NODE_SIZE : fitNodeSize(image.width, image.height);
        const id = type + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
        const newNode: CanvasNodeData = {
            id,
            type,
            title,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: isPanorama ? { ...imageMetadata(image), size: PANORAMA_IMAGE_SIZE, panoramaProjection: "equirectangular" } : imageMetadata(image),
        };
        setNodes((prev) => [...prev, newNode]);
        selectOnly(id);
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, [selectOnly, setSelectedConnectionId]);

    const createImageFileNode = useCallback(async (file: File, position: Position, choosePanoramaImport = false) => {
        const hideLoading = message.loading("正在上传图片...", 0);
        try {
            const image = await uploadImage(file);
            if (choosePanoramaImport && image.width === image.height * 2) {
                setPendingPanoramaImport({ image, title: file.name, position });
                return;
            }
            appendImportedImageNode(image, file.name, position, CanvasNodeType.Image);
        } catch (error) {
            console.error("Upload image node failed:", error);
            message.error("图片上传失败");
        } finally {
            hideLoading();
        }
    }, [appendImportedImageNode, message]);

    const finishPanoramaImport = useCallback((type: CanvasNodeType.Image | CanvasNodeType.Panorama) => {
        if (!pendingPanoramaImport) return;
        setPendingPanoramaImport(null);
        appendImportedImageNode(pendingPanoramaImport.image, pendingPanoramaImport.title, pendingPanoramaImport.position, type);
    }, [appendImportedImageNode, pendingPanoramaImport]);
    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const hideLoading = message.loading("正在上传视频...", 0);
        try {
            const video = await uploadMediaFile(file, "video");
            const node = buildImportedVideoNode(video, file.name, position);
            setNodes((prev) => [...prev, node]);
            selectOnly(node.id);
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
        } catch (error) {
            console.error("Upload video node failed:", error);
            message.error("视频上传失败");
        } finally {
            hideLoading();
        }
    }, [message, selectOnly, setSelectedConnectionId]);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const hideLoading = message.loading("正在上传音频...", 0);
        try {
            const audio = await uploadMediaFile(file, "audio");
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            setNodes((prev) => [
                ...prev,
                {
                    id,
                    type: CanvasNodeType.Audio,
                    title: file.name,
                    position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                    width: spec.width,
                    height: spec.height,
                    metadata: audioMetadata(audio),
                },
            ]);
            selectOnly(id);
            setSelectedConnectionId(null);
            return id;
        } catch (error) {
            console.error("Upload audio node failed:", error);
            message.error("音频上传失败");
        } finally {
            hideLoading();
        }
    }, [message, selectOnly, setSelectedConnectionId]);

    const extractingAudioRef = useRef(new Set<string>());

    const extractAudio = useCallback(async (node: CanvasNodeData, trim?: { start: number; end: number }) => {
        if ((node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content || extractingAudioRef.current.has(node.id)) return;
        extractingAudioRef.current.add(node.id);
        if (trim) setTrimmingAudio(true);
        const hideLoading = message.loading(trim ? "正在截取音频..." : "正在分离音频...", 0);
        let input: import("mediabunny").Input | undefined;
        let conversion: import("mediabunny").Conversion | undefined;

        try {
            if (trim && (!Number.isFinite(trim.start) || !Number.isFinite(trim.end) || trim.start < 0 || Math.round((trim.end - trim.start) * 100) < 50)) {
                throw new Error("请填写有效的起止时间，至少保留 0.5 秒");
            }
            const [{ Input, ALL_FORMATS, BlobSource, Output, WavOutputFormat, BufferTarget, Conversion }, blob] = await Promise.all([
                import("mediabunny"),
                resolveMediaUrl(node.metadata.storageKey, node.metadata.content).then(downloadRemoteMedia),
            ]);
            input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
            const audioTrack = await input.getPrimaryAudioTrack();
            if (!audioTrack) throw new Error("该文件没有音轨");
            if (trim && trim.end > await audioTrack.computeDuration()) throw new Error("结束时间不能超过音频时长");

            const target = new BufferTarget();
            const output = new Output({ format: new WavOutputFormat(), target });
            conversion = await Conversion.init({
                input, output, tracks: "primary", trim,
                audio: { process: (sample) => { if (sample.timestamp < 0 && sample.timestamp > -1e-9) sample.setTimestamp(0); return sample; } },
            });
            if (!conversion.isValid) throw new Error("当前浏览器无法解码该文件的音频");
            await conversion.execute();

            const file = new File([target.buffer!], `${node.title || (trim ? "音频" : "视频")} ${trim ? "截取" : "音频"}.wav`, {
                type: "audio/wav",
            });
            const width = NODE_DEFAULT_SIZE[CanvasNodeType.Audio].width;
            hideLoading();
            const audioNodeId = await createAudioFileNode(file, {
                x: node.position.x + node.width + 96 + width / 2,
                y: node.position.y + node.height / 2,
            });

            if (audioNodeId) {
                setConnections((prev) => [
                    ...prev,
                    { id: nanoid(), fromNodeId: node.id, toNodeId: audioNodeId },
                ]);
            }
            return audioNodeId;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "音频处理失败");
        } finally {
            await conversion?.cancel().catch(console.error);
            input?.dispose();
            extractingAudioRef.current.delete(node.id);
            hideLoading();
            if (trim) setTrimmingAudio(false);
        }
    }, [createAudioFileNode, message]);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            selectOnly(node.id);
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter, selectOnly, setSelectedConnectionId],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            message.success("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) message.success("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.defaultPrevented || event.isComposing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[data-canvas-no-zoom]:not([data-canvas-toolbar]),.ant-modal,.ant-dropdown,.ant-select-dropdown")) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;
            if (!isModifierShortcut && !event.altKey && !event.shiftKey && key === "v") {
                event.preventDefault();
                setCanvasTool("select");
                return;
            }
            if (!isModifierShortcut && !event.altKey && !event.shiftKey && key === "h") {
                event.preventDefault();
                setCanvasTool("pan");
                return;
            }
            if (!isModifierShortcut && !event.altKey && event.shiftKey && ["Digit0", "Digit1", "Digit2"].includes(event.code)) {
                event.preventDefault();
                if (event.code === "Digit1") fitAllNodes();
                else if (event.code === "Digit2") fitSelectedNodes();
                else setZoomScale(1);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "d") {
                event.preventDefault();
                duplicateSelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                selectMany(nodesRef.current.map((node) => node.id));
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "g") {
                event.preventDefault();
                createGroupFromSelection();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed && selection.toString()) return;

                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                clearSelection();
                setSelectedConnectionId(null);
                setContextMenu(null);
                setNodeCreatePosition(null);
                setSelectionBox(null);
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, createGroupFromSelection, deleteConnection, deleteNodes, duplicateSelectedNodes, fitAllNodes, fitSelectedNodes, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setConnecting, setZoomScale, undoCanvas, clearSelection, selectMany, selectedNodeIdsRef, setSelectedConnectionId]);

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting, setSelectedConnectionId],
    );

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position, loadedNode?: CanvasNodeData) => {
        if (!loadedNode) {
            setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)));
            return;
        }
        const metadata = loadedNode.metadata;
        if (!width || !height || !metadata?.clientTaskId || !metadata.content || metadata.isBatchRoot || metadata.batchRootId) return;
        if (loadedNode.type !== CanvasNodeType.Image && loadedNode.type !== CanvasNodeType.Video) return;
        const mediaSize = { content: metadata.content, width, height };
        const run = nodeTaskRunsRef.current.get(`${nodeId}:${metadata.clientTaskId}`);
        if (run) {
            run.mediaSize = mediaSize;
            if (run.task && canvasTaskMediaURL(run.task) === mediaSize.content) run.task = { ...run.task, mediaSize };
        }

        if (fitCanvasMediaNode(loadedNode, mediaSize) === loadedNode) return;
        const updates = new Map<CanvasNodeData[], CanvasNodeData[]>();
        setNodes((items) => {
            const cached = updates.get(items);
            if (cached) return cached;
            let changed = false;
            const next = items.map((item) => {
                if (item.id !== nodeId || item.metadata?.clientTaskId !== metadata.clientTaskId) return item;
                const updated = fitCanvasMediaNode(item, mediaSize);
                changed ||= updated !== item;
                return updated;
            });
            const result = changed ? next : items;
            updates.set(items, result);
            if (lastHistoryRef.current?.nodes === items) lastHistoryRef.current.nodes = result;
            return result;
        });
    }, [nodeTaskRunsRef]);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || !isCanvasImageNodeType(node.type)) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                return { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } };
            }),
        );
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                        ...node,
                        width: child.width,
                        height: child.height,
                        metadata: {
                            ...node.metadata,
                            content: child.metadata?.content,
                            storageKey: child.metadata?.storageKey,
                            bytes: child.metadata?.bytes,
                            mimeType: child.metadata?.mimeType,
                            primaryImageId: child.id,
                            status: (node.type === CanvasNodeType.Image && !node.metadata?.clientTaskId) || node.metadata?.status === "stopping" || node.metadata?.status === "stopped" ? child.metadata?.status : node.metadata?.status,
                            imageTaskId: node.type === CanvasNodeType.Image && !node.metadata?.clientTaskId ? child.metadata?.imageTaskId : node.metadata?.imageTaskId,
                            naturalWidth: child.metadata?.naturalWidth,
                            naturalHeight: child.metadata?.naturalHeight,
                            freeResize: child.metadata?.freeResize,
                            panoramaProjection: child.metadata?.panoramaProjection,
                        },
                    }
                    : node,
            ),
        );
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: node.type === CanvasNodeType.Panorama ? { ...node.metadata, prompt, panoramaSourcePrompt: prompt } : { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
        const type = nodesRef.current.find((node) => node.id === nodeId)?.type;
        if (type === CanvasNodeType.Image || type === CanvasNodeType.Video) {
            const settings = Object.fromEntries(Object.entries(patch || {}).filter(([key, value]) =>
                value !== undefined && (key === "size" || key === (type === CanvasNodeType.Image ? "quality" : "vquality"))));
            if (Object.keys(settings).length) useCanvasUiStore.setState((state) => ({
                generationDefaults: { ...state.generationDefaults, [type]: { ...state.generationDefaults[type], ...settings } },
            }));
        }
    }, []);

    const handleDirectorProjectChange = useCallback(
        (project: unknown) => {
            if (!openDirectorNodeId) return;
            setNodes((prev) =>
                prev.map((node) =>
                    node.id === openDirectorNodeId && node.type === CanvasNodeType.Director
                        ? { ...node, metadata: { ...node.metadata, directorProject: project } }
                        : node,
                ),
            );
        },
        [openDirectorNodeId],
    );

    const handleDirectorPanoramaRemoved = useCallback(
        ({ edgeId, sourceNodeId }: Pick<CanvasDirectorPanorama, "edgeId" | "sourceNodeId">) => {
            if (!openDirectorNodeId) return;
            const connection = connectionsRef.current.find(
                (item) => item.id === edgeId && item.fromNodeId === sourceNodeId && item.toNodeId === openDirectorNodeId,
            );
            if (!connection) return;
            setConnections((prev) => prev.filter((item) => item.id !== connection.id));
        },
        [openDirectorNodeId],
    );

    const handleDirectorCapturesSent = useCallback(
        async (directorNodeId: string, captures: CanvasDirectorCapture[]) => {
            const director = nodesRef.current.find((node) => node.id === directorNodeId && node.type === CanvasNodeType.Director);
            if (!director || captures.length === 0) return;

            const hideLoading = message.loading(captures.length > 1 ? "正在发送 " + captures.length + " 张截图到画布..." : "正在发送截图到画布...", 0);
            try {
                const images = await Promise.all(
                    captures.map(async (capture) => {
                        const image = await uploadImage(capture.dataUrl, { localOnly: true });
                        return {
                            id: nanoid(),
                            title: capture.fileName,
                            size: fitNodeSize(image.width, image.height),
                            metadata: imageMetadata(image),
                        };
                    }),
                );
                let y = getNextDirectorOutputY(director, nodesRef.current, connectionsRef.current);
                const imageNodes = images.map((image) => {
                    const node = {
                        id: image.id,
                        type: CanvasNodeType.Image,
                        title: image.title,
                        position: { x: director.position.x + director.width + 96, y },
                        width: image.size.width,
                        height: image.size.height,
                        metadata: image.metadata,
                    } satisfies CanvasNodeData;
                    y += node.height + 36;
                    return node;
                });
                setNodes((prev) => [...prev, ...imageNodes]);
                setConnections((prev) => [...prev, ...imageNodes.map((node) => ({ id: nanoid(), fromNodeId: director.id, toNodeId: node.id }))]);
                selectMany(imageNodes.map((node) => node.id));
                setSelectedConnectionId(null);
                message.success(captures.length > 1 ? "已发送 " + captures.length + " 张截图到画布" : "截图已发送到画布");
            } catch (error) {
                console.error("Send director captures to canvas failed:", error);
                message.error("截图发送到画布失败");
            } finally {
                hideLoading();
            }
        },
        [message, selectMany, setSelectedConnectionId],
    );

    const handleDirectorVideoSent = useCallback(
        async (directorNodeId: string, output: CanvasDirectorVideo) => {
            const director = nodesRef.current.find((node) => node.id === directorNodeId && node.type === CanvasNodeType.Director);
            if (!director) return;

            const hideLoading = message.loading("正在发送视频到画布...", 0);
            try {
                const uploaded = await uploadMediaFile(output.blob, "video");
                const video = {
                    ...uploaded,
                    width: uploaded.width || output.width,
                    height: uploaded.height || output.height,
                    durationMs: uploaded.durationMs || Math.round(output.durationSeconds * 1000),
                };
                const y = getNextDirectorOutputY(director, nodesRef.current, connectionsRef.current);
                const size = fitNodeSize(video.width, video.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const node = buildImportedVideoNode(video, output.fileName, {
                    x: director.position.x + director.width + 96 + size.width / 2,
                    y: y + size.height / 2,
                });
                setNodes((prev) => [...prev, node]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: director.id, toNodeId: node.id }]);
                selectOnly(node.id);
                setSelectedConnectionId(null);
                setDialogNodeId(node.id);
                message.success("视频已发送到画布");
            } catch (error) {
                console.error("Send director video to canvas failed:", error);
                message.error("视频发送到画布失败");
            } finally {
                hideLoading();
            }
        },
        [message, selectOnly, setSelectedConnectionId],
    );

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((!isCanvasImageNodeType(node.type) && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
    }, []);

    const disconnectNodeReference = useCallback((fromNodeId: string, toNodeId: string) => {
        setConnections((prev) => prev.filter((connection) => connection.fromNodeId !== fromNodeId || connection.toNodeId !== toNodeId));
    }, []);

    const startNodeReferenceSelection = useCallback((nodeId: string) => {
        setReferencePickerNodeId(nodeId);
        selectOnly(nodeId);
        setSelectedConnectionId(null);
        setContextMenu(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, [selectOnly, setSelectedConnectionId]);

    const exitNodeReferenceSelection = useCallback(() => {
        if (!referencePickerNodeId) return;
        selectOnly(referencePickerNodeId);
        setDialogNodeId(referencePickerNodeId);
        setReferencePickerNodeId(null);
    }, [referencePickerNodeId, selectOnly]);

    const selectNodeReference = useCallback((fromNodeId: string) => {
        if (!referencePickerNodeId || referenceConnectedNodeIds.has(fromNodeId)) return;
        const source = nodesRef.current.find((node) => node.id === fromNodeId);
        if (!source || !isCanvasReferenceNode(source)) return;
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId, toNodeId: referencePickerNodeId }]);
    }, [referenceConnectedNodeIds, referencePickerNodeId]);

    useEffect(() => {
        if (!referencePickerNodeId) return;
        const exit = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            exitNodeReferenceSelection();
        };
        window.addEventListener("keydown", exit, true);
        return () => window.removeEventListener("keydown", exit, true);
    }, [exitNodeReferenceSelection, referencePickerNodeId]);

    const captureVideoNodeFrame = useCallback(
        async (nodeId: string, position: VideoFramePosition) => {
            setContextMenu(null);
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const video = containerRef.current?.querySelector<HTMLVideoElement>(`[data-node-id="${CSS.escape(nodeId)}"] video`);
            if (node?.type !== CanvasNodeType.Video || !node.metadata?.content || !video) return message.error("无法截取该画面，请重试");
            try {
                const image = await uploadImage(await captureVideoFrame(node.metadata.content, position, video.currentTime));
                const size = fitNodeSize(image.width, image.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const id = nanoid();
                const x = node.position.x + node.width + 96;
                let y = node.position.y + node.height / 2 - size.height / 2;
                while (nodesRef.current.some((item) => item.id !== node.id && item.position.x < x + size.width && item.position.x + item.width > x && item.position.y < y + size.height && item.position.y + item.height > y)) y += size.height + 24;
                const frameName = position === "first" ? "首帧" : position === "last" ? "尾帧" : "当前帧";
                const child: CanvasNodeData = {
                    id,
                    type: CanvasNodeType.Image,
                    title: `${node.title || "视频"} ${frameName}`,
                    position: { x, y },
                    ...size,
                    metadata: imageMetadata(image),
                };
                setNodes((prev) => [...prev, child]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: id }]);
                selectOnly(id);
                setSelectedConnectionId(null);
                setDialogNodeId(id);
                message.success("已生成图片节点");
            } catch {
                message.error("无法截取该画面，请重试");
            }
        },
        [message, selectOnly, setSelectedConnectionId],
    );

    const uploadNodeMediaToCloud = useCallback(async (node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content || node.metadata.storageKey?.startsWith("server:") || uploadingMediaNodeIdsRef.current.has(node.id)) return;
        uploadingMediaNodeIdsRef.current.add(node.id);
        const isAudio = node.type === CanvasNodeType.Audio;
        const mediaName = isAudio ? "音频" : "视频";
        const hideLoading = message.loading(`正在上传${mediaName}至云存储...`, 0);
        try {
            const mediaUrl = await resolveMediaUrl(node.metadata.storageKey, node.metadata.content);
            const filename = `canvas-${node.type}-${node.id}.${isAudio ? audioExtension(node.metadata.mimeType) : "mp4"}`;
            const uploaded = await uploadRemoteMediaToServer(mediaUrl, filename);
            setNodes((nodes) => nodes.some((item) => item.id === node.id && item.metadata?.content === node.metadata?.content && item.metadata?.storageKey === node.metadata?.storageKey) ? nodes.map((item) => (item.id === node.id ? {
                ...item,
                metadata: {
                    ...item.metadata,
                    content: uploaded.url,
                    storageKey: uploaded.storageKey,
                    bytes: uploaded.bytes,
                    mimeType: uploaded.mimeType,
                    naturalWidth: uploaded.width || item.metadata?.naturalWidth,
                    naturalHeight: uploaded.height || item.metadata?.naturalHeight,
                },
            } : item)) : nodes);
            message.success(`${mediaName}已上传至云存储`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "";
            if (errorMessage.includes("服务端对象存储未启用") || errorMessage.includes("用户对象存储配置不完整")) {
                message.error("未添加云存储");
            } else {
                message.error(errorMessage || `${mediaName}上传失败`);
            }
        } finally {
            hideLoading();
            uploadingMediaNodeIdsRef.current.delete(node.id);
        }
    }, [message]);

    const uploadNodeImageToCloud = useCallback(async (node: CanvasNodeData) => {
        if (!isCanvasImageNodeType(node.type) || !node.metadata?.content || node.metadata.storageKey?.startsWith("server:") || uploadingImageNodeIdsRef.current.has(node.id)) return;
        uploadingImageNodeIdsRef.current.add(node.id);
        const hideLoading = message.loading("正在上传图片至云存储...", 0);
        try {
            const imageUrl = await resolveImageUrl(node.metadata.storageKey, node.metadata.content);
            const uploaded = await uploadRemoteImageToServer(imageUrl, "canvas-image-" + node.id + ".png");
            setNodes((nodes) => nodes.some((item) => item.id === node.id && item.metadata?.content === node.metadata?.content && item.metadata?.storageKey === node.metadata?.storageKey) ? nodes.map((item) => (item.id === node.id ? {
                ...item,
                metadata: {
                    ...item.metadata,
                    content: uploaded.url,
                    storageKey: uploaded.storageKey,
                    bytes: uploaded.bytes,
                    mimeType: uploaded.mimeType,
                    naturalWidth: uploaded.width || item.metadata?.naturalWidth,
                    naturalHeight: uploaded.height || item.metadata?.naturalHeight,
                },
            } : item)) : nodes);
            setChatSessions((sessions) => syncAssistantReferences(sessions, [{
                ...node,
                metadata: {
                    ...node.metadata,
                    content: uploaded.url,
                    storageKey: uploaded.storageKey,
                    mimeType: uploaded.mimeType,
                },
            }], false, node));
            message.success("图片已上传至云存储");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "";
            if (errorMessage.includes("服务端对象存储未启用") || errorMessage.includes("用户对象存储配置不完整")) {
                message.error("未添加云存储");
            } else {
                message.error(errorMessage || "图片上传失败");
            }
        } finally {
            hideLoading();
            uploadingImageNodeIdsRef.current.delete(node.id);
        }
    }, [message]);

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error("没有可保存的文本");
                addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || "画布文本", coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success("已加入我的素材");
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error("没有可保存的视频");
                addAsset({ kind: "video", title: node.metadata?.prompt?.slice(0, 24) || "画布视频", coverUrl: "", tags: [], source: "Canvas", data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" }, metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt } });
                message.success("已加入我的素材");
                return;
            }
            if (!node.metadata?.content) return message.error("没有可保存的图片");
            try {
                const stored = !node.metadata.storageKey && node.metadata.content.startsWith("blob:") ? await uploadImage(node.metadata.content, { localOnly: true }) : null;
                const imageUrl = stored?.url || node.metadata.content;
                const storageKey = stored?.storageKey || node.metadata.storageKey;
                const dataUrl = storageKey ? "" : imageUrl;
                addAsset({
                    kind: "image",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
                    coverUrl: imageUrl,
                    tags: [],
                    source: "Canvas",
                    data: {
                        dataUrl,
                        storageKey,
                        width: stored?.width || node.metadata.naturalWidth || node.width,
                        height: stored?.height || node.metadata.naturalHeight || node.height,
                        bytes: stored?.bytes || node.metadata.bytes || getDataUrlByteSize(dataUrl),
                        mimeType: stored?.mimeType || node.metadata.mimeType || "image/png",
                    },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的素材");
            } catch (error) {
                message.error(error instanceof Error ? `图片加入素材失败：${error.message}` : "图片加入素材失败");
            }
        },
        [addAsset, message],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (!isCanvasImageNodeType(node.type) || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(
                    CanvasNodeType.Text,
                    { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY },
                    { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 },
                ),
                title: "反推提示词",
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                    },
                ),
                title: "反推提示词配置",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
                { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id },
            ]);
            selectOnly(configNode.id);
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message, selectOnly, setSelectedConnectionId],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        const cropped = await cropDataUrl(node.metadata.content, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Cropped Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        selectOnly(childId);
        setDialogNodeId(childId);
        setCropNodeId(null);
    }, [selectOnly]);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            setSplitNodeId(null);
            const hideSplitLoading = message.loading("正在处理切图...", 0);
            let uploadedImages: UploadedImage[] = [];

            try {
                const pieces = await splitDataUrl(node.metadata.content, params);
                const rows = params.horizontalLines.length + 1;
                const columns = params.verticalLines.length + 1;
                const gap = 16;
                const cellWidth = node.width / columns;
                const cellHeight = node.height / rows;
                const startX = node.position.x + node.width + 96;
                const startY = node.position.y;
                const uploadResults = await Promise.allSettled(
                    pieces.map(async (piece) => ({
                        piece,
                        image: await uploadImage(piece.dataUrl),
                    })),
                );
                const uploadedPieces = uploadResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
                uploadedImages = uploadedPieces.map(({ image }) => image);
                const failedUpload = uploadResults.find((result) => result.status === "rejected");

                if (failedUpload?.status === "rejected") throw failedUpload.reason;

                const childNodes = uploadedPieces.map(({ piece, image }) => {
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        width: cellWidth,
                        height: cellHeight,
                        metadata: {
                            ...imageMetadata(image),
                            prompt: node.metadata?.prompt,
                        },
                    } satisfies CanvasNodeData;
                });

                setNodes((prev) => [...prev, ...childNodes]);
                setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
                selectMany(childNodes.map((child) => child.id));
                setSelectedConnectionId(null);
                setDialogNodeId(null);
                uploadedImages = [];
                message.success(`已切分为 ${childNodes.length} 个子节点`);
            } catch (error) {
                let cleanupFailed = false;

                if (uploadedImages.length) {
                    try {
                        await deleteStoredImages(uploadedImages.map((image) => image.storageKey));
                    } catch {
                        cleanupFailed = true;
                    }
                }

                const errorMessage = error instanceof Error ? error.message : "切图失败";
                message.error(cleanupFailed ? `${errorMessage}；部分临时图片清理失败` : errorMessage);
            } finally {
                hideSplitLoading();
            }
        },
        [message, selectMany, setSelectedConnectionId],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const baseGenerationConfig = buildGenerationConfig(effectiveConfig, node, "image");
            const generationConfig = { ...baseGenerationConfig, model: payload.model || baseGenerationConfig.model, activeChannelId: payload.channelId || baseGenerationConfig.imageChannelId || baseGenerationConfig.activeChannelId, imageChannelId: payload.channelId || baseGenerationConfig.imageChannelId, count: "1", size: node.metadata?.size || "auto" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = `${IMAGE_MASK_EDIT_PROMPT_PREFIX}${userPrompt}`;
            const childId = nanoid();
            const clientTaskId = `client_image_task_${nanoid()}`;
            const markedReference = { id: `${node.id}-marked`, name: `image-${node.id}-marked.png`, type: "image/png", dataUrl: payload.markedDataUrl };
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [markedReference]);
            const childNode: CanvasNodeData = {
                id: childId,
                type: CanvasNodeType.Image,
                title: userPrompt.slice(0, 32) || "局部编辑结果",
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width: node.width,
                height: node.height,
                metadata: { prompt, status: NODE_STATUS_LOADING, startedAt: Date.now(), progress: 0, clientTaskId, imageTaskId: clientTaskId, ...generationMetadata },
            };
            setMaskEditNodeId(null);
            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(childId);
            setNodes((prev) => [...prev, childNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            selectOnly(childId);
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            try {
                const task = await submitNodeTask(childId, clientTaskId, (signal, onServerTask) => createCanvasImageTask(generationConfig, prompt, [markedReference], { signal, onServerTask, nodeId: childId, sourceId: projectId, clientTaskId }));
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                setNodes((prev) => applyCanvasImageTaskUpdate(prev, childId, task, childNode.metadata?.startedAt || Date.now(), { width: node.width, height: node.height }, clientTaskId));
                setConnections((prev) => isNodeTaskActive(childId, clientTaskId) ? applyCanvasImageTaskConnections(prev, childId, task) : prev);
            } catch (error) {
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [effectiveConfig, isAiConfigReady, message, openConfigDialog, projectId, isNodeTaskActive, submitNodeTask, runningRequestRef, selectOnly, setRunningNodeId, setSelectedConnectionId],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content) return;
        setUpscaleNodeId(null);
        const hideLoading = message.loading("正在放大图片...", 0);
        try {
            const upscaled = await upscaleDataUrl(node.metadata.content, params);
            const image = await uploadImage(upscaled);
            const size = fitNodeSize(image.width, image.height);
            const childId = nanoid();
            const child: CanvasNodeData = {
                id: childId,
                type: CanvasNodeType.Image,
                title: "Upscaled Image",
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width: size.width,
                height: size.height,
                metadata: {
                    ...imageMetadata(image),
                    prompt: node.metadata?.prompt,
                },
            };
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            selectOnly(childId);
            setDialogNodeId(childId);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片放大失败");
        } finally {
            hideLoading();
        }
    }, [message, selectOnly]);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const referenceImages = [{ id: node.id, name: `image-${node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }];
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, referenceImages);
            const clientTaskId = `client_image_task_${nanoid()}`;
            const startedAt = Date.now();
            setAngleNodeId(null);
            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, clientTaskId, imageTaskId: clientTaskId, startedAt, progress: 0, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            selectOnly(childId);
            setDialogNodeId(childId);
            try {
                const task = await submitNodeTask(childId, clientTaskId, (signal, onServerTask) => createCanvasImageTask(generationConfig, prompt, referenceImages, { signal, onServerTask, nodeId: childId, sourceId: projectId, clientTaskId }));
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                setNodes((prev) => applyCanvasImageTaskUpdate(prev, childId, task, startedAt, { width: imageConfig.width, height: imageConfig.height }, clientTaskId));
                setConnections((prev) => isNodeTaskActive(childId, clientTaskId) ? applyCanvasImageTaskConnections(prev, childId, task) : prev);
            } catch (error) {
                if (!isNodeTaskActive(childId, clientTaskId)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [effectiveConfig, openConfigDialog, projectId, isNodeTaskActive, submitNodeTask, isAiConfigReady, runningRequestRef, selectOnly, setRunningNodeId],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        if (imageInputRef.current) imageInputRef.current.multiple = !nodeId;
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files || []);
            const file = files[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file))) return;
            const targetNode = target?.nodeId ? nodesRef.current.find((node) => node.id === target.nodeId) : null;
            const targetRun = target?.nodeId ? nodeTaskRunsRef.current.get(target.nodeId) : undefined;
            const targetToken = targetRun?.preparing || targetRun?.generation || targetRun?.controller;
            if (isPanoramaNodeType(targetNode?.type) && !file.type.startsWith("image/")) {
                message.warning("全景图节点仅支持上传图片作为参考");
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            if (target?.nodeId) {
                const targetNodeId = target.nodeId;
                const hideLoading = message.loading(isAudioFile(file) ? "正在上传音频..." : file.type.startsWith("video/") ? "正在上传视频..." : "正在上传图片...", 0);
                try {
                    const audio = isAudioFile(file) ? await uploadMediaFile(file, "audio") : null;
                    const video = !audio && file.type.startsWith("video/") ? await uploadMediaFile(file, "video") : null;
                    const image = !audio && !video ? await uploadImage(file) : null;
                    const canApplyUpload = (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && nodesRef.current.some((node) => node.id === targetNodeId);
                    if (canApplyUpload) {
                        if (targetRun && targetRun.preparing === targetToken) delete targetRun.preparing;
                        if (targetRun) nodeTaskRunsRef.current.set(targetNodeId, { id: "", controller: targetRun.controller, generation: typeof targetToken === "symbol" ? targetToken : undefined });
                        abortNodePolling(targetNodeId);
                    }
                    if (audio && canApplyUpload) {
                        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                        setNodes((prev) => (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && prev.some((node) => node.id === targetNodeId) ? prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Audio, title: file.name, position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 }, width: spec.width, height: spec.height, metadata: { ...node.metadata, ...audioMetadata(audio), clientTaskId: undefined, taskBackend: undefined, errorDetails: undefined } } : node)) : prev);
                        selectOnly(targetNodeId);
                        setSelectedConnectionId(null);
                    } else if (video && canApplyUpload) {
                        const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        setNodes((prev) => (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && prev.some((node) => node.id === targetNodeId) ? prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Video, title: file.name, position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 }, width: nextSize.width, height: nextSize.height, metadata: { ...node.metadata, ...videoMetadata(video), clientTaskId: undefined, taskBackend: undefined, errorDetails: undefined } } : node)) : prev);
                        selectOnly(targetNodeId);
                        setSelectedConnectionId(null);
                        setDialogNodeId(targetNodeId);
                    } else if (image && canApplyUpload) {
                        const size = fitNodeSize(image.width, image.height);
                        setNodes((prev) => (nodeTaskRunsRef.current.get(targetNodeId)?.preparing || nodeTaskRunsRef.current.get(targetNodeId)?.generation || nodeTaskRunsRef.current.get(targetNodeId)?.controller) === targetToken && prev.some((node) => node.id === targetNodeId) ?
                            prev.map((node) => {
                                if (node.id !== targetNodeId) return node;
                                const isPanorama = isPanoramaNodeType(node.type);
                                const nextSize = isPanorama ? PANORAMA_NODE_SIZE : size;
                                return {
                                    ...node,
                                    type: isPanorama ? CanvasNodeType.Panorama : CanvasNodeType.Image,
                                    title: isPanorama ? node.title : file.name,
                                    position: isPanorama ? { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 } : node.position,
                                    width: nextSize.width,
                                    height: nextSize.height,
                                    metadata: {
                                        ...node.metadata,
                                        ...imageMetadata(image),
                                        clientTaskId: undefined,
                                        taskBackend: undefined,
                                        errorDetails: undefined,
                                        freeResize: false,
                                        isBatchRoot: undefined,
                                        batchRootId: undefined,
                                        batchChildIds: undefined,
                                        batchUsesReferenceImages: undefined,
                                        generationType: undefined,
                                        model: isPanorama ? node.metadata?.model : undefined,
                                        size: isPanorama ? PANORAMA_IMAGE_SIZE : undefined,
                                        quality: isPanorama ? node.metadata?.quality : undefined,
                                        count: isPanorama ? node.metadata?.count : undefined,
                                        references: undefined,
                                        primaryImageId: undefined,
                                        imageBatchExpanded: undefined,
                                        imageTaskId: undefined,
                                        imageTaskResultId: undefined,
                                        panoramaSourcePrompt: isPanorama ? node.metadata?.panoramaSourcePrompt : undefined,
                                        panoramaFinalPrompt: undefined,
                                        panoramaProjection: undefined,
                                    },
                                };
                            }) : prev,
                        );
                        selectOnly(targetNodeId);
                        setSelectedConnectionId(null);
                        setDialogNodeId(targetNodeId);
                    }
                } catch (error) {
                    console.error("Upload node file failed:", error);
                    message.error("上传失败");
                } finally {
                    hideLoading();
                }
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                files.forEach((item, index) => {
                    const nextPosition = { x: position.x + index * 48, y: position.y + index * 48 };
                    void (isAudioFile(item)
                        ? createAudioFileNode(item, nextPosition)
                        : item.type.startsWith("video/") ? createVideoFileNode(item, nextPosition) : createImageFileNode(item, nextPosition, files.length === 1));
                });
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas, size.height, size.width, abortNodePolling, message, nodeTaskRunsRef, selectOnly, setSelectedConnectionId],
    );

    function insertAssetAt(payload: InsertAssetPayload, position?: Position, nodeId?: string) {
        const center = position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
        if (payload.kind === "text") {
            createNode(CanvasNodeType.Text, position, payload.content, nodeId);
            return;
        }
        if (payload.kind === "video") {
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
            const id = nodeId || `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
            setNodes((prev) => [...prev, { id, type: CanvasNodeType.Video, title: payload.title, position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 }, width: nextSize.width, height: nextSize.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height } }]);
            selectOnly(id);
            setSelectedConnectionId(null);
            return;
        }
        if (payload.kind === "audio") {
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            const id = nodeId || `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            setNodes((prev) => [...prev, { id, type: CanvasNodeType.Audio, title: payload.title, position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 }, width: spec.width, height: spec.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, bytes: payload.bytes, mimeType: payload.mimeType || "audio/mpeg", durationMs: payload.durationMs } }]);
            selectOnly(id);
            setSelectedConnectionId(null);
            return;
        }
        return insertAssistantImage({ id: nodeId || `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey, source: payload.source }, position, nodeId);
    }

    const insertAssetAtRef = useRef(insertAssetAt);
    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const payload = draggedAssetPayloadRef.current;
            if (event.dataTransfer.getData(CANVAS_ASSET_DRAG_TYPE) && payload) {
                void insertAssetAtRef.current(payload, screenToCanvas(event.clientX, event.clientY));
                return;
            }
            const files = Array.from(event.dataTransfer.files).filter((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item));
            if (!files.length) return;
            const pos = screenToCanvas(event.clientX, event.clientY);
            files.forEach((item, index) => {
                const nextPosition = { x: pos.x + index * 48, y: pos.y + index * 48 };
                void (isAudioFile(item)
                    ? createAudioFileNode(item, nextPosition)
                    : item.type.startsWith("video/") ? createVideoFileNode(item, nextPosition) : createImageFileNode(item, nextPosition, files.length === 1));
            });
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
    );

    const pasteAssistantImage = useCallback(
        (file: File) => {
            const position = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            void createImageFileNode(file, position);
            message.success("已从剪切板添加图片");
        },
        [createImageFileNode, message, screenToCanvas, size.height, size.width],
    );

    const handleAssistantSessionsChange = useCallback((sessions: CanvasAssistantSession[], activeId: string | null) => {
        setChatSessions(sessions);
        setActiveChatId(activeId);
    }, []);

    const handleAgentConfigChange = useCallback((patch: Partial<CanvasAgentConfig>) => {
        setAgentConfig((current) => ({ ...(current || resolvedAgentConfig), ...patch }));
    }, [resolvedAgentConfig]);

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu(null);
    }, []);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            const workflowRef = mode === "text" ? undefined : sourceNode?.metadata?.workflowRef;
            if (workflowRef && !useUserStore.getState().token) {
                message.error("工作流生成需要先登录");
                return;
            }
            if (!workflowRef && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const overwriteExisting = effectiveConfig.nodeRegenerateBehavior === "overwrite" && sourceNode?.type === mode && !sourceNode.metadata?.isBatchRoot
                && Boolean(sourceNode.metadata?.content || sourceNode.metadata?.clientTaskId)
                && (mode !== "image" || workflowRef || !isKIESeedreamLayerDecompositionModel(generationConfig.model));
            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(nodeId);
            const preparingRun: CanvasNodeTaskRun | undefined = overwriteExisting ? nodeTaskRunsRef.current.get(nodeId) || { id: "", controller: new AbortController() } : undefined;
            if (preparingRun) {
                preparingRun.preparing = runningRequest;
                nodeTaskRunsRef.current.set(nodeId, preparingRun);
            }
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent) && !overwriteExisting;
            const generationContext = await hydrateNodeGenerationContext(
                buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt),
            );
            const effectivePrompt = generationContext.prompt.trim();
            const requestPrompt =
                mode === "video" || (mode === "image" && !isPanoramaNodeType(sourceNode?.type))
                    ? applyCameraPrompt(effectivePrompt, sourceNode?.metadata?.cameraControl)
                    : effectivePrompt;
            const markSourceStatus = !isCanvasImageNodeType(sourceNode?.type) && !editingTextNode;
            const statusPrompt = sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
            if (!effectivePrompt && (mode === "text" || (mode === "audio" && !workflowRef))) {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
                return;
            }
            let pendingChildIds: string[] = [];
            let submittedTask: { nodeId: string; id: string } | undefined;
            const textTaskId = mode === "text" ? `client_text_task_${nanoid()}` : "";
            const generationStartedAt = Date.now();
            try {
                if (overwriteExisting && (nodeTaskRunsRef.current.get(nodeId) !== preparingRun || preparingRun?.preparing !== runningRequest)) return;
                const currentStatus = nodesRef.current.find((node) => node.id === nodeId)?.metadata?.status;
                if (preparingRun?.id && !preparingRun.controller.signal.aborted
                    && (preparingRun.submission || currentStatus === "loading" || currentStatus === "stopping")
                    && !canvasTaskCompleted(preparingRun.task?.status) && !canvasTaskFailed(preparingRun.task?.status)) {
                    await handleStopNode(nodeId);
                    if (nodeTaskRunsRef.current.get(nodeId) !== preparingRun || preparingRun.preparing !== runningRequest
                        || (!preparingRun.controller.signal.aborted
                            && !canvasTaskCompleted(preparingRun.task?.status) && !canvasTaskFailed(preparingRun.task?.status))) return;
                }
                if (overwriteExisting && !nodesRef.current.some((node) => node.id === nodeId && !node.metadata?.isBatchRoot)) return;
                if (mode !== "audio" && preparingRun?.preparing === runningRequest) delete preparingRun.preparing;
                if (markSourceStatus) setNodes((prev) => prev.map((node) => node.id === nodeId ? {
                    ...node,
                    metadata: {
                        ...node.metadata, prompt: statusPrompt,
                        ...(mode === "text" && sourceNode?.type !== CanvasNodeType.Config ? { clientTaskId: textTaskId, taskBackend: undefined } : {}),
                        ...(overwriteExisting ? { content: undefined, storageKey: "" } : {}),
                        status: NODE_STATUS_LOADING, startedAt: generationStartedAt,
                        durationMs: undefined, errorDetails: undefined,
                    },
                } : node));
                if (mode === "image" && isPanoramaNodeType(sourceNode?.type)) {
                    const panoramaSourcePrompt = prompt.trim();
                    const sourceReference: ReferenceImage[] = sourceNode?.metadata?.content
                        ? [{ id: sourceNode.id, name: `image-${sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                        : [];
                    const referenceImages = [...generationContext.referenceImages, ...sourceReference];
                    const panoramaPrompt = buildPanoramaPrompt(effectivePrompt, referenceImages.length > 0);
                    const panoramaGenerationConfig = { ...generationConfig, size: PANORAMA_IMAGE_SIZE };
                    const count = getGenerationCount(panoramaGenerationConfig.count);
                    const isEmptyPanoramaNode = !sourceNode?.metadata?.content;
                    const panoramaNodeConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Panorama];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootId = isEmptyPanoramaNode ? nodeId : nanoid();
                    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
                    const targetIds = count > 1 ? childIds : [rootId];
                    const targetTaskIds = Object.fromEntries(targetIds.map((id) => [id, "client_image_task_" + nanoid()]));
                    const primaryTargetId = targetIds[0];
                    pendingChildIds = isEmptyPanoramaNode ? childIds : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Panorama,
                        title: sourceNode?.title || "全景图",
                        position: {
                            x: isEmptyPanoramaNode ? parentPosition.x : parentPosition.x + panoramaNodeConfig.width + gap,
                            y: parentPosition.y + panoramaNodeConfig.height / 2 - panoramaNodeConfig.height / 2,
                        },
                        width: isEmptyPanoramaNode ? sourceNode?.width || panoramaNodeConfig.width : panoramaNodeConfig.width,
                        height: isEmptyPanoramaNode ? sourceNode?.height || panoramaNodeConfig.height : panoramaNodeConfig.height,
                        metadata: {
                            ...buildImageGenerationMetadata(referenceImages.length ? "edit" : "generation", panoramaGenerationConfig, count, referenceImages),
                            workflowRef,
                            prompt: panoramaSourcePrompt,
                            panoramaSourcePrompt,
                            panoramaFinalPrompt: panoramaPrompt,
                            panoramaProjection: undefined,
                            status: NODE_STATUS_LOADING,
                            startedAt: generationStartedAt,
                            progress: 0,
                            clientTaskId: count > 1 ? undefined : targetTaskIds[rootId],
                            imageTaskId: workflowRef && count > 1 ? undefined : primaryTargetId ? targetTaskIds[primaryTargetId] : undefined,
                            primaryImageId: count > 1 ? primaryTargetId : undefined,
                            isBatchRoot: count > 1,
                            batchChildIds: count > 1 ? childIds : undefined,
                            batchUsesReferenceImages: referenceImages.length > 0,
                            imageBatchExpanded: count > 1 ? true : undefined,
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Panorama,
                        title: sourceNode?.title || "全景图",
                        position: {
                            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (panoramaNodeConfig.width + 36),
                            y: rootNode.position.y + Math.floor(index / 2) * (panoramaNodeConfig.height + rowGap),
                        },
                        width: panoramaNodeConfig.width,
                        height: panoramaNodeConfig.height,
                        metadata: {
                            ...buildImageGenerationMetadata(referenceImages.length ? "edit" : "generation", panoramaGenerationConfig, count, referenceImages),
                            workflowRef,
                            prompt: panoramaSourcePrompt,
                            panoramaSourcePrompt,
                            panoramaFinalPrompt: panoramaPrompt,
                            panoramaProjection: undefined,
                            status: NODE_STATUS_LOADING,
                            startedAt: generationStartedAt,
                            progress: 0,
                            clientTaskId: targetTaskIds[id], imageTaskId: targetTaskIds[id],
                            batchRootId: count > 1 ? rootId : undefined,
                        },
                    }));
                    const batchConnections = [...(isEmptyPanoramaNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];

                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isEmptyPanoramaNode
                                    ? {
                                        ...node,
                                        position: rootNode.position,
                                        width: rootNode.width,
                                        height: rootNode.height,
                                        title: rootNode.title,
                                        metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                                    }
                                    : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } }
                                : node,
                        ),
                        ...(isEmptyPanoramaNode ? [] : [rootNode]),
                        ...childNodes,
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    selectOnly(nodeId);
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    const taskResults = await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const task = await submitNodeTask(targetId, targetTaskIds[targetId], async (signal, onServerTask) => workflowRef
                                    ? await workflowImageTask(await submitCanvasWorkflowTask(workflowRef, panoramaGenerationConfig, "image", panoramaPrompt, referenceImages, [], [], targetId, projectId, targetTaskIds[targetId], () => onServerTask("workflow"), signal))
                                    : await createCanvasImageTask({ ...panoramaGenerationConfig, count: "1", quality: panoramaGenerationConfig.quality === "auto" ? "medium" : panoramaGenerationConfig.quality }, panoramaPrompt, referenceImages, { signal, onServerTask, nodeId: targetId, sourceId: projectId, clientTaskId: targetTaskIds[targetId] }));
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                if (task.image_url || task.url) {
                                    setNodes((prev) => {
                                        if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                        const root = prev.find((node) => node.id === rootId);
                                        let next = applyCanvasImageTaskUpdate(prev, targetId, task, generationStartedAt, { width: panoramaNodeConfig.width, height: panoramaNodeConfig.height }, targetTaskIds[targetId]);
                                        if (task.source !== "workflow" && targetId !== rootId && root?.metadata?.primaryImageId === targetId) {
                                            next = applyCanvasImageTaskUpdate(next, rootId, task, generationStartedAt, { width: panoramaNodeConfig.width, height: panoramaNodeConfig.height });
                                        }
                                        return next;
                                    });
                                    if (task.source === "workflow") setConnections((prev) => isNodeTaskActive(targetId, targetTaskIds[targetId]) ? applyCanvasImageTaskConnections(prev, targetId, task, count > 1 ? rootId : undefined) : prev);
                                    return true;
                                }
                                setNodes((prev) => {
                                    if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                    const root = prev.find((node) => node.id === rootId);
                                    return prev.map((node) => {
                                        if (node.id !== targetId && node.id !== rootId) return node;
                                        if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryImageId)) {
                                            return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, primaryImageId: targetId, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined } };
                                        }
                                        if (node.id === targetId) {
                                            return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined } };
                                        }
                                        return node;
                                    });
                                });
                                return true;
                            } catch (error) {
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                const errorDetails = error instanceof Error ? error.message : "全景图生成失败";
                                setNodes((prev) => workflowRef
                                    ? applyCanvasImageTaskUpdate(prev, targetId, { id: targetTaskIds[targetId], source: "workflow", status: "failed", error: { message: errorDetails } }, generationStartedAt, { width: panoramaNodeConfig.width, height: panoramaNodeConfig.height })
                                    : prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                                return false;
                            }
                        }),
                    );
                    const hasSuccess = taskResults.some(Boolean);
                    const hasFailure = taskResults.some((result) => !result);
                    if (hasFailure) message.error(hasSuccess ? "部分全景图任务创建失败" : "全部全景图任务创建失败");
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === rootId && !hasSuccess
                                ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部全景图任务创建失败" } }
                                : node,
                        ),
                    );
                    return;
                }

                if (mode === "image") {
                    const count = !workflowRef && isKIESeedreamLayerDecompositionModel(generationConfig.model) ? 1 : getGenerationCount(generationConfig.count);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && (overwriteExisting || !sourceNode?.metadata?.content);
                    const batchRoot = overwriteExisting && sourceNode?.metadata?.batchRootId ? nodesRef.current.find((node) => node.id === sourceNode.metadata?.batchRootId && node.metadata?.isBatchRoot) : undefined;
                    const createBatchRoot = count > 1 && !batchRoot;
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content && !overwriteExisting
                            ? [{ id: sourceNode.id, name: `image-${sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = [...generationContext.referenceImages, ...sourceReference];
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const imageSize = nodeSizeFromRatio(generationConfig.size, imageConfig.width, imageConfig.height) || imageConfig;
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootId = isEmptyImageNode ? nodeId : nanoid();
                    const displayRootId = batchRoot?.id || rootId;
                    const childIds = Array.from({ length: createBatchRoot ? count : batchRoot ? count - 1 : 0 }, () => nanoid());
                    const targetIds = createBatchRoot ? childIds : [rootId, ...childIds];
                    const targetTaskIds = Object.fromEntries(targetIds.map((id) => [id, `client_image_task_${nanoid()}`]));
                    const primaryTargetId = targetIds[0];
                    pendingChildIds = isEmptyImageNode ? childIds : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
                            y: parentPosition.y + parentConfig.height / 2 - imageSize.height / 2,
                        },
                        width: isEmptyImageNode ? sourceNode?.width || imageSize.width : imageSize.width,
                        height: isEmptyImageNode ? sourceNode?.height || imageSize.height : imageSize.height,
                        metadata: {
                            prompt: effectivePrompt,
                            cameraControl: sourceNode?.metadata?.cameraControl,
                            status: NODE_STATUS_LOADING,
                            startedAt: generationStartedAt,
                            progress: 0,
                            clientTaskId: createBatchRoot ? undefined : targetTaskIds[rootId],
                            imageTaskId: workflowRef && createBatchRoot ? undefined : primaryTargetId ? targetTaskIds[primaryTargetId] : undefined,
                            primaryImageId: createBatchRoot ? primaryTargetId : undefined,
                            isBatchRoot: createBatchRoot,
                            batchChildIds: createBatchRoot ? childIds : undefined,
                            ...(batchRoot ? { batchRootId: batchRoot.id } : {}),
                            batchUsesReferenceImages: referenceImages.length > 0,
                            ...generationMetadata,
                            workflowRef,
                            imageBatchExpanded: createBatchRoot ? true : undefined,
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageSize.width + 36),
                            y: rootNode.position.y + Math.floor(index / 2) * (imageSize.height + rowGap),
                        },
                        width: imageSize.width,
                        height: imageSize.height,
                        metadata: { prompt: effectivePrompt, cameraControl: sourceNode?.metadata?.cameraControl, status: NODE_STATUS_LOADING, startedAt: generationStartedAt, progress: 0, clientTaskId: targetTaskIds[id], imageTaskId: targetTaskIds[id], batchRootId: batchRoot?.id || (createBatchRoot ? rootId : undefined), ...generationMetadata, workflowRef },
                    }));
                    const batchConnections = [...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: displayRootId, toNodeId: childId }))];

                    if (overwriteExisting && createBatchRoot) {
                        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
                        nodeTaskRunsRef.current.set(rootId, { id: "", controller: new AbortController(), generation: runningRequest });
                        nodesRef.current = nodesRef.current.map((node) => node.id === rootId
                            ? { ...node, metadata: { ...node.metadata, isBatchRoot: true } } : node);
                    }
                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === batchRoot?.id && (childIds.length || node.metadata?.primaryImageId === nodeId)
                                ? {
                                    ...node,
                                    metadata: {
                                        ...node.metadata,
                                        batchChildIds: [...(node.metadata?.batchChildIds || []), ...childIds],
                                        ...(node.metadata?.primaryImageId === nodeId
                                            && !(node.metadata.clientTaskId && node.metadata.imageTaskId === node.metadata.clientTaskId
                                                && [NODE_STATUS_LOADING, "stopping"].includes(node.metadata.status || "")) ? {
                                            content: undefined, storageKey: "", status: NODE_STATUS_LOADING,
                                            errorDetails: undefined, clientTaskId: undefined,
                                            imageTaskId: workflowRef ? undefined : targetTaskIds[nodeId],
                                            imageTaskResultId: undefined, workflowRef,
                                            startedAt: generationStartedAt, durationMs: undefined, progress: 0,
                                        } : {}),
                                    },
                                }
                                : node.id === nodeId
                                ? isConfigNode
                                    ? {
                                        ...node,
                                        metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, startedAt: generationStartedAt, durationMs: undefined, errorDetails: undefined },
                                    }
                                    : isEmptyImageNode
                                        ? {
                                            ...node,
                                            position: overwriteExisting ? node.position : rootNode.position,
                                            width: overwriteExisting ? node.width : rootNode.width,
                                            height: overwriteExisting ? node.height : rootNode.height,
                                            title: rootNode.title,
                                            metadata: { ...node.metadata, ...rootNode.metadata, ...(overwriteExisting ? { content: undefined, storageKey: "", imageTaskResultId: undefined, taskBackend: undefined, durationMs: undefined } : {}), errorDetails: undefined },
                                        }
                                        : isImageNode
                                            ? {
                                                ...node,
                                                metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                                            }
                                            : {
                                                ...node,
                                                type: CanvasNodeType.Text,
                                                title: prompt.slice(0, 32) || "Prompt",
                                                width: parentConfig.width,
                                                height: parentConfig.height,
                                                metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                                            }
                                : node,
                        ),
                        ...(isEmptyImageNode ? [] : [rootNode]),
                        ...childNodes.map((child, index) => {
                            const parent = prev.find((node) => node.id === (batchRoot?.id || (overwriteExisting ? rootId : "")));
                            const slot = (batchRoot ? parent?.metadata?.batchChildIds?.length || 0 : 0) + index;
                            return parent ? { ...child, position: { x: parent.position.x + parent.width + 120 + (slot % 2) * (imageSize.width + 36), y: parent.position.y + Math.floor(slot / 2) * (imageSize.height + rowGap) } } : child;
                        }),
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    selectOnly(nodeId);
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    const taskResults = await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const task = await submitNodeTask(targetId, targetTaskIds[targetId], async (signal, onServerTask) => workflowRef
                                    ? await workflowImageTask(await submitCanvasWorkflowTask(workflowRef, generationConfig, "image", requestPrompt, referenceImages, [], [], targetId, projectId, targetTaskIds[targetId], () => onServerTask("workflow"), signal))
                                    : await createCanvasImageTask({ ...generationConfig, count: "1" }, requestPrompt, referenceImages, { signal, onServerTask, nodeId: targetId, sourceId: projectId, clientTaskId: targetTaskIds[targetId] }), overwriteExisting && targetId === nodeId ? runningRequest : undefined);
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                if (task.image_url || task.url) {
                                    setNodes((prev) => {
                                        if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                        const root = prev.find((node) => node.id === displayRootId);
                                        let next = applyCanvasImageTaskUpdate(prev, targetId, task, generationStartedAt, { width: imageSize.width, height: imageSize.height }, targetTaskIds[targetId]);
                                        if (task.source !== "workflow" && targetId !== displayRootId && root?.metadata?.primaryImageId === targetId && (!batchRoot || root.metadata.imageTaskId === targetTaskIds[targetId])) {
                                            next = applyCanvasImageTaskUpdate(next, displayRootId, task, generationStartedAt, { width: imageSize.width, height: imageSize.height });
                                        }
                                        return next;
                                    });
                                    setConnections((prev) => isNodeTaskActive(targetId, targetTaskIds[targetId]) ? applyCanvasImageTaskConnections(prev, targetId, task, batchRoot?.id || (createBatchRoot ? rootId : undefined)) : prev);
                                    return true;
                                }
                                setNodes((prev) => {
                                    if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return prev;
                                    const root = prev.find((node) => node.id === displayRootId);
                                    return prev.map((node) => {
                                        if (node.id !== targetId && node.id !== displayRootId) return node;
                                        if (node.id === displayRootId && (targetId === displayRootId || !root?.metadata?.primaryImageId))
                                            return {
                                                ...node,
                                                metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, primaryImageId: targetId, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined },
                                            };
                                        if (node.id === targetId)
                                            return {
                                                ...node,
                                                metadata: { ...node.metadata, status: NODE_STATUS_LOADING, imageTaskId: task.id, imageTaskResultId: undefined, startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || generationStartedAt, progress: task.progress || 0, errorDetails: undefined },
                                            };
                                        return node;
                                    });
                                });
                                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return true;
                            } catch (error) {
                                if (!isNodeTaskActive(targetId, targetTaskIds[targetId])) return true;
                                const errorDetails = error instanceof Error ? error.message : "生成失败";
                                setNodes((prev) => workflowRef
                                    ? applyCanvasImageTaskUpdate(prev, targetId, { id: targetTaskIds[targetId], source: "workflow", status: "failed", error: { message: errorDetails } }, generationStartedAt, { width: imageSize.width, height: imageSize.height })
                                    : prev.map((node) => (node.id === targetId || (node.id === batchRoot?.id && node.metadata?.primaryImageId === targetId && node.metadata.imageTaskId === targetTaskIds[targetId]) ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                                return false;
                            }
                        }),
                    );
                    const hasSuccess = taskResults.some(Boolean);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR } }
                                : node.id === rootId && !hasSuccess && (!targetTaskIds[rootId] || (node.metadata?.clientTaskId === targetTaskIds[rootId] && isNodeTaskActive(rootId, targetTaskIds[rootId])))
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR } }
                                    : node,
                        ),
                    );
                    return;
                }

                if (mode === "video") {
                    const videoGenerationConfig = workflowRef ? generationConfig : withCanvasVideoAdvancedConfig(generationConfig, generationContext);
                    const frameReferencesEnabled = Boolean(workflowRef) || supportsVideoFrameReferences(videoGenerationConfig.model, channelProtocolForConfig(videoGenerationConfig));
                    const firstFrame = frameReferencesEnabled ? generationContext.firstFrame : null;
                    const lastFrame = frameReferencesEnabled ? generationContext.lastFrame : null;
                    const videoReferenceImages = frameReferencesEnabled || isAutoDLConfig(videoGenerationConfig) ? generationContext.referenceImages : [...generationContext.referenceImages, ...[generationContext.firstFrame, generationContext.lastFrame].filter((image): image is ReferenceImage => Boolean(image))];
                    const spec = nodeSizeFromRatio(videoGenerationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && (overwriteExisting || !sourceNode.metadata?.content);
                    const videoId = isEmptyVideoNode ? nodeId : nanoid();
                    const clientTaskId = `client_video_task_${nanoid()}`;
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoNode: CanvasNodeData = {
                        id: videoId,
                        type: CanvasNodeType.Video,
                        title: effectivePrompt.slice(0, 32) || "Generated Video",
                        position: isEmptyVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
                        width: isEmptyVideoNode ? sourceNode.width : spec.width,
                        height: isEmptyVideoNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, cameraControl: sourceNode?.metadata?.cameraControl, status: NODE_STATUS_LOADING, model: videoGenerationConfig.model, channelId: videoGenerationConfig.videoChannelId || videoGenerationConfig.activeChannelId, workflowRef, size: videoGenerationConfig.size, seconds: videoGenerationConfig.videoSeconds, vquality: videoGenerationConfig.vquality, mode: videoGenerationConfig.videoMode, negativePrompt: videoGenerationConfig.videoNegativePrompt, multiShot: videoGenerationConfig.videoMultiShot, shotType: videoGenerationConfig.videoShotType, generateAudio: videoGenerationConfig.videoGenerateAudio, characterOrientation: videoGenerationConfig.videoCharacterOrientation, watermark: videoGenerationConfig.videoWatermark, references: generationReferenceUrls({ ...generationContext, referenceImages: videoReferenceImages, firstFrame, lastFrame }), firstFrameNodeId: sourceNode?.metadata?.firstFrameNodeId, lastFrameNodeId: sourceNode?.metadata?.lastFrameNodeId, klingImageNodeIds: sourceNode?.metadata?.klingImageNodeIds, klingMultiPrompt: sourceNode?.metadata?.klingMultiPrompt, klingElementList: sourceNode?.metadata?.klingElementList, startedAt: generationStartedAt, progress: 0, clientTaskId, videoTaskId: clientTaskId },
                    };
                    pendingChildIds = [videoId];
                    setNodes((prev) => (isEmptyVideoNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode, ...(overwriteExisting ? { position: node.position, width: node.width, height: node.height, metadata: { ...node.metadata, ...videoNode.metadata, taskBackend: undefined, videoTaskVideoId: undefined, videoTaskTranslation: undefined } } : {}) } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode]));
                    if (!isEmptyVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    submittedTask = { nodeId: videoId, id: clientTaskId };
                    const videoTask = await submitNodeTask(videoId, clientTaskId, async (signal, onServerTask) => workflowRef
                        ? await workflowVideoTask(await submitCanvasWorkflowTask(workflowRef, videoGenerationConfig, "video", requestPrompt, [firstFrame, ...videoReferenceImages, lastFrame].filter((image): image is ReferenceImage => Boolean(image)), generationContext.referenceVideos, generationContext.referenceAudios, videoId, projectId, clientTaskId, () => onServerTask("workflow"), signal))
                        : (await createVideoGenerationTask(videoGenerationConfig, requestPrompt, { references: videoReferenceImages, firstFrame, lastFrame, videoReferences: generationContext.referenceVideos, audioReferences: generationContext.referenceAudios }, undefined, { signal, onServerTask, clientTaskId, source: "canvas", sourceId: videoId })).task, overwriteExisting ? runningRequest : undefined);
                    if (!isNodeTaskActive(videoId, clientTaskId)) return;
                    setNodes((prev) => applyCanvasVideoTaskUpdate(prev, videoId, videoTask, videoGenerationConfig, generationStartedAt, spec, clientTaskId));
                    return;
                }

                if (mode === "audio") {
                    const workflowAudios = workflowRef ? generationContext.referenceAudios : [];
                    const referenceAudio = workflowRef ? undefined : selectAudioReference(generationConfig, sourceNode?.metadata, generationContext.referenceAudios);
                    if (preparingRun?.preparing === runningRequest) delete preparingRun.preparing;
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && (overwriteExisting || !sourceNode.metadata?.content);
                    const audioId = isEmptyAudioNode ? nodeId : nanoid();
                    const clientAudioTaskId = `client_audio_task_${nanoid()}`;
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: isEmptyAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
                        width: isEmptyAudioNode ? sourceNode.width : spec.width,
                        height: isEmptyAudioNode ? sourceNode.height : spec.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, startedAt: generationStartedAt, progress: 0, clientTaskId: clientAudioTaskId, audioTaskId: clientAudioTaskId, ...buildAudioGenerationMetadata(generationConfig, sourceNode?.metadata), workflowRef },
                    };
                    pendingChildIds = [audioId];
                    setNodes((prev) => (isEmptyAudioNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode, ...(overwriteExisting ? { position: node.position, width: node.width, height: node.height, metadata: { ...node.metadata, ...audioNode.metadata, taskBackend: undefined, audioTaskResultId: undefined } } : {}) } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode]));
                    if (!isEmptyAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    submittedTask = { nodeId: audioId, id: clientAudioTaskId };
                    const task = await submitNodeTask(audioId, clientAudioTaskId, async (signal, onServerTask) => workflowRef
                        ? await workflowAudioTask(await submitCanvasWorkflowTask(workflowRef, generationConfig, "audio", effectivePrompt, [], [], workflowAudios, audioId, projectId, clientAudioTaskId, () => onServerTask("workflow"), signal))
                        : await createCanvasAudioTask(generationConfig, effectivePrompt, { signal, onServerTask, nodeId: audioId, sourceId: projectId, clientTaskId: clientAudioTaskId }, referenceAudio), overwriteExisting ? runningRequest : undefined);
                    if (!isNodeTaskActive(audioId, clientAudioTaskId)) return;
                    setNodes((prev) => applyCanvasAudioTaskUpdate(prev, audioId, task, generationStartedAt, clientAudioTaskId));
                    return;
                }

                let streamed = "";
                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = isConfigNode ? getGenerationCount(generationConfig.count) : 1;
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const childIds = isConfigNode || editingTextNode ? Array.from({ length: textCount }, () => nanoid()) : [];
                pendingChildIds = childIds;
                if (isConfigNode || editingTextNode) {
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Text,
                        title: effectivePrompt.slice(0, 32) || "Generated Text",
                        position: {
                            x: parentPosition.x + parentConfig.width + 96,
                            y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
                        },
                        width: textConfig.width,
                        height: textConfig.height,
                        metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, fontSize: 14, clientTaskId: textTaskId },
                    }));
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                    setConnections((prev) => [...prev, ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }))]);
                }

                const answers = await Promise.all(
                    (childIds.length ? childIds : [nodeId]).map((targetNodeId) => {
                        let localStreamed = "";
                        return submitNodeTask(targetNodeId, textTaskId, async (signal) => ({ id: textTaskId, status: "completed", text: await requestImageQuestion(generationConfig, buildNodeChatMessages({ ...generationContext, prompt: effectivePrompt }), (text) => {
                            localStreamed = text;
                            streamed = text;
                            setNodes((prev) => isNodeTaskActive(targetNodeId, textTaskId) && prev.some((node) => node.id === targetNodeId && node.metadata?.clientTaskId === textTaskId) ? prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: text, status: NODE_STATUS_LOADING } } : node)) : prev);
                        }, signal) }), overwriteExisting ? runningRequest : undefined).then((task) => ({ nodeId: targetNodeId, content: task.text || localStreamed })).catch((error) => {
                            if (!isNodeTaskActive(targetNodeId, textTaskId)) return { nodeId: targetNodeId, content: "" };
                            throw error;
                        });
                    }),
                );
                const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
                setNodes((prev) =>
                    prev.some((node) => (node.id === nodeId && isConfigNode) || (node.metadata?.clientTaskId === textTaskId && isNodeTaskActive(node.id, textTaskId))) ? prev.map((node) =>
                        (node.id !== nodeId || !isConfigNode) && (node.metadata?.clientTaskId !== textTaskId || !isNodeTaskActive(node.id, textTaskId)) ? node
                            : childIds.includes(node.id)
                            ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                            : node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                                : node.id === nodeId && !editingTextNode
                                    ? { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Generated Text", metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                                    : node,
                    ) : prev,
                );
            } catch (error) {
                if (submittedTask && !isNodeTaskActive(submittedTask.nodeId, submittedTask.id)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => {
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    if (mode === "text" && !prev.some((node) => (node.id === nodeId && isConfigNode)
                        || (node.metadata?.clientTaskId === textTaskId && isNodeTaskActive(node.id, textTaskId)))) return prev;
                    return prev.map((node) => {
                        if (mode === "text" && (node.id !== nodeId || !isConfigNode)
                            && (node.metadata?.clientTaskId !== textTaskId || !isNodeTaskActive(node.id, textTaskId))) return node;
                        if (node.id !== nodeId && !pendingChildIds.includes(node.id)) return node;
                        if (node.id === nodeId && !markSourceStatus) return node;
                        return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } };
                    });
                });
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [effectiveConfig, openConfigDialog, isNodeTaskActive, submitNodeTask, handleStopNode, isAiConfigReady, message, nodeTaskRunsRef, projectId, runningRequestRef, selectOnly, setRunningNodeId, setSelectedConnectionId],
    );

    const getCanvasAgentContext = useCallback(
        (agentState: CanvasAgentState) =>
            buildCanvasAgentContext({
                projectId,
                projectTitle: currentProject?.title || "未命名画布",
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                selectedNodeIds: selectedNodeIdsRef.current,
                config: agentEffectiveConfig,
                autoGenerateMedia: resolvedAgentConfig.autoGenerateMedia,
                agentState,
            }),
        [agentEffectiveConfig, currentProject?.title, projectId, resolvedAgentConfig.autoGenerateMedia, selectedNodeIdsRef],
    );

    const executeCanvasAgentAction = useCallback(
        async (action: CanvasAgentAction, messageReferenceNodeIds: string[]): Promise<CanvasAgentToolResult> => {
            const args = action.arguments;
            const stringValue = (key: string) => (typeof args[key] === "string" ? (args[key] as string).trim() : "");
            const stringValues = (key: string) =>
                Array.isArray(args[key])
                    ? [...new Set((args[key] as unknown[]).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
                    : [];
            const getNode = (nodeId: string) => nodesRef.current.find((node) => node.id === nodeId);
            const missingNodeResult = (nodeId: string): CanvasAgentToolResult => ({ ok: false, code: "node_not_found", message: "找不到节点 " + nodeId });
            const validateNodeIds = (nodeIds: string[]) => nodeIds.find((nodeId) => !getNode(nodeId)) || "";
            const selectOnly = (nodeId: string) => {
                const nextSelection = new Set([nodeId]);
                selectedNodeIdsRef.current = nextSelection;
                selectMany(nextSelection);
                setSelectedConnectionId(null);
            };
            const commitNodes = (nextNodes: CanvasNodeData[]) => {
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            };
            const commitConnections = (nextConnections: CanvasConnection[]) => {
                connectionsRef.current = nextConnections;
                setConnections(nextConnections);
            };
            const nextNodeCenter = (type: CanvasNodeType, sourceNodes: CanvasNodeData[], sizeOverride?: { width: number; height: number }) => {
                const spec = sizeOverride ? { ...getNodeSpec(type), ...sizeOverride } : getNodeSpec(type);
                const gapX = 72;
                const gapY = 72;
                const columns = 3;
                const fallbackNodes = nodesRef.current.filter(
                    (node) =>
                        node.type !== CanvasNodeType.Group &&
                        node.type !== CanvasNodeType.Config &&
                        node.type !== CanvasNodeType.Director &&
                        !node.metadata?.groupId &&
                        !node.metadata?.excludeUpstreamText,
                );
                const candidates = sourceNodes.length ? sourceNodes : fallbackNodes;
                const source = candidates.length
                    ? candidates.reduce((rightmost, node) => (node.position.x + node.width > rightmost.position.x + rightmost.width ? node : rightmost))
                    : null;
                const canvasCenter = getCanvasCenter();
                const startX = source ? source.position.x + source.width + 96 + spec.width / 2 : canvasCenter.x;
                const startY = source ? source.position.y + spec.height / 2 : canvasCenter.y;
                const collides = (x: number, y: number) => {
                    const left = x - spec.width / 2;
                    const right = x + spec.width / 2;
                    const top = y - spec.height / 2;
                    const bottom = y + spec.height / 2;
                    return nodesRef.current.some(
                        (node) =>
                            left < node.position.x + node.width + gapX &&
                            right + gapX > node.position.x &&
                            top < node.position.y + node.height + gapY &&
                            bottom + gapY > node.position.y,
                    );
                };
                const maxSlots = Math.max(30, (nodesRef.current.length + 1) * columns * 2);

                for (let slot = 0; slot < maxSlots; slot += 1) {
                    const x = startX + (slot % columns) * (spec.width + gapX);
                    const y = startY + Math.floor(slot / columns) * (spec.height + gapY);
                    if (!collides(x, y)) return { x, y };
                }

                return {
                    x: startX,
                    y: Math.max(canvasCenter.y, ...nodesRef.current.map((node) => node.position.y + node.height + gapY + spec.height / 2)),
                };
            };

            const isAgentWriteAction = action.name === "generate_image" || action.name === "edit_image" || action.name === "generate_video" || action.name === "generate_audio" || action.name === "create_text_node" || action.name === "update_text_node" || action.name === "update_node" || action.name === "delete_node" || action.name === "create_connection" || action.name === "delete_connection" || action.name === "create_group" || action.name === "arrange_nodes";
            const autoTitlePending = useCanvasStore.getState().projects.find((project) => project.id === projectId)?.autoTitlePending === true;
            if (autoTitlePending && action.name !== "create_primary_script_node" && isAgentWriteAction) {
                updateProject(projectId, { autoTitlePending: false });
            }

            try {
                if (action.name === "set_agent_state") {
                    const referencedNodeIds = [...stringValues("approvedNodeIds"), ...stringValues("referenceNodeIds")];
                    const missingNodeId = validateNodeIds(referencedNodeIds);
                    return missingNodeId ? missingNodeResult(missingNodeId) : { ok: true };
                }

                if (action.name === "get_canvas_summary") {
                    return {
                        ok: true,
                        project: { id: projectId, title: currentProject?.title || "未命名画布" },
                        selectedNodeIds: Array.from(selectedNodeIdsRef.current),
                        nodes: nodesRef.current.slice(0, 120).map(canvasAgentNodeSummary),
                        connections: connectionsRef.current.slice(0, 240),
                    };
                }

                if (action.name === "get_selected_nodes") {
                    return { ok: true, nodes: nodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id)).map(canvasAgentNodeSummary) };
                }

                if (action.name === "query_canvas_nodes") {
                    const nodeId = stringValue("nodeId");
                    const keyword = stringValue("keyword").toLowerCase();
                    const type = stringValue("type");
                    const page = Math.max(1, Math.floor(Number(args.page) || 1));
                    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(args.pageSize) || 20)));
                    const filtered = nodesRef.current.filter((node) => {
                        if (nodeId && node.id !== nodeId) return false;
                        if (type && node.type !== type) return false;
                        if (!keyword) return true;
                        const content = isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio ? "" : node.metadata?.content || "";
                        return `${node.title} ${content} ${node.metadata?.prompt || ""}`.toLowerCase().includes(keyword);
                    });
                    return {
                        ok: true,
                        items: filtered.slice((page - 1) * pageSize, page * pageSize).map((node) => ({
                            id: node.id,
                            type: node.type,
                            title: node.title,
                            status: node.metadata?.status,
                            groupId: node.metadata?.groupId,
                        })),
                        total: filtered.length,
                        page,
                        pageSize,
                    };
                }

                if (action.name === "get_generation_config") {
                    const videoModel = agentEffectiveConfig.videoModel || agentEffectiveConfig.model;
                    const audioModel = agentEffectiveConfig.audioModel;
                    const audioConfig = { ...agentEffectiveConfig, model: audioModel, activeChannelId: agentEffectiveConfig.audioChannelId || agentEffectiveConfig.activeChannelId };
                    const grokTts = isGrok2APITtsConfig(audioConfig, audioModel);
                    const miniMaxTts = isMiniMaxTtsConfig(audioConfig, audioModel);
                    return {
                        ok: true,
                        models: {
                            text: agentEffectiveConfig.textModel || agentEffectiveConfig.model,
                            image: agentEffectiveConfig.imageModel || agentEffectiveConfig.model,
                            video: videoModel,
                            audio: agentEffectiveConfig.audioModel,
                        },
                        imageQuality: agentEffectiveConfig.quality,
                        imageSize: agentEffectiveConfig.size,
                        videoQuality: agentEffectiveConfig.vquality,
                        videoSize: agentEffectiveConfig.videoSize,
                        autoGenerateMedia: resolvedAgentConfig.autoGenerateMedia,
                        imageCount: 1,
                        videoSeconds: agentEffectiveConfig.videoSeconds,
                        videoGenerateAudio: agentEffectiveConfig.videoGenerateAudio,
                        videoSupportsAudio: supportsVideoAudioGeneration(videoModel),
                        videoDuration: canvasAgentVideoDurationHint(videoModel),
                        audioVoice: isGeminiTtsModel(audioModel) && isGeminiConfig(audioConfig, audioModel) ? agentEffectiveConfig.geminiTtsVoice : miniMaxTts ? agentEffectiveConfig.miniMaxTtsVoice : isGlmTtsModel(audioModel) ? agentEffectiveConfig.glmTtsVoice : grokTts ? agentEffectiveConfig.grokTtsVoice : agentEffectiveConfig.audioVoice,
                        audioLanguage: grokTts ? agentEffectiveConfig.grokTtsLanguage : "",
                        audioFormat: miniMaxTts ? agentEffectiveConfig.miniMaxTtsFormat : isGlmTtsModel(audioModel) ? agentEffectiveConfig.glmTtsFormat : grokTts ? agentEffectiveConfig.grokTtsFormat : agentEffectiveConfig.audioFormat,
                        audioSpeed: miniMaxTts ? agentEffectiveConfig.miniMaxTtsSpeed : isGlmTtsModel(audioModel) ? agentEffectiveConfig.glmTtsSpeed : grokTts ? agentEffectiveConfig.grokTtsSpeed : agentEffectiveConfig.audioSpeed,
                    };
                }

                if (action.name === "get_node") {
                    const nodeId = stringValue("nodeId");
                    const node = getNode(nodeId);
                    return node ? { ok: true, node: canvasAgentNodeSummary(node) } : missingNodeResult(nodeId);
                }

                if (action.name === "get_upstream_nodes" || action.name === "get_downstream_nodes" || action.name === "get_connected_nodes") {
                    const nodeId = stringValue("nodeId");
                    if (!getNode(nodeId)) return missingNodeResult(nodeId);
                    const upstreamIds = connectionsRef.current.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
                    const downstreamIds = connectionsRef.current.filter((connection) => connection.fromNodeId === nodeId).map((connection) => connection.toNodeId);
                    const upstream = nodesRef.current.filter((node) => upstreamIds.includes(node.id)).map(canvasAgentNodeSummary);
                    const downstream = nodesRef.current.filter((node) => downstreamIds.includes(node.id)).map(canvasAgentNodeSummary);
                    if (action.name === "get_upstream_nodes") return { ok: true, nodes: upstream };
                    if (action.name === "get_downstream_nodes") return { ok: true, nodes: downstream };
                    return { ok: true, upstream, downstream };
                }

                if (action.name === "get_generation_task" || action.name === "get_media_task_status") {
                    const nodeId = stringValue("nodeId");
                    const node = getNode(nodeId);
                    if (!node) return missingNodeResult(nodeId);
                    if (![CanvasNodeType.Image, CanvasNodeType.Panorama, CanvasNodeType.Video, CanvasNodeType.Audio].includes(node.type)) {
                        return { ok: false, code: "not_media_node", message: "节点 " + nodeId + " 不是媒体节点" };
                    }
                    return { ok: true, ...canvasAgentTaskSummary(node) };
                }

                if (action.name === "create_primary_script_node" || action.name === "create_text_node") {
                    const sourceNodeIds = stringValues("sourceNodeIds");
                    const missingNodeId = validateNodeIds(sourceNodeIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const sourceNodes = sourceNodeIds.map((nodeId) => getNode(nodeId)!);
                    const content = stringValue("content");
                    const nodeSize = action.name === "create_primary_script_node" ? AGENT_PRIMARY_SCRIPT_NODE_SIZE : undefined;
                    const nodeCenter = nextNodeCenter(CanvasNodeType.Text, sourceNodes, nodeSize);
                    const node = createCanvasNode(CanvasNodeType.Text, nodeCenter, {
                        content,
                        prompt: content,
                        status: NODE_STATUS_SUCCESS,
                    });
                    if (nodeSize) {
                        node.position = { x: nodeCenter.x - nodeSize.width / 2, y: nodeCenter.y - nodeSize.height / 2 };
                        node.width = nodeSize.width;
                        node.height = nodeSize.height;
                    }
                    node.title = stringValue("title") || content.slice(0, 32) || "文本";
                    const createdConnections = sourceNodeIds.map((sourceNodeId) => ({ id: nanoid(), fromNodeId: sourceNodeId, toNodeId: node.id }));
                    commitNodes([...nodesRef.current, node]);
                    commitConnections([...connectionsRef.current, ...createdConnections]);
                    selectOnly(node.id);
                    const projectTitle = stringValue("projectTitle");
                    if (action.name === "create_primary_script_node" && autoTitlePending) {
                        renameProject(projectId, projectTitle);
                    }
                    return { ok: true, nodeId: node.id, connectionIds: createdConnections.map((connection) => connection.id), node: canvasAgentNodeSummary(node) };
                }

                if (action.name === "update_text_node") {
                    const nodeId = stringValue("nodeId");
                    const node = getNode(nodeId);
                    if (!node) return missingNodeResult(nodeId);
                    if (node.type !== CanvasNodeType.Text) return { ok: false, code: "invalid_node_type", message: "只能用 update_text_node 修改文本节点" };
                    const title = stringValue("title");
                    const content = stringValue("content");
                    const nextNodes = nodesRef.current.map((item) =>
                        item.id === nodeId
                            ? {
                                ...item,
                                title: title || item.title,
                                metadata: content ? { ...item.metadata, content, prompt: content, status: NODE_STATUS_SUCCESS, errorDetails: undefined } : item.metadata,
                            }
                            : item,
                    );
                    commitNodes(nextNodes);
                    return { ok: true, nodeId, node: canvasAgentNodeSummary(nextNodes.find((item) => item.id === nodeId)!) };
                }

                if (action.name === "update_node") {
                    const nodeId = stringValue("nodeId");
                    if (!getNode(nodeId)) return missingNodeResult(nodeId);
                    const nextNodes = nodesRef.current.map((node) => (node.id === nodeId ? { ...node, title: stringValue("title") || node.title } : node));
                    commitNodes(nextNodes);
                    return { ok: true, nodeId, node: canvasAgentNodeSummary(nextNodes.find((node) => node.id === nodeId)!) };
                }

                if (action.name === "delete_node") {
                    const nodeId = stringValue("nodeId");
                    if (!getNode(nodeId)) return missingNodeResult(nodeId);
                    const beforeNodeIds = nodesRef.current.map((node) => node.id);
                    deleteNodes(new Set([nodeId]));
                    const remainingNodeIds = new Set(nodesRef.current.map((node) => node.id));
                    return { ok: true, deletedNodeIds: beforeNodeIds.filter((id) => !remainingNodeIds.has(id)) };
                }

                if (action.name === "create_connection") {
                    const fromNodeId = stringValue("fromNodeId");
                    const toNodeId = stringValue("toNodeId");
                    const fromNode = getNode(fromNodeId);
                    const toNode = getNode(toNodeId);
                    if (!fromNode) return missingNodeResult(fromNodeId);
                    if (!toNode) return missingNodeResult(toNodeId);
                    if (fromNodeId === toNodeId) return { ok: false, code: "self_connection", message: "节点不能连接到自身" };
                    if (fromNode.type === CanvasNodeType.Config && toNode.type === CanvasNodeType.Config) {
                        return { ok: false, code: "invalid_connection", message: "配置节点之间不能连接" };
                    }
                    const existing = connectionsRef.current.find((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId);
                    if (existing) return { ok: true, connectionId: existing.id, alreadyExists: true };
                    const connection = { id: nanoid(), fromNodeId, toNodeId };
                    commitConnections([...connectionsRef.current, connection]);
                    return { ok: true, connectionId: connection.id };
                }

                if (action.name === "delete_connection") {
                    const connectionId = stringValue("connectionId");
                    if (!connectionsRef.current.some((connection) => connection.id === connectionId)) {
                        return { ok: false, code: "connection_not_found", message: "找不到连线 " + connectionId };
                    }
                    deleteConnection(connectionId);
                    return { ok: true, deletedConnectionId: connectionId };
                }

                if (action.name === "create_group") {
                    const nodeIds = stringValues("nodeIds");
                    const missingNodeId = validateNodeIds(nodeIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const groupId = createGroupFromSelection(nodeIds);
                    if (!groupId) return { ok: false, code: "invalid_group", message: "分组至少需要两个未分组的普通节点" };
                    const title = stringValue("title");
                    if (title) {
                        const nextNodes = nodesRef.current.map((node) => (node.id === groupId ? { ...node, title } : node));
                        commitNodes(nextNodes);
                    }
                    return { ok: true, groupId, nodeIds };
                }

                if (action.name === "arrange_nodes") {
                    const requestedIds = stringValues("nodeIds");
                    const missingNodeId = validateNodeIds(requestedIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const targetNodes = requestedIds.length
                        ? requestedIds.map((nodeId) => getNode(nodeId)!)
                        : nodesRef.current.filter((node) => !node.metadata?.groupId && !node.metadata?.batchRootId);
                    if (!targetNodes.length) return { ok: true, arrangedNodeIds: [] };
                    const startX = Math.min(...targetNodes.map((node) => node.position.x));
                    const startY = Math.min(...targetNodes.map((node) => node.position.y));
                    const positions = new Map<string, Position>();
                    let x = startX;
                    let y = startY;
                    let rowHeight = 0;
                    targetNodes.forEach((node, index) => {
                        if (index > 0 && index % 4 === 0) {
                            x = startX;
                            y += rowHeight + 72;
                            rowHeight = 0;
                        }
                        positions.set(node.id, { x, y });
                        x += node.width + 72;
                        rowHeight = Math.max(rowHeight, node.height);
                    });
                    targetNodes
                        .filter((node) => node.type === CanvasNodeType.Group)
                        .forEach((group) => {
                            const groupPosition = positions.get(group.id);
                            if (!groupPosition) return;
                            const offsetX = groupPosition.x - group.position.x;
                            const offsetY = groupPosition.y - group.position.y;
                            nodesRef.current
                                .filter((node) => node.metadata?.groupId === group.id && !positions.has(node.id))
                                .forEach((node) => positions.set(node.id, { x: node.position.x + offsetX, y: node.position.y + offsetY }));
                        });
                    const nextNodes = nodesRef.current.map((node) => (positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node));
                    commitNodes(nextNodes);
                    return { ok: true, arrangedNodeIds: targetNodes.map((node) => node.id) };
                }

                if (action.name === "generate_image" || action.name === "edit_image" || action.name === "generate_video" || action.name === "generate_audio") {
                    const mode: CanvasNodeGenerationMode = action.name === "generate_video" ? "video" : action.name === "generate_audio" ? "audio" : "image";
                    const targetType = mode === "video" ? CanvasNodeType.Video : mode === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image;
                    const sourceNodeIds = Object.prototype.hasOwnProperty.call(args, "sourceNodeIds")
                        ? stringValues("sourceNodeIds")
                        : messageReferenceNodeIds;
                    const missingNodeId = validateNodeIds(sourceNodeIds);
                    if (missingNodeId) return missingNodeResult(missingNodeId);
                    const sourceNodes = sourceNodeIds.map((nodeId) => getNode(nodeId)!);
                    if (action.name === "edit_image" && !sourceNodes.some((node) => isCanvasImageNodeType(node.type) && Boolean(node.metadata?.content))) {
                        return { ok: false, code: "image_reference_required", message: "图片编辑需要至少一个已有内容的图片节点" };
                    }

                    const generationConfig = buildGenerationConfig(agentEffectiveConfig, undefined, mode);
                    const agentWorkflowRef = mode === "image" ? agentEffectiveConfig.imageWorkflowRef : mode === "video" ? agentEffectiveConfig.videoWorkflowRef : agentEffectiveConfig.audioWorkflowRef;
                    if (!agentWorkflowRef && (!generationConfig.model || !isAiConfigReady(generationConfig, generationConfig.model))) {
                        return { ok: false, code: "model_not_configured", message: "请先在全局配置中完成" + (mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片") + "模型配置" };
                    }
                    if (agentWorkflowRef && !useUserStore.getState().token) return { ok: false, code: "login_required", message: "工作流生成需要先登录" };

                    const prompt = stringValue("prompt");
                    const metadata: CanvasNodeMetadata = {
                        prompt,
                        excludeUpstreamText: true,
                        status: "idle",
                        model: generationConfig.model,
                        workflowRef: agentWorkflowRef,
                        channelId: mode === "video" ? generationConfig.videoChannelId : mode === "audio" ? generationConfig.audioChannelId : generationConfig.imageChannelId,
                        size: stringValue("size") || generationConfig.size,
                    };
                    if (mode === "image") {
                        metadata.quality = generationConfig.quality;
                        metadata.count = typeof args.count === "number" ? Math.max(1, Math.floor(args.count)) : 1;
                    }
                    if (mode === "video") {
                        metadata.vquality = generationConfig.vquality;
                        const seconds = typeof args.seconds === "number" ? args.seconds : Number(generationConfig.videoSeconds);
                        const durationError = agentWorkflowRef ? "" : validateCanvasAgentVideoSeconds(generationConfig.model, seconds);
                        if (durationError) return { ok: false, code: "unsupported_duration", message: durationError, supported: canvasAgentVideoDurationHint(generationConfig.model) };
                        const generateAudio = typeof args.generateAudio === "boolean" ? args.generateAudio : generationConfig.videoGenerateAudio === "true";
                        if (!agentWorkflowRef && generateAudio && !supportsVideoAudioGeneration(generationConfig.model)) {
                            return { ok: false, code: "video_audio_not_supported", message: "当前全局视频模型不支持视频原生声音" };
                        }
                        metadata.seconds = String(seconds);
                        metadata.generateAudio = String(generateAudio);
                    }
                    if (mode === "audio") {
                        if (isGeminiTtsModel(generationConfig.model) && isGeminiConfig(generationConfig, generationConfig.model)) {
                            metadata.geminiTtsVoice = stringValue("voice") || generationConfig.geminiTtsVoice;
                        } else if (isMiniMaxTtsConfig(generationConfig, generationConfig.model)) {
                            metadata.miniMaxTtsVoice = stringValue("voice") || generationConfig.miniMaxTtsVoice;
                            metadata.miniMaxTtsFormat = generationConfig.miniMaxTtsFormat;
                            metadata.miniMaxTtsSpeed = generationConfig.miniMaxTtsSpeed;
                        } else if (isGlmTtsModel(generationConfig.model)) {
                            metadata.glmTtsVoice = stringValue("voice") || generationConfig.glmTtsVoice;
                            metadata.glmTtsFormat = generationConfig.glmTtsFormat;
                            metadata.glmTtsSpeed = generationConfig.glmTtsSpeed;
                        } else if (isGrok2APITtsConfig(generationConfig, generationConfig.model)) {
                            metadata.grokTtsVoice = stringValue("voice") || generationConfig.grokTtsVoice;
                            metadata.grokTtsLanguage = generationConfig.grokTtsLanguage;
                            metadata.grokTtsFormat = generationConfig.grokTtsFormat;
                            metadata.grokTtsSpeed = generationConfig.grokTtsSpeed;
                        } else {
                            metadata.audioVoice = stringValue("voice") || generationConfig.audioVoice;
                            metadata.audioInstructions = stringValue("instructions") || generationConfig.audioInstructions;
                        }
                    }

                    const layoutSourceNodes = mode === "image" ? [] : mode === "video" ? nodesRef.current.filter((node) => !node.metadata?.groupId && (node.type === CanvasNodeType.Text || isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Group)) : sourceNodes;
                    let node = createCanvasNode(targetType, nextNodeCenter(targetType, layoutSourceNodes), metadata);
                    if (mode === "video") node = applyNodeConfigPatch(node, { size: generationConfig.size });
                    node.title = stringValue("title") || prompt.slice(0, 32) || (mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片");
                    const createdConnections = sourceNodeIds.map((sourceNodeId) => ({ id: nanoid(), fromNodeId: sourceNodeId, toNodeId: node.id }));
                    commitNodes([...nodesRef.current, node]);
                    commitConnections([...connectionsRef.current, ...createdConnections]);
                    selectOnly(node.id);

                    if (!resolvedAgentConfig.autoGenerateMedia) {
                        return {
                            ok: true,
                            message: "媒体节点已创建并完成参数配置，尚未提交生成",
                            submitted: false,
                            nodeId: node.id,
                            createdNodeIds: [node.id],
                            connectionIds: createdConnections.map((connection) => connection.id),
                            type: node.type,
                            status: "idle",
                        };
                    }

                    await handleGenerateNode(node.id, mode, prompt);
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    const generatedNode = getNode(node.id) || node;
                    const createdNodeIds = [
                        node.id,
                        ...connectionsRef.current.filter((connection) => connection.fromNodeId === node.id).map((connection) => connection.toNodeId),
                    ].filter((nodeId, index, values) => values.indexOf(nodeId) === index && Boolean(getNode(nodeId)));
                    const task = canvasAgentTaskSummary(generatedNode);
                    if (generatedNode.metadata?.status === NODE_STATUS_ERROR) {
                        return {
                            ok: false,
                            code: "generation_failed",
                            message: generatedNode.metadata.errorDetails || "生成失败",
                            nodeId: node.id,
                            createdNodeIds,
                            connectionIds: createdConnections.map((connection) => connection.id),
                            ...task,
                        };
                    }
                    return {
                        ok: true,
                        submitted: true,
                        nodeId: node.id,
                        createdNodeIds,
                        connectionIds: createdConnections.map((connection) => connection.id),
                        ...task,
                    };
                }

                return { ok: false, code: "unsupported_tool", message: "未实现工具 " + action.name };
            } catch (error) {
                return { ok: false, code: "tool_error", message: error instanceof Error ? error.message : "画布工具执行失败" };
            }
        },
        [agentEffectiveConfig, createGroupFromSelection, currentProject?.title, deleteConnection, deleteNodes, getCanvasCenter, handleGenerateNode, isAiConfigReady, projectId, renameProject, resolvedAgentConfig.autoGenerateMedia, updateProject, selectMany, selectedNodeIdsRef, setSelectedConnectionId],
    );

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const retryWorkflowRef = node.metadata?.workflowRef;
            const batchPrimaryId = retryWorkflowRef && isCanvasImageNodeType(node.type) && node.metadata?.isBatchRoot ? node.metadata.primaryImageId : undefined;
            const retryTargetId = batchPrimaryId && nodesRef.current.some((item) => item.id === batchPrimaryId) ? batchPrimaryId : node.id;
            const retryBatchRootId = isCanvasImageNodeType(node.type) ? (retryTargetId === node.id ? node.metadata?.batchRootId : node.id) : undefined;
            const retryBatchRoot = retryBatchRootId ? nodesRef.current.find((item) => item.id === retryBatchRootId) : null;
            const retryMirrorsRoot = retryBatchRoot?.metadata?.primaryImageId === retryTargetId;
            const isPanorama = isPanoramaNodeType(node.type);
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = isCanvasImageNodeType(node.type) ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                        ...effectiveConfig,
                        model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                        imageChannelId: savedImageMetadata.channelId || effectiveConfig.imageChannelId,
                        activeChannelId: savedImageMetadata.channelId || effectiveConfig.imageChannelId,
                        quality: savedImageMetadata.quality || effectiveConfig.quality,
                        size: isPanorama ? PANORAMA_IMAGE_SIZE : savedImageMetadata.size || effectiveConfig.size,
                        count: "1",
                    }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (retryWorkflowRef && !useUserStore.getState().token) {
                message.error("工作流生成需要先登录");
                return;
            }
            if (!retryWorkflowRef && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (isPanorama ? savedImageMetadata?.panoramaFinalPrompt || "" : savedImageMetadata?.prompt || context?.prompt || "").trim();
            const requestPrompt = isPanorama ? prompt : applyCameraPrompt(prompt, savedImageMetadata?.cameraControl || node.metadata?.cameraControl);
            if (!prompt && !retryWorkflowRef && !(node.type === CanvasNodeType.Video && isAutoDLConfig(generationConfig))) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            const retryImages = retryReferenceImages || [];

            const runningRequest = Symbol();
            runningRequestRef.current = runningRequest;
            setRunningNodeId(node.id);
            const retryStartedAt = Date.now();
            const retrySuffix = nanoid();
            const retryVideoTaskId = node.type === CanvasNodeType.Video ? `client_video_task_${retrySuffix}` : "";
            const retryImageTaskId = isCanvasImageNodeType(node.type) ? `client_image_task_${retrySuffix}` : "";
            const retryAudioTaskId = node.type === CanvasNodeType.Audio ? `client_audio_task_${retrySuffix}` : "";
            const retryClientTaskId = retryVideoTaskId || retryImageTaskId || retryAudioTaskId || (node.type === CanvasNodeType.Text ? `client_text_task_${retrySuffix}` : "");
            setNodes((prev) => prev.map((item) => {
                const isRetryTarget = item.id === retryTargetId;
                if (!isRetryTarget && !(retryMirrorsRoot && item.id === retryBatchRootId)) return item;
                return { ...item, metadata: { ...item.metadata, clientTaskId: isRetryTarget ? retryClientTaskId || undefined : undefined, taskBackend: undefined, status: NODE_STATUS_LOADING, errorDetails: undefined, content: undefined, storageKey: "", progress: 0, startedAt: retryStartedAt, ...(item.type === CanvasNodeType.Video ? { videoTaskId: retryVideoTaskId, videoTaskVideoId: undefined, videoTaskTranslation: undefined } : {}), ...(isCanvasImageNodeType(item.type) ? { imageTaskId: isRetryTarget || retryMirrorsRoot && !retryWorkflowRef ? retryImageTaskId : undefined, imageTaskResultId: undefined } : {}), ...(item.type === CanvasNodeType.Audio ? { audioTaskId: retryAudioTaskId, audioTaskResultId: undefined } : {}) } };
            }));

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const task = await submitNodeTask(node.id, retryClientTaskId, async (signal) => ({ id: retryClientTaskId, status: "completed", text: await requestImageQuestion(generationConfig, buildNodeChatMessages({ ...context, prompt }), (text) => {
                        streamed = text;
                        setNodes((prev) => isNodeTaskActive(node.id, retryClientTaskId) && prev.some((item) => item.id === node.id && item.metadata?.clientTaskId === retryClientTaskId) ? prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)) : prev);
                    }, signal) }));
                    setNodes((prev) => isNodeTaskActive(node.id, retryClientTaskId) && prev.some((item) => item.id === node.id && item.metadata?.clientTaskId === retryClientTaskId) ? prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: task.text || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)) : prev);
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const videoGenerationConfig = retryWorkflowRef ? generationConfig : context ? withCanvasVideoAdvancedConfig(generationConfig, context) : generationConfig;
                    const frameReferencesEnabled = Boolean(retryWorkflowRef) || supportsVideoFrameReferences(videoGenerationConfig.model, channelProtocolForConfig(videoGenerationConfig));
                    const firstFrame = frameReferencesEnabled ? context?.firstFrame || null : null;
                    const lastFrame = frameReferencesEnabled ? context?.lastFrame || null : null;
                    const references = frameReferencesEnabled || isAutoDLConfig(videoGenerationConfig) ? retryImages : [...retryImages, ...[context?.firstFrame, context?.lastFrame].filter((image): image is ReferenceImage => Boolean(image))];
                    const task = await submitNodeTask(node.id, retryVideoTaskId, async (signal, onServerTask) => retryWorkflowRef
                        ? await workflowVideoTask(await submitCanvasWorkflowTask(retryWorkflowRef, videoGenerationConfig, "video", requestPrompt, [firstFrame, ...references, lastFrame].filter((image): image is ReferenceImage => Boolean(image)), context?.referenceVideos || [], context?.referenceAudios || [], node.id, projectId, retryVideoTaskId, () => onServerTask("workflow"), signal))
                        : (await createVideoGenerationTask(videoGenerationConfig, requestPrompt, { references, firstFrame, lastFrame, videoReferences: context?.referenceVideos || [], audioReferences: context?.referenceAudios || [] }, undefined, { signal, onServerTask, clientTaskId: retryVideoTaskId, source: "canvas", sourceId: node.id })).task);
                    if (!isNodeTaskActive(node.id, retryVideoTaskId)) return;
                    setNodes((prev) => applyCanvasVideoTaskUpdate(prev, node.id, task, videoGenerationConfig, retryStartedAt, { width: node.width, height: node.height }, retryVideoTaskId));
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const workflowAudios = retryWorkflowRef ? context?.referenceAudios || [] : [];
                    const referenceAudio = retryWorkflowRef ? undefined : selectAudioReference(generationConfig, sourceNode?.metadata, context?.referenceAudios || []);
                    const task = await submitNodeTask(node.id, retryAudioTaskId, async (signal, onServerTask) => retryWorkflowRef
                        ? await workflowAudioTask(await submitCanvasWorkflowTask(retryWorkflowRef, generationConfig, "audio", prompt, [], [], workflowAudios, node.id, projectId, retryAudioTaskId, () => onServerTask("workflow"), signal))
                        : await createCanvasAudioTask(generationConfig, prompt, { signal, onServerTask, nodeId: node.id, sourceId: projectId, clientTaskId: retryAudioTaskId }, referenceAudio));
                    if (!isNodeTaskActive(node.id, retryAudioTaskId)) return;
                    setNodes((prev) => applyCanvasAudioTaskUpdate(prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, prompt, ...buildAudioGenerationMetadata(generationConfig, sourceNode?.metadata) } } : item)), node.id, task, retryStartedAt, retryAudioTaskId));
                    return;
                }

                const task = await submitNodeTask(retryTargetId, retryImageTaskId, async (signal, onServerTask) => retryWorkflowRef
                    ? await workflowImageTask(await submitCanvasWorkflowTask(retryWorkflowRef, generationConfig, "image", requestPrompt, useReferenceImages ? retryImages : [], [], [], retryTargetId, projectId, retryImageTaskId, () => onServerTask("workflow"), signal))
                    : await createCanvasImageTask({ ...generationConfig, quality: isPanorama && generationConfig.quality === "auto" ? "medium" : generationConfig.quality }, requestPrompt, useReferenceImages ? retryImages : [], { signal, onServerTask, nodeId: node.id, sourceId: projectId, clientTaskId: retryImageTaskId }));
                if (!isNodeTaskActive(retryTargetId, retryImageTaskId)) return;
                const generationMetadata = savedImageMetadata?.generationType
                    ? { generationType: savedImageMetadata.generationType, model: generationConfig.model, channelId: generationConfig.imageChannelId || generationConfig.activeChannelId, size: generationConfig.size, quality: generationConfig.quality, count: savedImageMetadata.count || 1, references: savedImageMetadata.references }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                setNodes((prev) => {
                    if (!isNodeTaskActive(retryTargetId, retryImageTaskId)) return prev;
                    let next = prev.map((item) =>
                        item.id === retryTargetId
                            ? {
                                ...item,
                                type: isPanoramaNodeType(item.type) ? CanvasNodeType.Panorama : CanvasNodeType.Image,
                                metadata: {
                                    ...item.metadata,
                                    ...(isPanoramaNodeType(item.type) ? { prompt: item.metadata?.panoramaSourcePrompt || item.metadata?.prompt || "", panoramaSourcePrompt: item.metadata?.panoramaSourcePrompt || item.metadata?.prompt || "", panoramaFinalPrompt: prompt, panoramaProjection: undefined } : { prompt }),
                                    ...generationMetadata,
                                    imageTaskId: task.id,
                                    imageTaskResultId: undefined,
                                    startedAt: parseCanvasTaskTime(task.started_at ?? task.startedAt ?? task.created_at ?? task.createdAt) || retryStartedAt,
                                    progress: task.progress || 0,
                                    errorDetails: undefined,
                                },
                            }
                            : item,
                    );
                    if (task.source === "workflow" || task.image_url || task.url) next = applyCanvasImageTaskUpdate(next, retryTargetId, task, retryStartedAt, { width: node.width, height: node.height }, retryImageTaskId);
                    if (retryMirrorsRoot && retryBatchRootId && task.source !== "workflow" && (task.image_url || task.url)) next = applyCanvasImageTaskUpdate(next, retryBatchRootId, task, retryStartedAt, { width: node.width, height: node.height });
                    return next;
                });
                if (task.source === "workflow" || task.image_url || task.url) setConnections((prev) => isNodeTaskActive(retryTargetId, retryImageTaskId) ? applyCanvasImageTaskConnections(prev, retryTargetId, task, retryBatchRootId) : prev);
            } catch (error) {
                if (retryClientTaskId && !isNodeTaskActive(retryTargetId, retryClientTaskId)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                if (retryWorkflowRef && isCanvasImageNodeType(node.type)) {
                    const failedTask: CanvasImageTask = { id: retryImageTaskId, source: "workflow", status: "failed", error: { message: errorDetails } };
                    setNodes((prev) => applyCanvasImageTaskUpdate(prev, retryTargetId, failedTask, retryStartedAt, { width: node.width, height: node.height }, retryImageTaskId));
                    setConnections((prev) => isNodeTaskActive(retryTargetId, retryImageTaskId) ? applyCanvasImageTaskConnections(prev, retryTargetId, failedTask, retryBatchRootId) : prev);
                } else {
                    setNodes((prev) => node.type !== CanvasNodeType.Text || (isNodeTaskActive(node.id, retryClientTaskId) && prev.some((item) => item.id === node.id && item.metadata?.clientTaskId === retryClientTaskId)) ? prev.map((item) => (item.id === retryTargetId || (retryMirrorsRoot && item.id === retryBatchRootId) ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)) : prev);
                }
            } finally {
                if (runningRequestRef.current === runningRequest) setRunningNodeId(null);
            }
        },
        [effectiveConfig, message, openConfigDialog, projectId, isNodeTaskActive, submitNodeTask, isAiConfigReady, runningRequestRef, setRunningNodeId],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            selectOnly(configNode.id);
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, selectOnly, setSelectedConnectionId],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage, position?: Position, nodeId?: string) => {
            const storedImage = { url: image.dataUrl || await resolveImageUrl(image.storageKey), storageKey: image.storageKey || "", width: 1, height: 1, bytes: 0, mimeType: "image/png" };
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = nodeId || `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            selectOnly(id);
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width, selectOnly, setSelectedConnectionId],
    );

    useLayoutEffect(() => {
        insertAssetAtRef.current = insertAssetAt;
    });

    useEffect(() => {
        if (!projectLoaded || consumedAgentRequestProjectRef.current === projectId) return;
        const request = useCanvasStore.getState().projects.find((project) => project.id === projectId)?.pendingAgentRequest;
        if (!request) return;
        consumedAgentRequestProjectRef.current = projectId;

        void (async () => {
            const center = getCanvasCenter();
            const references: CanvasAssistantReference[] = [];
            for (const [index, asset] of request.assets.entries()) {
                let payload = asset.payload;
                if (payload.kind === "image" && payload.storageKey) {
                    const dataUrl = await resolveImageUrl(payload.storageKey, payload.dataUrl);
                    payload = { ...payload, dataUrl };
                } else if ((payload.kind === "video" || payload.kind === "audio") && payload.storageKey) {
                    const url = await resolveMediaUrl(payload.storageKey, payload.url);
                    payload = { ...payload, url };
                }
                const position = { x: center.x + (index - (request.assets.length - 1) / 2) * 360, y: center.y };
                await insertAssetAtRef.current(payload, position, asset.nodeId);
                references.push(
                    payload.kind === "image"
                        ? { ...asset.reference, dataUrl: payload.dataUrl }
                        : payload.kind === "video" || payload.kind === "audio"
                            ? { ...asset.reference, url: payload.url }
                            : asset.reference,
                );
            }
            updateProject(projectId, { pendingAgentRequest: undefined });
            setInitialAgentRequest({ prompt: request.prompt, references, skills: request.skills });
        })().catch((error) => {
            consumedAgentRequestProjectRef.current = null;
            message.error(error instanceof Error ? error.message : "首页素材插入失败");
        });
    }, [getCanvasCenter, message, projectId, projectLoaded, updateProject]);
    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            const position = assetInsertPositionRef.current || undefined;
            assetInsertPositionRef.current = null;
            void insertAssetAtRef.current(payload, position);
            setAssetPickerOpen(false);
            if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                setSidePanel((current) => ({ ...current, open: false }));
            }
        },
        [],
    );

    const focusNode = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (!node) return;
            const rootId = node.metadata?.batchRootId;
            if (rootId && !nodesRef.current.find((item) => item.id === rootId)?.metadata?.imageBatchExpanded) {
                toggleBatchExpanded(rootId);
            }
            selectOnly(node.id);
            setSelectedConnectionId(null);
            fitNodesToView([node]);
        },
        [fitNodesToView, toggleBatchExpanded, selectOnly, setSelectedConnectionId],
    );

    useEffect(() => () => {
        if (focusAnimationRef.current) cancelAnimationFrame(focusAnimationRef.current);
    }, [focusAnimationRef]);

    if (!projectLoaded) return <CanvasRefreshShell />;
    return (
        <main
            className="flex h-full min-h-0 overflow-hidden"
            style={{ background: theme.canvas.background, color: theme.node.text }}
            onPointerDownCapture={(event) => {
                const panel = document.querySelector("[data-canvas-agent-panel]");
                const selection = window.getSelection();
                if (selection?.toString() && panel?.contains(selection.anchorNode) && !panel.contains(event.target as Node)) selection.removeAllRanges();
            }}
        >
            <CanvasSidePanel
                nodes={nodes}
                selectedNodeIds={selectedNodeIds}
                open={sidePanel.open}
                width={sidePanel.width}
                onWidthChange={(width) => setSidePanel((current) => ({ ...current, width }))}
                onFocusNode={focusNode}
                onAssetDragStart={(payload) => {
                    draggedAssetPayloadRef.current = payload;
                }}
                onAssetDragEnd={() => {
                    window.setTimeout(() => {
                        draggedAssetPayloadRef.current = null;
                    }, 0);
                }}
                onInsertAsset={handleAssetInsert}
                onClose={() => setSidePanel((current) => ({ ...current, open: false }))}
            />
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    sidePanelOpen={sidePanel.open}
                    onToggleSidePanel={() => {
                        const nextOpen = !sidePanel.open;
                        setSidePanel((current) => ({ ...current, open: nextOpen }));
                        if (nextOpen && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                            setAssistantMounted(false);
                            setAgentPanel((current) => ({ ...current, open: false }));
                        }
                    }}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onHome={() => router.push("/")}
                    onProjects={() => router.push("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    onClear={() => setClearConfirmOpen(true)}
                    onImportImage={() => handleUploadRequest()}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    assistantCollapsed={!agentPanel.open}
                    onExpandAssistant={() => {
                        if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                            setSidePanel((current) => ({ ...current, open: false }));
                        }
                        setAssistantMounted(true);
                        setAgentPanel((current) => ({ ...current, open: true }));
                    }}
                />

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    tool={canvasTool}
                    backgroundMode={backgroundMode}
                    alignmentGuides={alignmentGuides}
                    onViewportChange={(next) => {
                        if (focusAnimationRef.current) cancelAnimationFrame(focusAnimationRef.current);
                        focusAnimationRef.current = null;
                        viewportRef.current = next;
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onCanvasMouseDown={(event) => {
                        if (!referencePickerNodeId) handleCanvasMouseDown(event);
                    }}
                    onCanvasDeselect={referencePickerNodeId ? undefined : deselectCanvas}
                    onCanvasDoubleClick={(event) => {
                        if (referencePickerNodeId) return;
                        setContextMenu(null);
                        setNodeCreatePosition(screenToCanvas(event.clientX, event.clientY));
                    }}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 6 }}>
                        {connections
                            .filter((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                return Boolean(from && to && !isHiddenBatchConnectionEndpoint(from, nodes) && !isHiddenBatchConnectionEndpoint(to, nodes));
                            })
                            .map((connection) => {
                                const from = nodeById.get(connection.fromNodeId);
                                const to = nodeById.get(connection.toNodeId);
                                if (!from || !to) return null;

                                return (
                                    <ConnectionPath
                                        key={connection.id}
                                        connection={connection}
                                        from={from}
                                        to={to}
                                        active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                                        onSelect={() => {
                                            setSelectedConnectionId(connection.id);
                                            clearSelection();
                                            setToolbarNodeId(null);
                                            setContextMenu(null);
                                        }}
                                        onContextMenu={(event) => {
                                            setSelectedConnectionId(connection.id);
                                            clearSelection();
                                            setToolbarNodeId(null);
                                            setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
                                        }}
                                    />
                                );
                            })}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            referenceSelectionState={!referencePickerNodeId ? undefined : node.id === referencePickerNodeId ? "target" : referenceConnectedNodeIds.has(node.id) || !isCanvasReferenceNode(node) ? "disabled" : "available"}
                            showPanel={dialogNodeId === node.id && !selectionBox}
                            batchCount={batchChildCountById.get(node.id) || 0}
                            groupChildCount={groupChildCountById.get(node.id) || 0}
                            isGroupDropTarget={dropTargetGroupId === node.id}
                            batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
                            batchClosing={Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId))}
                            batchOpening={openingBatchIds.has(node.id)}
                            batchRecovering={collapsingBatchIds.has(node.id)}
                            batchMotion={batchMotionById.get(node.id)}
                            showImageInfo={showImageInfo}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || []}
                            now={node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content && (node.type === CanvasNodeType.Video || isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Audio) ? canvasNow : undefined}
                            renderPanel={(panelNode) =>
                                panelNode.type === CanvasNodeType.Config ? (
                                    <CanvasConfigComposer
                                        value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                                        inputs={configInputsById.get(panelNode.id) || []}
                                        onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                                        onClose={() => setDialogNodeId(null)}
                                    />
                                ) : panelNode.type === CanvasNodeType.Director ? null : (
                                    <CanvasNodePromptPanel
                                        node={panelNode}
                                        isRunning={runningNodeId === panelNode.id}
                                        mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || []}
                                        connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                                        videoFrameOptions={videoFrameOptionsByNodeId.get(panelNode.id) || []}
                                        videoResourceOptions={videoResourceOptionsByNodeId.get(panelNode.id) || []}
                                        onPromptChange={handleNodePromptChange}
                                        onConfigChange={handleConfigNodeChange}
                                        onGenerate={(nodeId, mode, prompt) => {
                                            if (panelNode.metadata?.status === "stopped" && !prompt.trim()) void handleRetryNode(panelNode);
                                            else void handleGenerateNode(nodeId, mode, prompt);
                                        }}
                                        onStop={handleStopNode}
                                        onDisconnectReference={disconnectNodeReference}
                                        onStartReferenceSelection={startNodeReferenceSelection}
                                        onImageSettingsOpenChange={(open) => {
                                            setNodeImageSettingsOpen(open);
                                            if (open) setToolbarNodeId(null);
                                        }}
                                    />
                                )
                            }
                            renderNodeContent={(contentNode) =>
                                contentNode.type === CanvasNodeType.Director ? (
                                    <CanvasDirectorNodePanel onOpen={() => setOpenDirectorNodeId(contentNode.id)} />
                                ) : (
                                    <CanvasConfigNodePanel
                                        node={contentNode}
                                        isRunning={runningNodeId === contentNode.id}
                                        inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                                        videoFrameOptions={videoFrameOptionsByNodeId.get(contentNode.id) || []}
                                        videoResourceOptions={videoResourceOptionsByNodeId.get(contentNode.id) || []}
                                        onConfigChange={handleConfigNodeChange}
                                        onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                                        onGenerate={(nodeId) => {
                                            const target = nodesRef.current.find((item) => item.id === nodeId);
                                            void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                                        }}
                                    />
                                )
                            }
                            onMouseDown={handleNodeMouseDown}
                            onHoverStart={(nodeId) => {
                                if (nodeDraggingRef.current) return;
                                setHoveredNodeId(nodeId);
                            }}
                            onHoverEnd={(nodeId) => {
                                setHoveredNodeId((current) => (current === nodeId ? null : current));
                            }}
                            onConnectStart={handleConnectStart}
                            onResize={handleNodeResize}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onRetry={(node) => void handleRetryNode(node)}
                            onViewImage={(node) => setPreviewNodeId(node.id)}
                            onSelectReference={selectNodeReference}
                            onContextMenu={(event, id) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
                            }}
                        />
                    ))}

                    {selectionBox ? (
                        <svg
                            className="pointer-events-none absolute z-[100] overflow-visible"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                            }}
                        >
                            <rect width="100%" height="100%" fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeWidth={1.5 / viewport.k} strokeDasharray={`${10 / viewport.k} ${6 / viewport.k}`} />
                        </svg>
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                    {nodeCreatePosition ? (
                        <NodeCreateMenu
                            position={nodeCreatePosition}
                            onCreate={(type) => {
                                createNode(type, nodeCreatePosition);
                                setNodeCreatePosition(null);
                            }}
                            onUpload={() => {
                                handleUploadRequest(undefined, nodeCreatePosition);
                                setNodeCreatePosition(null);
                            }}
                            onOpenAssetLibrary={() => {
                                assetInsertPositionRef.current = nodeCreatePosition;
                                setNodeCreatePosition(null);
                                setAssetPickerTab("library");
                                setAssetPickerOpen(true);
                            }}
                            onClose={() => setNodeCreatePosition(null)}
                        />
                    ) : null}
                </InfiniteCanvas>

                {projectLoaded && !nodes.length && !nodeCreatePosition ? (
                    <div className="pointer-events-none absolute inset-0 z-[20] flex items-center justify-center px-6">
                        <div className="enter-up relative flex max-w-md flex-col items-center text-center">
                            <span aria-hidden className="hazard-tape absolute -top-7 left-1/2 h-2 w-24 -translate-x-1/2 rounded-[2px]" />
                            <span aria-hidden className="punk-signal mb-5" />
                            <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground/55 uppercase">Blank Canvas / 000</p>
                            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[28px]">双击任意位置，开始第一笔</h2>
                            <p className="mt-3 max-w-md text-balance text-sm leading-7 text-muted-foreground">图片、视频、文本与素材都可以成为节点，连起来就是一条创作链。</p>
                            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                                {["双击创建", "拖入素材", "@ 引用"].map((hint) => (
                                    <span key={hint} className="chip">{hint}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}

                {referencePickerNodeId ? <button type="button" className="absolute left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} onClick={exitNodeReferenceSelection}>从画布选择参考 · ESC 返回输入框</button> : null}

                {openDirectorNode?.type === CanvasNodeType.Director ? (
                    <CanvasDirector
                        nodeId={openDirectorNode.id}
                        project={openDirectorNode.metadata?.directorProject}
                        panoramas={directorPanoramasByNodeId.get(openDirectorNode.id) || []}
                        theme={colorTheme}
                        onClose={() => setOpenDirectorNodeId(null)}
                        onProjectChange={handleDirectorProjectChange}
                        onPanoramaRemoved={handleDirectorPanoramaRemoved}
                        onCapturesSent={handleDirectorCapturesSent}
                        onVideoSent={handleDirectorVideoSent}
                    />
                ) : null}

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                    viewport={viewport}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onExtractAudio={(node) => void extractAudio(node)}
                    onTrimAudio={(node) => setAudioTrimNodeId(node.id)}
                    onDownload={downloadNodeImage}
                    onSaveAsset={(node) => void saveNodeAsset(node)}
                    onUploadMediaToCloud={(node) => void uploadNodeMediaToCloud(node)}
                    onUploadImageToCloud={(node) => void uploadNodeImageToCloud(node)}
                    onMaskEdit={(node) => {
                        const nodeConfig = buildGenerationConfig(effectiveConfig, node, "image");
                        setMaskEditModel(nodeConfig.model);
                        setMaskEditChannelId(nodeConfig.imageChannelId || nodeConfig.activeChannelId || "");
                        setMaskEditNodeId(node.id);
                    }}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onSplit={(node) => setSplitNodeId(node.id)}
                    onUpscale={(node) => setUpscaleNodeId(node.id)}
                    onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={(node) => setPreviewNodeId(node.id)}
                    onReversePrompt={createImageReversePromptNodes}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                />

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canvasTool={canvasTool}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddPanorama={() => createNode(CanvasNodeType.Panorama)}
                    onAddDirector={() => createNode(CanvasNodeType.Director)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onDuplicate={duplicateSelectedNodes}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onCanvasToolChange={setCanvasTool}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                    onOpenAssetLibrary={() => {
                        setAssetPickerTab("library");
                        setAssetPickerOpen(true);
                    }}
                    onOpenMyAssets={() => {
                        setAssetPickerTab("my-assets");
                        setAssetPickerOpen(true);
                    }}
                    sidePanelWidth={sidePanel.open ? sidePanel.width : 0}
                />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onFitAll={fitAllNodes} onFitSelected={fitSelectedNodes} hasSelection={selectedNodeIds.size > 0} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} onOpenShortcuts={() => setShortcutsOpen(true)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        canCaptureVideoFrame={contextMenuNode?.type === CanvasNodeType.Video && Boolean(contextMenuNode.metadata?.content)}
                        onClose={() => setContextMenu(null)}
                        onCaptureVideoFrame={(position) => {
                            if (contextMenu.type !== "node") return;
                            void captureVideoNodeFrame(contextMenu.nodeId, position);
                        }}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                {pendingPanoramaImport ? (
                    <div
                        className="fixed left-1/2 top-1/2 z-[130] w-56 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border shadow-xl backdrop-blur"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="flex h-10 w-full items-center px-3 text-left text-sm transition-colors"
                            style={{ color: theme.toolbar.item }}
                            onClick={() => finishPanoramaImport(CanvasNodeType.Panorama)}
                            onMouseEnter={(event) => { event.currentTarget.style.background = theme.toolbar.itemHover; }}
                            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                        >
                            作为全景图导入
                        </button>
                        <div className="h-px" style={{ background: theme.toolbar.border }} />
                        <button
                            type="button"
                            className="flex h-10 w-full items-center px-3 text-left text-sm transition-colors"
                            style={{ color: theme.toolbar.item }}
                            onClick={() => finishPanoramaImport(CanvasNodeType.Image)}
                            onMouseEnter={(event) => { event.currentTarget.style.background = theme.toolbar.itemHover; }}
                            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                        >
                            作为普通图片导入
                        </button>
                    </div>
                ) : null}
                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />

                <Modal
                    title="截取音频"
                    open={Boolean(audioTrimNode)}
                    centered
                    width={360}
                    confirmLoading={trimmingAudio}
                    closable={!trimmingAudio}
                    okText="确认截取"
                    cancelText="取消"
                    okButtonProps={{ disabled: audioTrimTooShort }}
                    cancelButtonProps={{ disabled: trimmingAudio }}
                    onCancel={() => {
                        if (!trimmingAudio) setAudioTrimNodeId(null);
                    }}
                    onOk={async () => {
                        if (!audioTrimNode || audioTrimTooShort) return;

                        audioTrimRef.current?.pause();
                        const id = await extractAudio(audioTrimNode, {
                            start: audioTrimStart,
                            end: audioTrimEnd,
                        });
                        if (id) setAudioTrimNodeId(null);
                    }}
                    modalRender={(content) => <div className="select-none" data-canvas-no-zoom>{content}</div>}
                >
                    <div className="space-y-4 py-2">
                        <Slider
                            {...{ allowCross: false, pushable: 0.5 }}
                            range={{ draggableTrack: true }}
                            min={0}
                            max={audioTrimDuration || 1}
                            step={0.01}
                            value={[audioTrimStart, audioTrimEnd]}
                            disabled={trimmingAudio || audioTrimDuration < 0.5}
                            ariaLabelForHandle={["截取开始时间", "截取结束时间"]}
                            tooltip={{ formatter: (value) => `${(value ?? 0).toFixed(2)} 秒` }}
                            onChange={(value: number | number[]) => {
                                if (!Array.isArray(value)) return;
                                const [start, end] = value;
                                if (Math.round((end - start) * 100) < 50) return;
                                audioTrimRef.current?.pause();
                                if (audioTrimRef.current) audioTrimRef.current.currentTime = start;
                                setAudioTrimStart(start);
                                setAudioTrimEnd(end);
                            }}
                        />

                        <div className="flex justify-between text-xs tabular-nums opacity-60">
                            <span>{audioTrimStart.toFixed(2)} 秒</span>
                            <span>选中 {(audioTrimEnd - audioTrimStart).toFixed(2)} 秒</span>
                            <span>{audioTrimEnd.toFixed(2)} 秒</span>
                        </div>

                        <div className="flex justify-center">
                            <Button
                                type="text"
                                shape="circle"
                                aria-label={audioTrimPlaying ? "暂停" : "播放"}
                                disabled={trimmingAudio || audioTrimTooShort}
                                icon={audioTrimPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                                onClick={() => {
                                    const audio = audioTrimRef.current;
                                    if (!audio) return;

                                    if (!audio.paused) {
                                        audio.pause();
                                        return;
                                    }

                                    if (audio.currentTime < audioTrimStart || audio.currentTime >= audioTrimEnd) {
                                        audio.currentTime = audioTrimStart;
                                    }

                                    void audio.play().catch((error) => {
                                        if (error.name !== "AbortError") message.error("音频试听失败");
                                    });
                                }}
                            />
                        </div>
                    </div>
                </Modal>

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => cropImageNode(cropNode!, crop)} /> : null}

                {maskEditNode?.metadata?.content && maskEditConfig ? (
                    <CanvasNodeMaskEditDialog
                        dataUrl={maskEditNode.metadata.content}
                        open={Boolean(maskEditNode)}
                        config={{ ...maskEditConfig, model: currentMaskEditModel, imageChannelId: currentMaskEditChannelId }}
                        model={currentMaskEditModel}
                        channelId={currentMaskEditChannelId}
                        onModelChange={(model, channelId) => {
                            setMaskEditModel(model);
                            setMaskEditChannelId(channelId || "");
                        }}
                        onMissingConfig={() => openConfigDialog(true)}
                        onClose={() => {
                            setMaskEditNodeId(null);
                            setMaskEditModel("");
                            setMaskEditChannelId("");
                        }}
                        onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)}
                    />
                ) : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => splitImageNode(splitNode!, params)} /> : null}

                {upscaleNode?.metadata?.content ? <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} /> : null}

                <Modal title="AI 超分" open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={() => setSuperResolveNodeId(null)}>
                    <div className="py-8 text-center text-base font-medium">暂未实现</div>
                </Modal>

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                {previewNode?.metadata?.content ? (() => {
                    const group = getBatchGroupNodes(previewNode);
                    const isRoot = previewNode.metadata?.isBatchRoot;
                    const activeItemNode = isRoot
                        ? (group.find((n) => n.id === previewNode.metadata?.primaryImageId) || group[0] || previewNode)
                        : previewNode;
                    const currentIndex = group.findIndex((n) => n.id === activeItemNode.id);
                    return (
                        <FullscreenPreview
                            src={activeItemNode.metadata?.content || ""}
                            alt={activeItemNode.title || "图片"}
                            isVideo={activeItemNode.type === CanvasNodeType.Video}
                            isPanorama={activeItemNode.type === CanvasNodeType.Panorama}
                            proxyGeneratedPanorama={activeItemNode.type === CanvasNodeType.Panorama && Boolean(activeItemNode.metadata?.imageTaskId || activeItemNode.metadata?.imageTaskResultId) && !activeItemNode.metadata?.storageKey}
                            onDownload={() => downloadNodeImage(activeItemNode)}
                            onClose={() => setPreviewNodeId(null)}
                            hasPrev={currentIndex > 0}
                            hasNext={currentIndex < group.length - 1}
                            onPrev={() => setPreviewNodeId(group[currentIndex - 1].id)}
                            onNext={() => setPreviewNodeId(group[currentIndex + 1].id)}
                        />
                    );
                })() : null}

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                <AssetPickerModal open={assetPickerOpen} defaultTab={assetPickerTab} onInsert={handleAssetInsert} onClose={() => { assetInsertPositionRef.current = null; setAssetPickerOpen(false); }} />
            </section>
            {assistantMounted ? (
                <CanvasAssistantPanel
                    canvasId={projectId}
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    referenceNodeClick={agentReferenceNodeClick}
                    sessions={chatSessions}
                    activeSessionId={activeChatId}
                    agentConfig={resolvedAgentConfig}
                    width={agentPanel.width}
                    onWidthChange={(width) => setAgentPanel((current) => ({ ...current, width }))}
                    onFocusNode={focusNode}
                    onSessionsChange={handleAssistantSessionsChange}
                    onAgentConfigChange={handleAgentConfigChange}
                    onPasteImage={pasteAssistantImage}
                    onOpenUpload={() => handleUploadRequest()}
                    onOpenAssets={() => {
                        assetInsertPositionRef.current = null;
                        setAssetPickerTab("my-assets");
                        setAssetPickerOpen(true);
                    }}
                    getAgentContext={getCanvasAgentContext}
                    onExecuteAction={executeCanvasAgentAction}
                    onCollapseStart={() =>
                        setAgentPanel((current) => ({ ...current, open: false }))
                    }
                    onCollapse={() => setAssistantMounted(false)}
                    initialRequest={initialAgentRequest}
                    onInitialRequestConsumed={() => setInitialAgentRequest(null)}
                />
            ) : null}
        </main>
    );
}

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveMediaUrl(node.metadata.storageKey, content) } };
            if (!isCanvasImageNodeType(node.type) || (!content && !node.metadata?.storageKey)) return node;
            if (node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveImageUrl(node.metadata.storageKey, content) } };
            if (!content || !content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content, { localOnly: true })) } };
        }),
    );
}
