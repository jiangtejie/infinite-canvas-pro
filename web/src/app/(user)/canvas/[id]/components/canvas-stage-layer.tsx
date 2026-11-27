"use client";

import type { Dispatch, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type CanvasBackgroundMode, type CanvasTheme } from "@/lib/canvas-theme";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { NODE_STATUS_LOADING } from "../lib/canvas-node-constants";
import { getInputSummary } from "../lib/canvas-node-builders";
import { isConnectionFlowing } from "../lib/canvas-graph";
import { sourceExpansionNeedsSync } from "../lib/canvas-source-plan";
import { collectCollapsedRemixNodeIds, collectSourceRemixHistory, sourceRemixNeedsSync } from "../lib/canvas-source-remix";
import type { CanvasPublishInputs } from "../lib/canvas-publish";
import { ActiveConnectionPath, ConnectionPath } from "../../components/canvas-connections";
import { CanvasConfigComposer } from "../../components/canvas-config-composer";
import { CanvasConfigNodePanel } from "../../components/canvas-config-node-panel";
import { CanvasDirectorNodePanel } from "../../components/canvas-director-node-panel";
import { CanvasPublishNodeCard } from "../../components/canvas-publish-node-card";
import { CanvasPublishNodePanel } from "../../components/canvas-publish-node-panel";
import { CanvasComicBookNodeCard } from "../../components/canvas-comic-book-node-card";
import { ComicProjectBookNodeCard } from "../../components/comic-project-book-node-card";
import { CanvasMaterialTextCard } from "../../components/canvas-material-text-card";
import { CanvasRemixPlanNodeCard } from "../../components/canvas-remix-plan-node-card";
import { CanvasSourceNodeCard } from "../../components/canvas-source-node-card";
import { CanvasSourceNodePanel } from "../../components/canvas-source-node-panel";
import { CanvasRemixWorkbench } from "../../components/canvas-remix-plan-panel";
import { type NodeGenerationInput } from "../../components/canvas-node-generation";
import { InfiniteCanvas } from "../../components/infinite-canvas";
import { CanvasNode } from "../../components/canvas-node";
import { CanvasNodePromptPanel, type CanvasVideoFrameOption } from "../../components/canvas-node-prompt-panel";
import type { CanvasVideoResourceOption } from "../../components/canvas-video-settings-popover";
import { type AssetPickerTab } from "@/components/assets/asset-picker-modal";
import { ConnectionCreateMenu, NodeCreateMenu } from "./canvas-create-menus";
import { FilmQuickConnectMenu } from "./film-quick-connect-menu";
import { isFilmNodeType, isLegacyFilmNodeType, type FilmCommandResult } from "../lib/film-node-registry";
import { isCanvasReferenceNode } from "../../utils/canvas-resource-references";
import { fitSourceNodeSize } from "../../utils/canvas-node-size";
import type { FilmVersionKind } from "../lib/film-version-room";
import type { CanvasComicMeta } from "../lib/comic-graph-types";
import { CanvasNodeType, type CanvasConnection, type PendingConnectionCreate, type CanvasNodeData, type ConnectionHandle, type ContextMenuState, type Position } from "../../types";
import type { ViewportTransform, SelectionBox } from "../../types";
import type { CanvasAlignmentGuides } from "../../utils/canvas-alignment";
import type { CanvasResourceReference } from "../../utils/canvas-resource-references";
import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import type { CanvasOverlay } from "../../types";
import { useConfigStore } from "@/stores/use-config-store";

/** 未配置引用时复用同一空数组，避免节点 memo 因每次新建数组而失效。 */
const EMPTY_MENTION_REFERENCES: CanvasResourceReference[] = [];


export type CanvasStageModel = {
    theme: CanvasTheme;
    /** 世界坐标背景层：渲染在连线与节点之前（如导演板场次列底色）。 */
    backgroundLayer?: ReactNode;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    selectedImageCount: number;
    focusNode: (nodeId: string) => void;
    selectOnly: (nodeId: string) => void;
    handleUploadRequest: (nodeId?: string, position?: Position) => void;
    containerRef: RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    canvasTool: "select" | "pan";
    backgroundMode: CanvasBackgroundMode;
    alignmentGuides: CanvasAlignmentGuides;
    focusAnimationRef: RefObject<number | null>;
    viewportRef: RefObject<ViewportTransform>;
    subscribeViewport: (listener: (viewport: ViewportTransform) => void) => () => void;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    referencePickerNodeId: string | null;
    handleCanvasPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    deselectCanvas: () => void;
    setNodeCreatePosition: Dispatch<SetStateAction<Position | null>>;
    screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number; };
    preventCanvasContextMenu: (event: ReactMouseEvent) => void;
    handleDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
    connections: CanvasConnection[];
    /** 已按视口裁切的连线；每帧只重算这个列表，不改写节点树。 */
    visibleConnections: CanvasConnection[];
    nodeById: Map<string, CanvasNodeData>;
    selectedConnectionId: string | null;
    relatedHighlight: { nodeIds: Set<string>; connectionIds: Set<string>; };
    selectionFocus: { nodeIds: Set<string>; connectionIds: Set<string>; } | null;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    clearSelection: () => void;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    connectingParams: ConnectionHandle | null;
    mouseWorld: Position;
    connectionTargetNodeId: string | null;
    visibleNodes: CanvasNodeData[];
    activeNodeId: string | null;
    referenceConnectedNodeIds: Set<string>;
    dialogNodeId: string | null;
    selectionBox: SelectionBox | null;
    batchChildCountById: Map<string, number>;
    groupChildCountById: Map<string, number>;
    dropTargetGroupId: string | null;
    collapsingBatchIds: Set<string>;
    openingBatchIds: Set<string>;
    batchMotionById: Map<string, { x: number; y: number; index: number; }>;
    showImageInfo: boolean;
    showConnections: boolean;
    mentionReferencesByNodeId: Map<string, CanvasResourceReference[]>;
    canvasNow: number;
    configInputsById: Map<string, NodeGenerationInput[]>;
    publishInputsById: Map<string, CanvasPublishInputs>;
    handleConfigNodeChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    closeOverlay: () => void;
    runningNodeId: string | null;
    connectedNodesByNodeId: Map<string, CanvasNodeData[]>;
    videoFrameOptionsByNodeId: Map<string, CanvasVideoFrameOption[]>;
    videoResourceOptionsByNodeId: Map<string, CanvasVideoResourceOption[]>;
    handleNodePromptChange: (nodeId: string, prompt: string) => void;
    handleRetryNode: (node: CanvasNodeData) => Promise<void>;
    handleGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>;
    handleStopNode: (nodeId: string) => Promise<void>;
    disconnectNodeReference: (fromNodeId: string, toNodeId: string) => void;
    startNodeReferenceSelection: (nodeId: string) => void;
    setNodeImageSettingsOpen: Dispatch<SetStateAction<boolean>>;
    openOverlay: (overlay: CanvasOverlay) => void;
    togglePromptOverlay: (nodeId: string) => void;
    addSelectedComicPages: (nodeId: string) => void;
    nodesRef: RefObject<CanvasNodeData[]>;
    handleNodePointerDown: (event: React.PointerEvent, nodeId: string) => void;
    nodeDraggingRef: RefObject<boolean>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    handleConnectStart: (event: React.PointerEvent, nodeId: string, handleType: "source" | "target") => void;
    handleKeyboardConnect: (nodeId: string, handleType: "source" | "target") => void;
    handleNodeResize: (nodeId: string, width: number, height: number, position?: Position, loadedNode?: CanvasNodeData) => void;
    handleNodeContentChange: (nodeId: string, content: string) => void;
    handleNodeTitleChange: (nodeId: string, title: string) => void;
    toggleBatchExpanded: (nodeId: string) => void;
    setBatchPrimary: (child: CanvasNodeData) => void;
    selectNodeReference: (fromNodeId: string) => void;
    pendingConnectionCreate: PendingConnectionCreate | null;
    createConnectedNode: (type: CanvasNodeType, pending: PendingConnectionCreate) => void;
    cancelPendingConnectionCreate: () => void;
    nodeCreatePosition: Position | null;
    createNode: (type: CanvasNodeType, position?: Position, textContent?: string, nodeId?: string) => void;
    handleParseSource: (nodeId: string, input: string) => Promise<void>;
    handleCancelSourceParse: (nodeId: string) => void;
    handleRemixWithAgent: (nodeId: string) => void;
    generateRemixRun: (runId: string) => Promise<unknown>;
    assetInsertPositionRef: RefObject<Position | null>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    projectLoaded: boolean;
    exitNodeReferenceSelection: () => void;
    filmMode: boolean;
    comic?: CanvasComicMeta;
    onOpenComicWorkbench?: () => void;
    filmSummaryOptions?: import("../lib/film-node-summary").FilmNodeSummaryOptions;
    generateFilmShotImage?: (shotId: string) => void;
    generateFilmShotVideo?: (shotId: string) => void;
    openFilmShotVersions?: (shotId: string, kind: FilmVersionKind) => void;
    viewFilmShotMedia?: (node: CanvasNodeData) => void;
    openFilmShotFocus?: (shotId: string) => void;
    openFilmScript?: () => void;
    onFilmScriptAction?: (nodeId: string, action: import("../lib/film-analysis-session").FilmScriptAction) => void;
    editFilmAsset?: (nodeId: string) => void;
    createFilmShot?: (sceneId: string) => void;
    updateFilmBeat?: (nodeId: string, updater: (node: CanvasNodeData) => CanvasNodeData) => void;
    decomposeFilmBeat?: (beatId: string) => void;
    generateFilmBeatPreview?: (beatId: string) => void;
    stopFilmBeatTask?: (beatId: string) => void;
    locateFilmBeatShots?: (beatId: string) => void;
    applyFilmQuickAction: (result: FilmCommandResult) => void;
};

/**
 * 画布舞台层：无限画布、节点/连线/框选、创建菜单定位、空状态与参考选择提示。
 */
export function CanvasStageLayer({ model }: { model: CanvasStageModel }) {
    const sourceParseEnabled = useConfigStore((state) => state.publicSettings?.content?.sourceParseEnabled ?? true);
    const {
        theme,
        filmMode,
        comic,
        onOpenComicWorkbench,
        filmSummaryOptions,
        applyFilmQuickAction,
        nodes,
        selectedNodeIds,
        selectedImageCount,
        focusNode,
        selectOnly,
        handleUploadRequest,
        containerRef,
        viewport,
        canvasTool,
        backgroundMode,
        alignmentGuides,
        focusAnimationRef,
        viewportRef,
        subscribeViewport,
        setViewport,
        setContextMenu,
        referencePickerNodeId,
        handleCanvasPointerDown,
        deselectCanvas,
        setNodeCreatePosition,
        screenToCanvas,
        preventCanvasContextMenu,
        handleDrop,
        connections,
        visibleConnections,
        nodeById,
        selectedConnectionId,
        relatedHighlight,
        selectionFocus,
        setSelectedConnectionId,
        clearSelection,
        setToolbarNodeId,
        connectingParams,
        mouseWorld,
        connectionTargetNodeId,
        visibleNodes,
        activeNodeId,
        referenceConnectedNodeIds,
        dialogNodeId,
        selectionBox,
        batchChildCountById,
        groupChildCountById,
        dropTargetGroupId,
        collapsingBatchIds,
        openingBatchIds,
        batchMotionById,
        showImageInfo,
        showConnections,
        mentionReferencesByNodeId,
        canvasNow,
        configInputsById,
        publishInputsById,
        handleConfigNodeChange,
        closeOverlay,
        runningNodeId,
        connectedNodesByNodeId,
        videoFrameOptionsByNodeId,
        videoResourceOptionsByNodeId,
        handleNodePromptChange,
        handleRetryNode,
        handleGenerateNode,
        handleStopNode,
        disconnectNodeReference,
        startNodeReferenceSelection,
        setNodeImageSettingsOpen,
        openOverlay,
        togglePromptOverlay,
        addSelectedComicPages,
        nodesRef,
        handleNodePointerDown,
        nodeDraggingRef,
        setHoveredNodeId,
        handleConnectStart,
        handleKeyboardConnect,
        handleNodeResize,
        handleNodeContentChange,
        handleNodeTitleChange,
        toggleBatchExpanded,
        setBatchPrimary,
        selectNodeReference,
        pendingConnectionCreate,
        createConnectedNode,
        cancelPendingConnectionCreate,
        nodeCreatePosition,
        createNode,
        handleParseSource,
        handleCancelSourceParse,
        handleRemixWithAgent,
        generateRemixRun,
        assetInsertPositionRef,
        setAssetPickerTab,
        setAssetPickerOpen,
        projectLoaded,
        exitNodeReferenceSelection,
    } = model;

    // 单选聚焦时淡出无关节点/连线；参考选择、连线中、框选中保持全亮以免干扰操作。
    const focusDim = selectionFocus && !referencePickerNodeId && !connectingParams && !selectionBox ? selectionFocus : null;
    const [revealedRemixRunId, setRevealedRemixRunId] = useState<string | null>(null);
    const collapsedRemixNodeIds = useMemo(() => collectCollapsedRemixNodeIds(nodes, revealedRemixRunId), [nodes, revealedRemixRunId]);

    // 缩放动画期间节点内容沿用上一档比例，停止约 120ms 后统一刷新，避免每帧全量重渲染；浮层节点单独用实时比例。
    const [contentScale, setContentScale] = useState(viewport.k);
    useEffect(() => {
        if (contentScale === viewport.k) return;
        const timer = window.setTimeout(() => setContentScale(viewport.k), 120);
        return () => window.clearTimeout(timer);
    }, [contentScale, viewport.k]);

    const openRemixWorkbench = useCallback((planNodeId: string) => {
        const planNode = nodes.find((node) => node.id === planNodeId);
        if (!planNode?.metadata?.remixRun) return;
        setRevealedRemixRunId(planNode.metadata.remixRun.id);
        selectOnly(planNodeId);
        focusNode(planNodeId);
        openOverlay({ kind: "prompt", nodeId: planNodeId });
    }, [nodes, selectOnly, focusNode, openOverlay]);

    const locateRemixNode = useCallback((nodeId: string) => {
        const target = nodes.find((node) => node.id === nodeId);
        if (!target) return;
        setRevealedRemixRunId(target.metadata?.remixRunId || null);
        selectOnly(nodeId);
        focusNode(nodeId);
        closeOverlay();
    }, [nodes, selectOnly, focusNode, closeOverlay]);

    const openRemixPublish = useCallback((runId: string) => {
        const publishNode = nodes.find((node) => node.metadata?.remixRunId === runId && node.metadata?.remixRole === "publish");
        if (!publishNode) return;
        setRevealedRemixRunId(runId);
        selectOnly(publishNode.id);
        focusNode(publishNode.id);
        openOverlay({ kind: "prompt", nodeId: publishNode.id });
    }, [nodes, selectOnly, focusNode, openOverlay]);

    // 节点 render 回调与事件处理器全部稳定引用，平移/选中变化时节点 memo 才能跳过重渲染。
    const renderPanel = useCallback((panelNode: CanvasNodeData, compact: boolean): ReactNode => (
        isFilmNodeType(panelNode.type) ? null :
        panelNode.metadata?.remixRole === "plan" && panelNode.metadata.remixRun ? (
            <CanvasRemixWorkbench
                node={panelNode}
                nodes={nodes}
                onGenerate={(id) => void generateRemixRun(id)}
                onReplan={(sourceId) => { setRevealedRemixRunId(null); handleRemixWithAgent(sourceId); }}
                onPublish={openRemixPublish}
                onFocusNode={locateRemixNode}
                onClose={() => { setRevealedRemixRunId(null); closeOverlay(); }}
            />
        ) : panelNode.type === CanvasNodeType.Config ? (
            <CanvasConfigComposer
                value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                inputs={configInputsById.get(panelNode.id) || []}
                onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                onClose={() => closeOverlay()}
            />
        ) : panelNode.type === CanvasNodeType.Director ? null : panelNode.type === CanvasNodeType.Publish ? (
            <CanvasPublishNodePanel
                key={panelNode.id}
                node={panelNode}
                inputs={publishInputsById.get(panelNode.id) || { text: "", textNodeIds: [], images: [] }}
                compact={compact}
                onChange={(patch) => handleConfigNodeChange(panelNode.id, patch)}
                onClose={() => closeOverlay()}
            />
        ) : panelNode.type === CanvasNodeType.Source ? (
            <CanvasSourceNodePanel
                key={panelNode.id}
                node={panelNode}
                parsing={panelNode.metadata?.sourceParsing === true || panelNode.metadata?.sourceStatus === "loading"}
                parseEnabled={sourceParseEnabled}
                onParse={(input) => void handleParseSource(panelNode.id, input)}
                onCancel={() => handleCancelSourceParse(panelNode.id)}
                onChange={(patch) => handleConfigNodeChange(panelNode.id, patch)}
                onClose={() => closeOverlay()}
            />
        ) : (
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
    ), [nodes, generateRemixRun, handleRemixWithAgent, openRemixPublish, locateRemixNode, closeOverlay, configInputsById, handleConfigNodeChange, publishInputsById, sourceParseEnabled, handleParseSource, handleCancelSourceParse, runningNodeId, mentionReferencesByNodeId, connectedNodesByNodeId, videoFrameOptionsByNodeId, videoResourceOptionsByNodeId, handleNodePromptChange, handleRetryNode, handleGenerateNode, handleStopNode, disconnectNodeReference, startNodeReferenceSelection, setNodeImageSettingsOpen, setToolbarNodeId]);

    const renderNodeContent = useCallback((contentNode: CanvasNodeData): ReactNode => (
        contentNode.metadata?.sourceMaterialRole === "text" || contentNode.id.endsWith("-material-text") ? (
            <CanvasMaterialTextCard node={contentNode} />
        ) : contentNode.type === CanvasNodeType.Comic ? (
            comic ? (
                <ComicProjectBookNodeCard
                    node={contentNode}
                    nodes={nodes}
                    comic={comic}
                    onOpenWorkbench={() => onOpenComicWorkbench?.()}
                    onOpenBook={() => openOverlay({ kind: "comic", nodeId: contentNode.id, mode: "preview" })}
                    onEnterLettering={() => openOverlay({ kind: "comic", nodeId: contentNode.id, mode: "lettering" })}
                    onHandleMissingPages={() => openOverlay({ kind: "comic", nodeId: contentNode.id, mode: "manage" })}
                />
            ) : (
                <CanvasComicBookNodeCard
                    node={contentNode}
                    nodes={nodes}
                    selectedImageCount={selectedImageCount}

                    onOpenBook={() => openOverlay({ kind: "comic", nodeId: contentNode.id, mode: "preview" })}
                    onEnterLettering={() => openOverlay({ kind: "comic", nodeId: contentNode.id, mode: "lettering" })}
                    onFocusPage={focusNode}
                    onAddSelectedPages={() => addSelectedComicPages(contentNode.id)}
                    onHandleMissingPages={() => openOverlay({ kind: "comic", nodeId: contentNode.id, mode: "manage" })}
                />
            )
        ) : contentNode.metadata?.remixRole === "plan" && contentNode.metadata.remixRun ? (
            <CanvasRemixPlanNodeCard
                node={contentNode}
                isLatest={collectSourceRemixHistory(nodes, contentNode.metadata!.remixRun!.input.sourceNodeId)[0]?.runId === contentNode.metadata!.remixRun!.id}
                images={nodes.filter((node) => node.metadata?.remixRunId === contentNode.metadata?.remixRun?.id && node.metadata?.remixRole === "image")}
                onOpen={() => openRemixWorkbench(contentNode.id)}
                onGenerate={() => void generateRemixRun(contentNode.metadata!.remixRun!.id)}
                onReplan={() => { setRevealedRemixRunId(null); handleRemixWithAgent(contentNode.metadata!.remixRun!.input.sourceNodeId); }}
                hasPublishNode={nodes.some((node) => node.metadata?.remixRunId === contentNode.metadata?.remixRun?.id && node.metadata?.remixRole === "publish")}
                onPublish={() => openRemixPublish(contentNode.metadata!.remixRun!.id)}
            />
        ) : contentNode.type === CanvasNodeType.Director ? (
            <CanvasDirectorNodePanel onOpen={() => openOverlay({ kind: "director", nodeId: contentNode.id })} />
        ) : contentNode.type === CanvasNodeType.Source ? (
            <CanvasSourceNodeCard
                node={contentNode}
                expandedNeedsSync={sourceExpansionNeedsSync(contentNode, nodes)}
                remixStale={sourceRemixNeedsSync(contentNode, nodes)}
                history={collectSourceRemixHistory(nodes, contentNode.id)}
                onOpenWorkbench={() => {
                    const planNodeId = collectSourceRemixHistory(nodes, contentNode.id)[0]?.planNodeId;
                    if (planNodeId) openRemixWorkbench(planNodeId);
                }}
                onRemix={() => { setRevealedRemixRunId(null); handleRemixWithAgent(contentNode.id); }}
                onPreviewSize={(width, height) => {
                    const size = fitSourceNodeSize(width, height);
                    handleNodeResize(contentNode.id, size.width, size.height, {
                        x: contentNode.position.x + (contentNode.width - size.width) / 2,
                        y: contentNode.position.y + (contentNode.height - size.height) / 2,
                    });
                }}
            />
        ) : contentNode.type === CanvasNodeType.Publish ? (
            <CanvasPublishNodeCard
                node={contentNode}
                textCount={publishInputsById.get(contentNode.id)?.textNodeIds.length || 0}
                imageCount={publishInputsById.get(contentNode.id)?.images.length || 0}
                images={publishInputsById.get(contentNode.id)?.images || []}
                onOpen={() => openOverlay({ kind: "prompt", nodeId: contentNode.id })}
            />
        ) : (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                videoFrameOptions={videoFrameOptionsByNodeId.get(contentNode.id) || []}
                videoResourceOptions={videoResourceOptionsByNodeId.get(contentNode.id) || []}
                onConfigChange={handleConfigNodeChange}
                onComposerToggle={() => togglePromptOverlay(contentNode.id)}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        )
    ), [nodes, comic, onOpenComicWorkbench, selectedImageCount, openOverlay, focusNode, addSelectedComicPages, generateRemixRun, handleRemixWithAgent, openRemixWorkbench, openRemixPublish, handleNodeResize, publishInputsById, runningNodeId, configInputsById, handleConfigNodeChange, togglePromptOverlay, nodesRef, handleGenerateNode, videoFrameOptionsByNodeId, videoResourceOptionsByNodeId]);

    // 视口回调保持稳定引用：InfiniteCanvas 的滚轮监听与订阅都依赖它。
    const handleViewportChange = useCallback((next: ViewportTransform) => {
        if (focusAnimationRef.current) cancelAnimationFrame(focusAnimationRef.current);
        focusAnimationRef.current = null;
        viewportRef.current = next;
        setViewport(next);
        setContextMenu(null);
    }, [focusAnimationRef, setContextMenu, setViewport, viewportRef]);

    // 连线回调保持稳定引用，平移/缩放时 ConnectionPath 的 memo 才不会失效。
    const selectConnection = useCallback((connectionId: string) => {
        setSelectedConnectionId(connectionId);
        clearSelection();
        setToolbarNodeId(null);
        setContextMenu(null);
    }, [clearSelection, setContextMenu, setSelectedConnectionId, setToolbarNodeId]);

    const openConnectionMenu = useCallback((event: ReactMouseEvent, connectionId: string) => {
        setSelectedConnectionId(connectionId);
        clearSelection();
        setToolbarNodeId(null);
        setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
    }, [clearSelection, setContextMenu, setSelectedConnectionId, setToolbarNodeId]);

    const handleNodeHoverStart = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current) return;
        setHoveredNodeId(nodeId);
    }, [nodeDraggingRef, setHoveredNodeId]);

    const handleNodeHoverEnd = useCallback((nodeId: string) => {
        setHoveredNodeId((current) => (current === nodeId ? null : current));
    }, [setHoveredNodeId]);

    const retryNodeCard = useCallback((node: CanvasNodeData) => void handleRetryNode(node), [handleRetryNode]);

    const viewImageCard = useCallback((node: CanvasNodeData) => openOverlay({ kind: "preview", nodeId: node.id }), [openOverlay]);

    const keyboardSelectNode = useCallback((nodeId: string) => {
        selectOnly(nodeId);
        setSelectedConnectionId(null);
        setToolbarNodeId(nodeId);
        setContextMenu(null);
    }, [selectOnly, setSelectedConnectionId, setToolbarNodeId, setContextMenu]);

    const openNodeContextMenu = useCallback((event: ReactMouseEvent, id: string) => {
        event.preventDefault();
        event.stopPropagation();
        if (nodes.some((node) => node.id === id && (isFilmNodeType(node.type) || isLegacyFilmNodeType(node.type) || node.type === CanvasNodeType.ComicPage || (Boolean(comic) && node.type === CanvasNodeType.Comic)))) {
            setContextMenu(null);
            return;
        }
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
    }, [comic, nodes, setContextMenu]);

    const openNodePanel = useCallback((node: CanvasNodeData) => {
        if (isFilmNodeType(node.type) || isLegacyFilmNodeType(node.type) || node.type === CanvasNodeType.ComicPage) return;
        if (comic && node.type === CanvasNodeType.Comic) {
            openOverlay({ kind: "comic", nodeId: node.id, mode: "lettering" });
            return;
        }
        openOverlay(node.type === CanvasNodeType.Comic ? { kind: "comic", nodeId: node.id } : { kind: "prompt", nodeId: node.id });
    }, [comic, openOverlay]);

    return (
        <>
                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    viewportRef={viewportRef}
                    subscribeViewport={subscribeViewport}
                    tool={canvasTool}
                    backgroundMode={backgroundMode}
                    alignmentGuides={alignmentGuides}
                    onViewportChange={handleViewportChange}
                    onCanvasMouseDown={(event) => {
                        if (!referencePickerNodeId) handleCanvasPointerDown(event);
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
                    {model.backgroundLayer}
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 6 }}>
                        {showConnections ? visibleConnections
                            .filter((connection) => !collapsedRemixNodeIds.has(connection.fromNodeId) && !collapsedRemixNodeIds.has(connection.toNodeId))
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
                                        dimmed={focusDim ? !focusDim.connectionIds.has(connection.id) : false}
                                        flowing={isConnectionFlowing(from, to)}
                                        onSelect={selectConnection}
                                        onContextMenu={openConnectionMenu}
                                    />
                                );
                            }) : null}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {visibleNodes.filter((node) => !collapsedRemixNodeIds.has(node.id)).map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={dialogNodeId === node.id && !selectionBox ? viewport.k : contentScale}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            dimmed={focusDim ? !focusDim.nodeIds.has(node.id) : false}
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
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_MENTION_REFERENCES}
                            now={node.metadata?.status === NODE_STATUS_LOADING && !node.metadata.content && (node.type === CanvasNodeType.Video || isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Audio) ? canvasNow : undefined}
                            renderPanel={renderPanel}
                            renderNodeContent={renderNodeContent}
                            filmNodes={model.filmMode ? nodes : undefined}
                            filmConnections={model.filmMode ? connections : undefined}
                            onGenerateFilmImage={model.generateFilmShotImage}
                            onGenerateFilmVideo={model.generateFilmShotVideo}
                            onOpenFilmVersions={model.openFilmShotVersions}
                            onViewFilmMedia={model.viewFilmShotMedia}
                            onFocusFilmShot={model.openFilmShotFocus}
                            onOpenFilmScript={model.openFilmScript}
                            onFilmScriptAction={model.onFilmScriptAction}
                            onEditFilmAsset={model.editFilmAsset}
                            onCreateFilmShot={model.createFilmShot}
                            onUpdateFilmBeat={model.updateFilmBeat}
                            onDecomposeFilmBeat={model.decomposeFilmBeat}
                            onGenerateFilmBeatPreview={model.generateFilmBeatPreview}
                            onStopFilmBeatTask={model.stopFilmBeatTask}
                            onLocateFilmBeatShots={model.locateFilmBeatShots}
                            filmSummaryOptions={filmSummaryOptions}
                            onDragStart={handleNodePointerDown}
                            onHoverStart={handleNodeHoverStart}
                            onHoverEnd={handleNodeHoverEnd}
                            onConnectStart={handleConnectStart}
                            onKeyboardConnect={handleKeyboardConnect}
                            onResize={handleNodeResize}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onRetry={retryNodeCard}
                            onViewImage={viewImageCard}
                            onSelectReference={selectNodeReference}
                            onKeyboardSelect={keyboardSelectNode}
                            onContextMenu={openNodeContextMenu}
                            onOpenPanel={openNodePanel}
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
                    {pendingConnectionCreate ? (
                        filmMode ? (
                            <FilmQuickConnectMenu
                                position={pendingConnectionCreate.position}
                                sourceNode={nodeById.get(pendingConnectionCreate.connection.nodeId) ?? null}
                                nodes={nodes}
                                connections={connections}
                                onApply={applyFilmQuickAction}
                                onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)}
                                onUpload={() => handleUploadRequest(undefined, pendingConnectionCreate.position)}
                                onOpenAssetLibrary={() => {
                                    assetInsertPositionRef.current = pendingConnectionCreate.position;
                                    setAssetPickerTab("library");
                                    setAssetPickerOpen(true);
                                }}
                                onClose={cancelPendingConnectionCreate}
                            />
                        ) : (
                            <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} />
                        )
                    ) : null}
                    {nodeCreatePosition ? (
                        filmMode ? (
                            <FilmQuickConnectMenu
                                position={nodeCreatePosition}
                                sourceNode={null}
                                allowGenericResources
                                nodes={nodes}
                                connections={connections}
                                onApply={applyFilmQuickAction}
                                onCreate={(type) => createNode(type, nodeCreatePosition)}
                                onUpload={() => handleUploadRequest(undefined, nodeCreatePosition)}
                                onOpenAssetLibrary={() => {
                                    assetInsertPositionRef.current = nodeCreatePosition;
                                    setAssetPickerTab("library");
                                    setAssetPickerOpen(true);
                                }}
                                onClose={() => setNodeCreatePosition(null)}
                            />
                        ) : (
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
                        )
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
                                <button type="button" className="chip pointer-events-auto cursor-pointer transition-colors hover:border-acid/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => createNode(CanvasNodeType.Text)}>新建文本</button>
                                <button type="button" className="chip pointer-events-auto cursor-pointer transition-colors hover:border-acid/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => handleUploadRequest()}>上传素材</button>
                                <button type="button" className="chip pointer-events-auto cursor-pointer transition-colors hover:border-acid/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => { assetInsertPositionRef.current = null; setAssetPickerTab("library"); setAssetPickerOpen(true); }}>素材库</button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {referencePickerNodeId ? <button type="button" className="absolute left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} onClick={exitNodeReferenceSelection}>从画布选择参考 · ESC 返回输入框</button> : null}
        </>
    );
}
