"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { saveAs } from "file-saver";
import { deleteCanvasProjects } from "@/services/api/canvas-tasks";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { collectImageStorageKeys, deleteImagePreviews, deleteStoredImages, deleteUnusedImagePreviews, ensureImagePreview, resolveImageUrl, uploadImage, uploadRemoteImageToServer } from "@/services/image-storage";
import { resolveMediaUrl, uploadMediaFile, uploadRemoteMediaToServer } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { fitNodeSize } from "../utils/canvas-node-size";
import { captureVideoFrame, type VideoFramePosition } from "../utils/canvas-video-frame";
import { isCanvasImageNodeType } from "../utils/canvas-panorama";
import { GROUP_PADDING, getNodeBounds } from "../utils/canvas-group";
import { App } from "antd";
import { NODE_DEFAULT_SIZE } from "../constants";
import { canvasTaskMediaURL } from "./lib/canvas-task-helpers";
import { NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "./lib/canvas-node-constants";
import { fitCanvasMediaNode, resetInterruptedGeneration } from "./lib/canvas-task-updates";
import { normalizeConnection } from "./lib/canvas-connections";
import { applyNodeConfigPatch, audioExtension, buildImportedVideoNode, getGenerationCount, getNextDirectorOutputY, imageExtension, imageMetadata } from "./lib/canvas-node-builders";
import { buildGenerationConfig } from "./lib/canvas-generation-config";
import { cloneCanvasNodes } from "./lib/canvas-clone";
import { createCanvasNode } from "./lib/canvas-node-factory";
import { collectPublishInputs } from "./lib/canvas-publish";
import { syncAssistantReferences } from "./lib/canvas-assistant-references";
import { isAudioFile, isHiddenBatchChild } from "./lib/canvas-graph";
import { useCanvasViewport } from "./hooks/use-canvas-viewport";
import { useCanvasSelection } from "./hooks/use-canvas-selection";
import type { CanvasNodeTaskRun } from "./hooks/use-canvas-tasks";
import { useCanvasTaskSystem } from "./hooks/use-canvas-task-system";
import { useCanvasHistory } from "./hooks/use-canvas-history";
import { useCanvasClipboard } from "./hooks/use-canvas-clipboard";
import { useCanvasPointer } from "./hooks/use-canvas-pointer";
import { useCanvasGeneration } from "./hooks/use-canvas-generation";
import { useCanvasBatchGeneration } from "./hooks/use-canvas-batch-generation";
import { useCanvasRemix } from "./hooks/use-canvas-remix";
import { collectBatchTargetNodeIds } from "./lib/canvas-batch";
import { planSourcePublishNode } from "./lib/canvas-publish";
import { collectPublishableRemixImages, collectRemixImageNodeIds, findRemixRunNode, findSourceRemixTextNode, hasSourceRemixText } from "./lib/canvas-source-remix";
import { useCanvasAgentExecutor } from "./hooks/use-canvas-agent-executor";
import { useCanvasUiState } from "./hooks/use-canvas-ui-state";
import { useCanvasFileImport } from "./hooks/use-canvas-file-import";
import { useCanvasSource } from "./hooks/use-canvas-source";
import { CanvasWorkspace, type CanvasWorkspaceModel } from "./components/canvas-workspace";
import { buildNodeGenerationInputs, type NodeGenerationInput } from "../components/canvas-node-generation";
import { type CanvasVideoFrameOption } from "../components/canvas-node-prompt-panel";
import type { CanvasVideoResourceOption } from "../components/canvas-video-settings-popover";
import { type CanvasAlignKind } from "../components/canvas-toolbar";
import { CanvasRefreshShell } from "./components/canvas-refresh-shell";
import { CANVAS_ASSET_DRAG_TYPE } from "../components/canvas-side-panel";
import { DEFAULT_CANVAS_AGENT_PANEL, DEFAULT_CANVAS_SIDE_PANEL, useCanvasStore } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { buildNodeMentionReferences, isCanvasReferenceNode } from "../utils/canvas-resource-references";
import { CanvasNodeType, type CanvasAgentConfig, type CanvasAssistantImage, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasConnection, type PendingConnectionCreate, type CanvasDirectorCapture, type CanvasDirectorPanorama, type CanvasDirectorVideo, type CanvasNodeData, type CanvasPendingAgentRequest, type ConnectionHandle, type InsertAssetPayload, type Position } from "../types";
import { errorMessage as toErrorMessage } from "@/lib/utils";

export type CanvasOverlay =
    | { kind: "prompt"; nodeId: string }
    | { kind: "director"; nodeId: string }
    | { kind: "info"; nodeId: string }
    | { kind: "crop"; nodeId: string }
    | { kind: "audioTrim"; nodeId: string }
    | { kind: "maskEdit"; nodeId: string }
    | { kind: "split"; nodeId: string }
    | { kind: "upscale"; nodeId: string }
    | { kind: "angle"; nodeId: string }
    | { kind: "preview"; nodeId: string }
    | { kind: "referencePicker"; nodeId: string };

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
    const assetInsertPositionRef = useRef<Position | null>(null);
    const draggedAssetPayloadRef = useRef<InsertAssetPayload | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sidePanelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didInitialCenterRef = useRef(false);
    const uploadingMediaNodeIdsRef = useRef(new Set<string>());
    const uploadingImageNodeIdsRef = useRef(new Set<string>());

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
    const {
        contextMenu,
        setContextMenu,
        nodeCreatePosition,
        setNodeCreatePosition,
        pendingPanoramaImport,
        setPendingPanoramaImport,
        clearConfirmOpen,
        setClearConfirmOpen,
        deleteProjectConfirmOpen,
        setDeleteProjectConfirmOpen,
        assetPickerOpen,
        setAssetPickerOpen,
        assetPickerTab,
        setAssetPickerTab,
        isMiniMapOpen,
        setIsMiniMapOpen,
    } = useCanvasUiState();
    const closeContextMenu = useCallback(() => setContextMenu(null), [setContextMenu]);
    const { viewport, setViewport, viewportRef, focusAnimationRef, screenToCanvas, fitNodesToView, setZoomScale } = useCanvasViewport({ containerRef, size, onBeforeChange: closeContextMenu });
    const setShortcutsOpen = useCanvasUiStore((state) => state.setShortcutsOpen);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [sidePanel, setSidePanel] = useState(() => DEFAULT_CANVAS_SIDE_PANEL);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [activeOverlay, setActiveOverlay] = useState<CanvasOverlay | null>(null);
    const dialogNodeId = activeOverlay?.kind === "prompt" ? activeOverlay.nodeId : null;
    const referencePickerNodeId = activeOverlay?.kind === "referencePicker" ? activeOverlay.nodeId : null;
    const directorNodeId = activeOverlay?.kind === "director" ? activeOverlay.nodeId : null;
    const openOverlay = useCallback((overlay: CanvasOverlay) => setActiveOverlay(overlay), []);
    const closeOverlay = useCallback(() => setActiveOverlay(null), []);
    const togglePromptOverlay = useCallback((nodeId: string) => setActiveOverlay((current) => current?.kind === "prompt" && current.nodeId === nodeId ? null : { kind: "prompt", nodeId }), []);
    const [audioTrimStart, setAudioTrimStart] = useState(0);
    const [audioTrimEnd, setAudioTrimEnd] = useState(0);
    const [audioTrimDuration, setAudioTrimDuration] = useState(0);
    const [audioTrimPlaying, setAudioTrimPlaying] = useState(false);
    const [trimmingAudio, setTrimmingAudio] = useState(false);
    const audioTrimRef = useRef<HTMLAudioElement | null>(null);
    const [maskEditModel, setMaskEditModel] = useState("");
    const [maskEditChannelId, setMaskEditChannelId] = useState("");
    const [agentPanel, setAgentPanel] = useState(DEFAULT_CANVAS_AGENT_PANEL);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [canvasNow, setCanvasNow] = useState(Date.now());
    const resolvedAgentConfig = useMemo<CanvasAgentConfig>(
        () => {
            const defaults = { textApiMode: "chat" as const, autoGenerateMedia: false, confirmMediaGeneration: true };
            return agentConfig ? { ...defaults, ...agentConfig } : {
                textApiMode: "chat",
                autoGenerateMedia: false,
                confirmMediaGeneration: true,
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
    const hasLoadingTimedNodes = nodes.some((node) => node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content && (node.type === CanvasNodeType.Video || isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Audio));
    const nodeTaskRunsRef = useRef(new Map<string, CanvasNodeTaskRun>());

    const handleHistoryApplied = useCallback(() => {
        clearSelection();
        setSelectedConnectionId(null);
        setContextMenu(null);
        setActiveOverlay((current) => (current?.kind === "referencePicker" ? null : current));
    }, [clearSelection, setSelectedConnectionId, setContextMenu]);

    const { historyRef, lastHistoryRef, historyPausedRef, historyState, cleanupCanvasFiles, cancelPendingHistoryCommit, resetHistory, undoCanvas, redoCanvas } = useCanvasHistory({
        projectLoaded,
        nodes,
        connections,
        nodesRef,
        connectionsRef,
        nodeTaskRunsRef,
        backgroundMode,
        showImageInfo,
        setBackgroundMode,
        setShowImageInfo,
        setNodes,
        setConnections,
        onHistoryApplied: handleHistoryApplied,
    });

    const { runningNodeId, setRunningNodeId, runningRequestRef, submitNodeTask, isNodeTaskActive, handleStopNode, abortNodePolling } = useCanvasTaskSystem({
        projectLoaded,
        nodesRef,
        nodeTaskRunsRef,
        historyRef,
        lastHistoryRef,
        setNodes,
        setConnections,
        effectiveConfig,
        isAiConfigReady,
        onError: message.error,
    });

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

    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);
        setInitialAgentRequest(null);
        setActiveOverlay(null);
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
            const restoredConnections = project.connections;
            for (const node of restoredNodes) {
                const id = node.metadata?.clientTaskId;
                if (!id) continue;
                const run: CanvasNodeTaskRun = { id, controller: new AbortController(), backend: node.metadata?.taskBackend };
                nodeTaskRunsRef.current.set(node.id, run);
                nodeTaskRunsRef.current.set(`${node.id}:${id}`, run);
            }
            const restoredSessions = syncAssistantReferences(project.chatSessions || [], restoredNodes, true);
            setNodes(restoredNodes);
            setConnections(restoredConnections);
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
            resetHistory(restoredNodes, restoredConnections, project.backgroundMode, project.showImageInfo || false);
            setProjectLoaded(true);
        };
        void restore();
    }, [hydrated, openProject, projectId, resetHistory, nodeTaskRunsRef, router, setViewport]);

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
        if (!projectLoaded || historyPausedRef.current) return;
        updateProject(projectId, { nodes, connections, chatSessions, activeChatId, agentConfig, backgroundMode, showImageInfo });
    }, [activeChatId, agentConfig, backgroundMode, chatSessions, connections, historyPausedRef, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

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
    }, [nodes, connections]);

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

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning("这两个节点不能这样连接");
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId, toNodeId }]);
            }
            setContextMenu(null);
        },
        [message, setContextMenu],
    );

    const handleNodeClicked = useCallback((nodeId: string) => {
        const clickedNode = nodesRef.current.find((node) => node.id === nodeId);
        if (!clickedNode) return;
        if (clickedNode.type === CanvasNodeType.Group) {
            closeOverlay();
        } else if (clickedNode.type === CanvasNodeType.Text) {
            setActiveOverlay((current) => (current?.kind === "prompt" && current.nodeId === nodeId ? current : null));
        } else {
            openOverlay({ kind: "prompt", nodeId });
        }
    }, [closeOverlay, openOverlay]);

    const closeNodeCreateMenu = useCallback(() => setNodeCreatePosition(null), [setNodeCreatePosition]);

    const {
        connectingParams,
        connectionTargetNodeId,
        pendingConnectionCreate,
        mouseWorld,
        selectionBox,
        isNodeDragging,
        dropTargetGroupId,
        alignmentGuides,
        nodeDraggingRef,
        cancelPendingConnectionCreate,
        cancelPointerInteraction,
        cancelSelectionBox,
        handleCanvasPointerDown,
        handleNodePointerDown,
        handleConnectStart,
        handleKeyboardConnect,
    } = useCanvasPointer({
        nodesRef,
        selectedNodeIdsRef,
        setNodes,
        viewportRef,
        screenToCanvas,
        selectMany,
        clearSelection,
        setSelectedConnectionId,
        setContextMenu,
        setHoveredNodeId,
        setToolbarNodeId,
        setAgentReferenceNodeClick,
        historyPausedRef,
        connectNodes,
        onNodeClicked: handleNodeClicked,
        notifyInfo: (text: string) => message.info(text),
        closeOverlay,
        closeNodeCreateMenu,
    });

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeDraggingRef, nodeImageSettingsOpen, selectedNodeIdsRef, setToolbarNodeId],
    );

    const hideNodeToolbar = useCallback(() => {
        if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
        setToolbarNodeId(null);
    }, [nodeDraggingRef, nodeImageSettingsOpen, setToolbarNodeId]);

    const createConnectedNode = useCallback(
        (type: CanvasNodeType, pending: PendingConnectionCreate) => {
            const workflowRef = isCanvasImageNodeType(type) ? effectiveConfig.imageWorkflowRef : type === CanvasNodeType.Video ? effectiveConfig.videoWorkflowRef : type === CanvasNodeType.Audio ? effectiveConfig.audioWorkflowRef : undefined;
            const metadata = type === CanvasNodeType.Config
                ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count), workflowRef: effectiveConfig.imageWorkflowRef }
                : workflowRef ? { workflowRef } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType);
            if (!connection) {
                message.warning("这两个节点不能这样连接");
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            selectOnly(newNode.id);
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Director) openOverlay({ kind: "prompt", nodeId: newNode.id });
            cancelPendingConnectionCreate();
        },
        [cancelPendingConnectionCreate, effectiveConfig.audioWorkflowRef, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.imageWorkflowRef, effectiveConfig.model, effectiveConfig.size, effectiveConfig.videoWorkflowRef, message, openOverlay, selectOnly, setConnections, setNodes, setSelectedConnectionId],
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
    const overlayNode = activeOverlay ? nodeById.get(activeOverlay.nodeId) || null : null;
    const infoNode = activeOverlay?.kind === "info" ? overlayNode : null;
    const cropNode = activeOverlay?.kind === "crop" ? overlayNode : null;
    const audioTrimNode = activeOverlay?.kind === "audioTrim" ? overlayNode : null;
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

    const maskEditNode = activeOverlay?.kind === "maskEdit" ? overlayNode : null;
    const maskEditConfig = maskEditNode ? buildGenerationConfig(effectiveConfig, maskEditNode, "image") : null;
    const currentMaskEditModel = maskEditModel || maskEditConfig?.model || "";
    const currentMaskEditChannelId = maskEditChannelId || maskEditConfig?.imageChannelId || "";
    const splitNode = activeOverlay?.kind === "split" ? overlayNode : null;
    const upscaleNode = activeOverlay?.kind === "upscale" ? overlayNode : null;
    const angleNode = activeOverlay?.kind === "angle" ? overlayNode : null;
    const contextMenuNode = contextMenu?.type === "node" ? nodeById.get(contextMenu.nodeId) || null : null;
    const previewNode = activeOverlay?.kind === "preview" ? overlayNode : null;
    const openDirectorNode = activeOverlay?.kind === "director" ? overlayNode : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const contextMenuBusy = contextMenuNode?.metadata?.status === "loading" || contextMenuNode?.metadata?.status === "stopping";
    const canGenerateFromContextMenu = Boolean(contextMenuNode && !contextMenuBusy && contextMenuNode.type !== CanvasNodeType.Group && contextMenuNode.type !== CanvasNodeType.Director && contextMenuNode.type !== CanvasNodeType.Publish);
    const canEditFromContextMenu = Boolean(contextMenuNode && contextMenuNode.type !== CanvasNodeType.Group && contextMenuNode.type !== CanvasNodeType.Director && contextMenuNode.type !== CanvasNodeType.Publish);
    const contextMenuGenerateLabel = contextMenuNode?.metadata?.status === "error" || contextMenuNode?.metadata?.status === "stopped" ? "重新生成" : contextMenuNode?.type === CanvasNodeType.Text ? "用文本生图" : "生成";
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
    const publishInputsById = useMemo(() => {
        const map = new Map<string, ReturnType<typeof collectPublishInputs>>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Publish) return;
            map.set(node.id, collectPublishInputs(node.id, nodes, connections));
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
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio && type !== CanvasNodeType.Director) openOverlay({ kind: "prompt", nodeId: newNode.id });
        },
        [effectiveConfig.audioWorkflowRef, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.imageWorkflowRef, effectiveConfig.model, effectiveConfig.size, effectiveConfig.videoWorkflowRef, getCanvasCenter, openOverlay, selectOnly, setSelectedConnectionId],
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
            if (disposableKeys.length) void deleteStoredImages(disposableKeys).catch((error) => message.error(toErrorMessage(error, "图片文件删除失败")));
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
            setActiveOverlay((current) => (current && allIds.has(current.nodeId) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: nextNodes, chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, historyRef, lastHistoryRef, message, projectId, clearSelection, selectedNodeIdsRef, setRunningNodeId, setSelectedConnectionId, setContextMenu],
    );

    const deleteConnection = useCallback((connectionId: string) => {
        const nextConnections = connectionsRef.current.filter((connection) => connection.id !== connectionId);
        connectionsRef.current = nextConnections;
        setConnections(nextConnections);
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, [setSelectedConnectionId, setContextMenu]);

    const deselectCanvas = useCallback(() => {
        cancelPointerInteraction();
        clearSelection();
        setSelectedConnectionId(null);
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        closeOverlay();
    }, [cancelPointerInteraction, clearSelection, closeOverlay, setSelectedConnectionId, setContextMenu]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId, setRunningNodeId, setClearConfirmOpen]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const { nodes: cloned } = cloneCanvasNodes([source], { offset: { x: 36, y: 36 }, rename: (title) => `${title} Copy` });
        const next = cloned[0];

        setNodes((prev) => [...prev, next]);
        selectOnly(next.id);
        setSelectedConnectionId(null);
        openOverlay({ kind: "prompt", nodeId: next.id });
    }, [openOverlay, selectOnly, setSelectedConnectionId]);

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
        closeOverlay();
        return group.id;
    }, [closeOverlay, selectOnly, selectedNodeIdsRef, setSelectedConnectionId]);

    const groupSelectedNodes = useCallback(() => {
        if (!createGroupFromSelection()) message.warning("请选择至少 2 个未分组的节点");
    }, [createGroupFromSelection, message]);

    const ungroupSelected = useCallback(() => {
        const groupIds = new Set(nodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id) && node.type === CanvasNodeType.Group).map((node) => node.id));
        if (!groupIds.size) return;
        const childIds: string[] = [];
        const nextNodes = nodesRef.current
            .filter((node) => !groupIds.has(node.id))
            .map((node) => {
                if (!node.metadata?.groupId || !groupIds.has(node.metadata.groupId)) return node;
                childIds.push(node.id);
                return { ...node, metadata: { ...node.metadata, groupId: undefined } };
            });
        const nextConnections = connectionsRef.current.filter((connection) => !groupIds.has(connection.fromNodeId) && !groupIds.has(connection.toNodeId));
        nodesRef.current = nextNodes;
        connectionsRef.current = nextConnections;
        setNodes(nextNodes);
        setConnections(nextConnections);
        if (childIds.length) selectMany(childIds);
        else clearSelection();
        setSelectedConnectionId(null);
        message.success(childIds.length ? `已解散分组，释放 ${childIds.length} 个节点` : "已解散分组");
    }, [clearSelection, message, selectMany, selectedNodeIdsRef, setSelectedConnectionId]);

    const alignSelectedNodes = useCallback((kind: CanvasAlignKind) => {
        const selected = nodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id));
        if (selected.length < 2) return;
        const bounds = getNodeBounds(selected);
        let changed = false;
        const nextNodes = nodesRef.current.map((node) => {
            if (!selectedNodeIdsRef.current.has(node.id)) return node;
            let { x, y } = node.position;
            if (kind === "left") x = bounds.left;
            else if (kind === "centerX") x = (bounds.left + bounds.right) / 2 - node.width / 2;
            else if (kind === "right") x = bounds.right - node.width;
            else if (kind === "top") y = bounds.top;
            else if (kind === "centerY") y = (bounds.top + bounds.bottom) / 2 - node.height / 2;
            else y = bounds.bottom - node.height;
            if (Math.abs(x - node.position.x) < 0.01 && Math.abs(y - node.position.y) < 0.01) return node;
            changed = true;
            return { ...node, position: { x, y } };
        });
        if (!changed) return;
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
    }, [selectedNodeIdsRef]);


    const fitAllNodes = useCallback(() => {
        fitNodesToView(nodesRef.current.filter((node) => !isHiddenBatchChild(node, nodesRef.current)));
    }, [fitNodesToView]);

    const fitSelectedNodes = useCallback(() => {
        const selected = nodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id)).map((node) =>
            isHiddenBatchChild(node, nodesRef.current) ? nodesRef.current.find((root) => root.id === node.metadata?.batchRootId) || node : node);
        if (selected.length) fitNodesToView(selected);
    }, [fitNodesToView, selectedNodeIdsRef]);



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

    const {
        imageInputRef,
        createImageFileNode,
        createVideoFileNode,
        createAudioFileNode,
        finishPanoramaImport,
        extractAudio,
        handleUploadRequest,
        handleImageInputChange,
    } = useCanvasFileImport({
        message,
        containerRef,
        size,
        screenToCanvas,
        nodesRef,
        setNodes,
        setConnections,
        nodeTaskRunsRef,
        abortNodePolling,
        selectOnly,
        setSelectedConnectionId,
        openOverlay,
        pendingPanoramaImport,
        setPendingPanoramaImport,
        setTrimmingAudio,
    });

    const handlePromptPanelChange = useCallback((nodeId: string | null) => {
        if (nodeId) openOverlay({ kind: "prompt", nodeId });
        else closeOverlay();
    }, [closeOverlay, openOverlay]);

    const { copySelectedNodes, pasteCopiedNodes, duplicateSelectedNodes, pasteSystemClipboard } = useCanvasClipboard({
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        setNodes,
        setConnections,
        selectOnly,
        selectMany,
        setSelectedConnectionId,
        setContextMenu,
        getCanvasCenter,
        duplicateNode,
        createImageFileNode,
        onPromptPanelChange: handlePromptPanelChange,
        notify: (text: string) => message.success(text),
    });

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
                cancelSelectionBox();
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
                cancelPointerInteraction();
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                closeOverlay();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [cancelPointerInteraction, cancelSelectionBox, closeOverlay, copySelectedNodes, createGroupFromSelection, deleteConnection, deleteNodes, duplicateSelectedNodes, fitAllNodes, fitSelectedNodes, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setZoomScale, undoCanvas, clearSelection, selectMany, selectedNodeIdsRef, setSelectedConnectionId, setContextMenu, setNodeCreatePosition]);

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
    }, [lastHistoryRef, nodeTaskRunsRef]);

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
    const { handleParseSource, handleCancelSourceParse, handleExpandSource, handleResetSource } = useCanvasSource({ nodesRef, connectionsRef, setNodes, setConnections });

    const handleDirectorProjectChange = useCallback(
        (project: unknown) => {
            if (!directorNodeId) return;
            setNodes((prev) =>
                prev.map((node) =>
                    node.id === directorNodeId && node.type === CanvasNodeType.Director
                        ? { ...node, metadata: { ...node.metadata, directorProject: project } }
                        : node,
                ),
            );
        },
        [directorNodeId],
    );

    const handleDirectorPanoramaRemoved = useCallback(
        ({ edgeId, sourceNodeId }: Pick<CanvasDirectorPanorama, "edgeId" | "sourceNodeId">) => {
            if (!directorNodeId) return;
            const connection = connectionsRef.current.find(
                (item) => item.id === edgeId && item.fromNodeId === sourceNodeId && item.toNodeId === directorNodeId,
            );
            if (!connection) return;
            setConnections((prev) => prev.filter((item) => item.id !== connection.id));
        },
        [directorNodeId],
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
                openOverlay({ kind: "prompt", nodeId: node.id });
                message.success("视频已发送到画布");
            } catch (error) {
                console.error("Send director video to canvas failed:", error);
                message.error("视频发送到画布失败");
            } finally {
                hideLoading();
            }
        },
        [message, openOverlay, selectOnly, setSelectedConnectionId],
    );

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((!isCanvasImageNodeType(node.type) && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
    }, []);

    const disconnectNodeReference = useCallback((fromNodeId: string, toNodeId: string) => {
        setConnections((prev) => prev.filter((connection) => connection.fromNodeId !== fromNodeId || connection.toNodeId !== toNodeId));
    }, []);

    const startNodeReferenceSelection = useCallback((nodeId: string) => {
        setActiveOverlay({ kind: "referencePicker", nodeId });
        selectOnly(nodeId);
        setSelectedConnectionId(null);
        setContextMenu(null);
        setToolbarNodeId(null);
    }, [selectOnly, setSelectedConnectionId, setContextMenu]);

    const exitNodeReferenceSelection = useCallback(() => {
        if (!referencePickerNodeId) return;
        selectOnly(referencePickerNodeId);
        openOverlay({ kind: "prompt", nodeId: referencePickerNodeId });
    }, [openOverlay, referencePickerNodeId, selectOnly]);

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
                openOverlay({ kind: "prompt", nodeId: id });
                message.success("已生成图片节点");
            } catch {
                message.error("无法截取该画面，请重试");
            }
        },
        [message, openOverlay, selectOnly, setSelectedConnectionId, setContextMenu],
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
            const errorMessage = toErrorMessage(error, "");
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
            const errorMessage = toErrorMessage(error, "");
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

    const showRemixPlan = useCallback((nodeId: string) => openOverlay({ kind: "prompt", nodeId }), [openOverlay]);
    const { planRemix, authorizeImage, reviewBatch, freshRun, setupDialog } = useCanvasRemix({ nodesRef, connectionsRef, setNodes, setConnections, effectiveConfig: agentEffectiveConfig, agentConfig: resolvedAgentConfig, handleExpandSource, selectMany, openPlan: showRemixPlan });

    const {
        handleGenerateNode,
        handleRetryNode,
        createImageReversePromptNodes,
        cropImageNode,
        splitImageNode,
        maskEditImageNode,
        upscaleImageNode,
        generateAngleNode,
        generateImageFromTextNode,
        runNodeGenerate,
    } = useCanvasGeneration({
        projectId,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        message,
        runningRequestRef,
        setRunningNodeId,
        nodeTaskRunsRef,
        submitNodeTask,
        isNodeTaskActive,
        handleStopNode,
        selectOnly,
        selectMany,
        setSelectedConnectionId,
        setContextMenu,
        openOverlay,
        closeOverlay,
        cancelPendingHistoryCommit,
        authorizeImage,
    });

    const { batchState, startBatch, stopBatch } = useCanvasBatchGeneration({
        nodesRef,
        connectionsRef,
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        selectMany,
        handleGenerateNode,
        handleStopNode,
        message,
        reviewBatch,
    });

    const createSourcePublishNode = useCallback((sourceId: string): string | null => {
        const currentNodes = nodesRef.current;
        const currentConnections = connectionsRef.current;
        const publishableImages = collectPublishableRemixImages(currentNodes, sourceId);
        if (!publishableImages.length) {
            message.warning("还没有生成成功的复刻配图，无法创建发布节点");
            return null;
        }
        const textNode = findSourceRemixTextNode(currentNodes, sourceId);
        const plan = planSourcePublishNode(currentNodes, currentConnections, sourceId, hasSourceRemixText(textNode) ? textNode!.id : null, publishableImages.map((node) => node.id));
        const existingPublishNodeId = plan.existingPublishNodeId;
        if (existingPublishNodeId) {
            if (plan.connectNodeIds.length) {
                setConnections((prev) => [...prev, ...plan.connectNodeIds.map((fromNodeId) => ({ id: nanoid(), fromNodeId, toNodeId: existingPublishNodeId }))]);
            }
            selectOnly(existingPublishNodeId);
            setSelectedConnectionId(null);
            openOverlay({ kind: "prompt", nodeId: existingPublishNodeId });
            message.success(plan.connectNodeIds.length ? "已复用发布节点并补齐复刻素材连接" : "已打开发布节点");
            return existingPublishNodeId;
        }
        if (!plan.createPosition) return null;
        const run = findRemixRunNode(currentNodes, sourceId)?.metadata?.remixRun;
        const publishNode = createCanvasNode(CanvasNodeType.Publish, plan.createPosition, { publishSourceId: sourceId, remixRunId: sourceId, remixSourceId: run?.input.sourceNodeId, remixRole: "publish" });
        setNodes((prev) => [...prev, publishNode]);
        setConnections((prev) => [...prev, ...plan.connectNodeIds.map((fromNodeId) => ({ id: nanoid(), fromNodeId, toNodeId: publishNode.id }))]);
        selectOnly(publishNode.id);
        setSelectedConnectionId(null);
        openOverlay({ kind: "prompt", nodeId: publishNode.id });
        message.success("已创建发布节点，可直接生成二维码");
        return publishNode.id;
    }, [connectionsRef, message, nodesRef, openOverlay, selectOnly, setConnections, setNodes, setSelectedConnectionId]);

    const generateRemixRun = useCallback(async (runId: string) => {
        try {
            await freshRun(runId);
            const ids = collectRemixImageNodeIds(nodesRef.current, runId);
            const result = await startBatch(ids, { label: "复刻配图", overwrite: true });
            if (result.completed > 0) createSourcePublishNode(runId);
        } catch (error) { message.error(toErrorMessage(error, "复刻配图生成失败")); }
    }, [createSourcePublishNode, freshRun, message, nodesRef, startBatch]);

    const handleRemixWithAgent = useCallback((sourceId: string) => {
        closeOverlay();
        const skills = chatSessions.find((session) => session.id === activeChatId)?.activeSkills || [];
        void planRemix(sourceId, "", skills).then(async (result) => {
            if (result && resolvedAgentConfig.autoGenerateMedia) await generateRemixRun(result.runId);
        }).catch((error) => message.error(toErrorMessage(error, "复刻策划失败")));
    }, [activeChatId, chatSessions, closeOverlay, generateRemixRun, message, planRemix, resolvedAgentConfig.autoGenerateMedia]);

    const batchTargetCount = useMemo(() => collectBatchTargetNodeIds(nodes, selectedNodeIds).length, [nodes, selectedNodeIds]);

    const handleBatchGenerateSelected = useCallback(() => {
        const ids = collectBatchTargetNodeIds(nodesRef.current, selectedNodeIdsRef.current);
        void startBatch(ids);
    }, [selectedNodeIdsRef, startBatch]);

    const handleStopBatch = useCallback(() => {
        void stopBatch();
    }, [stopBatch]);

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    function insertAssetAt(payload: InsertAssetPayload, position?: Position, nodeId?: string) {
        const center = position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
        if (payload.kind === "text") {
            createNode(CanvasNodeType.Text, position, payload.content, nodeId);
            return;
        }
        if (payload.kind === "video") {
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
            const id = nodeId || nanoid();
            const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
            setNodes((prev) => [...prev, { id, type: CanvasNodeType.Video, title: payload.title, position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 }, width: nextSize.width, height: nextSize.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height } }]);
            selectOnly(id);
            setSelectedConnectionId(null);
            return;
        }
        if (payload.kind === "audio") {
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            const id = nodeId || nanoid();
            setNodes((prev) => [...prev, { id, type: CanvasNodeType.Audio, title: payload.title, position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 }, width: spec.width, height: spec.height, metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, bytes: payload.bytes, mimeType: payload.mimeType || "audio/mpeg", durationMs: payload.durationMs } }]);
            selectOnly(id);
            setSelectedConnectionId(null);
            return;
        }
        return insertAssistantImage({ id: nodeId || nanoid(), prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey, source: payload.source }, position, nodeId);
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
    }, [setContextMenu]);

    const { getCanvasAgentContext, executeCanvasAgentAction, beginCanvasAgentBatch, endCanvasAgentBatch } = useCanvasAgentExecutor({
        projectId,
        projectTitle: currentProject?.title || "未命名画布",
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        setNodes,
        setConnections,
        agentEffectiveConfig,
        autoGenerateMedia: resolvedAgentConfig.autoGenerateMedia,
        isAiConfigReady,
        getCanvasCenter,
        handleGenerateNode,
        startBatch,
        createSourcePublishNode,
        handleExpandSource,
        planRemix,
        freshRun,
        selectMany,
        setSelectedConnectionId,
        deleteNodes,
        deleteConnection,
        createGroupFromSelection,
        renameProject,
        updateProject,
    });

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage, position?: Position, nodeId?: string) => {
            const storedImage = { url: image.dataUrl || await resolveImageUrl(image.storageKey), storageKey: image.storageKey || "", width: 1, height: 1, bytes: 0, mimeType: "image/png" };
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = nodeId || nanoid();
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
            openOverlay({ kind: "prompt", nodeId: id });
        },
        [openOverlay, screenToCanvas, size.height, size.width, selectOnly, setSelectedConnectionId],
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
            message.error(toErrorMessage(error, "首页素材插入失败"));
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
        [setAssetPickerOpen],
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
    const workspace: CanvasWorkspaceModel = {
        stage: {
            theme, nodes, selectedNodeIds, handleUploadRequest,
            selectOnly,
            containerRef, viewport, canvasTool, backgroundMode,
            alignmentGuides, focusAnimationRef, viewportRef, setViewport,
            setContextMenu, referencePickerNodeId, handleCanvasPointerDown, deselectCanvas,
            setNodeCreatePosition, screenToCanvas, preventCanvasContextMenu, handleDrop,
            connections, nodeById, selectedConnectionId, relatedHighlight,
            setSelectedConnectionId, clearSelection, setToolbarNodeId, connectingParams,
            mouseWorld, connectionTargetNodeId, visibleNodes, activeNodeId,
            referenceConnectedNodeIds, dialogNodeId, selectionBox, batchChildCountById,
            groupChildCountById, dropTargetGroupId, collapsingBatchIds, openingBatchIds,
            batchMotionById, showImageInfo, mentionReferencesByNodeId, canvasNow,
            configInputsById, publishInputsById, handleConfigNodeChange, closeOverlay, runningNodeId,
            connectedNodesByNodeId, videoFrameOptionsByNodeId, videoResourceOptionsByNodeId, handleNodePromptChange,
            handleRetryNode, handleGenerateNode, handleStopNode, disconnectNodeReference,
            startNodeReferenceSelection, setNodeImageSettingsOpen, openOverlay, togglePromptOverlay,
            nodesRef, handleNodePointerDown, nodeDraggingRef, setHoveredNodeId,
            handleConnectStart, handleKeyboardConnect, handleNodeResize, handleNodeContentChange,
            handleNodeTitleChange, toggleBatchExpanded, setBatchPrimary, selectNodeReference,
            pendingConnectionCreate, createConnectedNode, cancelPendingConnectionCreate, nodeCreatePosition,
            createNode, assetInsertPositionRef, setAssetPickerTab, setAssetPickerOpen,
            handleParseSource: async (nodeId, input) => {
                const result = await handleParseSource(nodeId, input);
                if (!result.ok && result.reason) message.error(result.reason);
            },
            handleCancelSourceParse: (nodeId) => {
                handleCancelSourceParse(nodeId);
            },
            handleExpandSource: (nodeId) => {
                const result = handleExpandSource(nodeId);
                if (!result.ok) {
                    if (result.needsSync) message.warning(`素材更新被阻止，请先处理节点：${result.blockedNodeIds?.join("、") || "未知节点"}`);
                    else if (result.reason) message.warning(result.reason);
                }
                return result;
            },
            handleRemixWithAgent,
            generateRemixRun,
            handleResetSource: (nodeId) => {
                const result = handleResetSource(nodeId);
                if (!result.ok) {
                    if (result.reason) message.warning(result.reason);
                    return result;
                }
                if (result.blocked) message.warning(`已清理 ${result.removed || 0} 个素材节点，${result.blocked} 个已连接下游所以保留`);
                else message.success(`已清理 ${result.removed || 0} 个素材节点`);
                return result;
            },
            projectLoaded, exitNodeReferenceSelection,
        },
        overlays: {
            theme, nodes, selectedNodeIds, sidePanel,
            historyState, handleUploadRequest, undoCanvas, redoCanvas,
            viewport, canvasTool, backgroundMode, setViewport,
            setContextMenu, showImageInfo, closeOverlay, handleRetryNode,
            openOverlay, togglePromptOverlay, createNode, setAssetPickerTab,
            setAssetPickerOpen, openDirectorNode, directorPanoramasByNodeId, colorTheme,
            handleDirectorProjectChange, handleDirectorPanoramaRemoved, handleDirectorCapturesSent, handleDirectorVideoSent,
            isNodeDragging, nodeImageSettingsOpen, toolbarNode, keepNodeToolbar,
            hideNodeToolbar, handleFontSizeChange, generateImageFromTextNode, extractAudio,
            downloadNodeImage, saveNodeAsset, uploadNodeMediaToCloud, uploadNodeImageToCloud,
            effectiveConfig, setMaskEditModel, setMaskEditChannelId, createImageReversePromptNodes,
            toggleNodeFreeResize, deleteNodes, alignSelectedNodes, groupSelectedNodes,
            ungroupSelected, duplicateSelectedNodes, setCanvasTool, setBackgroundMode,
            setShowImageInfo, isMiniMapOpen, size, setZoomScale,
            fitAllNodes, fitSelectedNodes, setIsMiniMapOpen, setShortcutsOpen,
            contextMenu, contextMenuNode, canGenerateFromContextMenu, canEditFromContextMenu,
            contextMenuGenerateLabel, captureVideoNodeFrame, runNodeGenerate, duplicateNode,
            deleteConnection, pendingPanoramaImport, finishPanoramaImport, imageInputRef,
            handleImageInputChange,
            batchState, canBatchGenerate: batchTargetCount > 0,
            onBatchGenerate: handleBatchGenerateSelected, onStopBatch: handleStopBatch,
        },
        dialogs: {
            handleAssetInsert, currentProject, setDeleteProjectConfirmOpen, setClearConfirmOpen,
            closeOverlay, assetInsertPositionRef, setAssetPickerOpen, extractAudio,
            downloadNodeImage, setMaskEditModel, setMaskEditChannelId, size,
            infoNode, audioTrimNode, trimmingAudio, audioTrimTooShort,
            audioTrimRef, audioTrimStart, audioTrimEnd, audioTrimDuration,
            setAudioTrimStart, setAudioTrimEnd, audioTrimPlaying, message,
            cropNode, cropImageNode, maskEditNode, maskEditConfig,
            currentMaskEditModel, currentMaskEditChannelId, openConfigDialog, maskEditImageNode,
            splitNode, splitImageNode, upscaleNode, upscaleImageNode,
            angleNode, generateAngleNode, previewNode,
            getBatchGroupNodes, setActiveOverlay, deleteProjectConfirmOpen, deleteCurrentProject,
            clearConfirmOpen, clearCanvas, assetPickerOpen, assetPickerTab,
        },
        assistant: {
            nodes, connections, selectedNodeIds, focusNode, setAssistantMounted,
            setAgentPanel, handleUploadRequest, agentPanel, assetInsertPositionRef,
            setAssetPickerTab, setAssetPickerOpen, assistantMounted,
            agentReferenceNodeClick, chatSessions, activeChatId, resolvedAgentConfig,
            handleAssistantSessionsChange, handleAgentConfigChange, pasteAssistantImage, getCanvasAgentContext,
            executeCanvasAgentAction, beginCanvasAgentBatch, endCanvasAgentBatch, initialAgentRequest, setInitialAgentRequest,
        },
        shell: {
            theme, nodes, selectedNodeIds, sidePanel,
            setSidePanel, focusNode, draggedAssetPayloadRef, handleAssetInsert,
            currentProject, setAssistantMounted, setAgentPanel, titleDraft,
            titleEditing, setTitleDraft, startTitleEditing, finishTitleEditing,
            setTitleEditing, historyState, router, createAndOpenProject,
            setDeleteProjectConfirmOpen, setClearConfirmOpen, handleUploadRequest, undoCanvas,
            redoCanvas, agentPanel,
        },
    };

    return <><CanvasWorkspace model={workspace} />{setupDialog}</>;
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
