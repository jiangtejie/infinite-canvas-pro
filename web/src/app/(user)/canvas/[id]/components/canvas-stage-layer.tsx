"use client";

import type { Dispatch, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, RefObject, SetStateAction } from "react";
import { type CanvasBackgroundMode, type CanvasTheme } from "@/lib/canvas-theme";
import { isCanvasImageNodeType } from "../../utils/canvas-panorama";
import { NODE_STATUS_LOADING } from "../lib/canvas-node-constants";
import { getInputSummary } from "../lib/canvas-node-builders";
import { isHiddenBatchConnectionEndpoint } from "../lib/canvas-graph";
import type { CanvasPublishInputs } from "../lib/canvas-publish";
import { ActiveConnectionPath, ConnectionPath } from "../../components/canvas-connections";
import { CanvasConfigComposer } from "../../components/canvas-config-composer";
import { CanvasConfigNodePanel } from "../../components/canvas-config-node-panel";
import { CanvasDirectorNodePanel } from "../../components/canvas-director-node-panel";
import { CanvasPublishNodeCard } from "../../components/canvas-publish-node-card";
import { CanvasPublishNodePanel } from "../../components/canvas-publish-node-panel";
import { CanvasSourceNodeCard } from "../../components/canvas-source-node-card";
import { CanvasSourceNodePanel } from "../../components/canvas-source-node-panel";
import { type NodeGenerationInput } from "../../components/canvas-node-generation";
import { InfiniteCanvas } from "../../components/infinite-canvas";
import { CanvasNode } from "../../components/canvas-node";
import { CanvasNodePromptPanel, type CanvasVideoFrameOption } from "../../components/canvas-node-prompt-panel";
import type { CanvasVideoResourceOption } from "../../components/canvas-video-settings-popover";
import { type AssetPickerTab } from "../../components/asset-picker-modal";
import { ConnectionCreateMenu, NodeCreateMenu } from "./canvas-create-menus";
import { isCanvasReferenceNode } from "../../utils/canvas-resource-references";
import { CanvasNodeType, type CanvasConnection, type PendingConnectionCreate, type CanvasNodeData, type ConnectionHandle, type ContextMenuState, type Position } from "../../types";
import type { ViewportTransform, SelectionBox } from "../../types";
import type { CanvasAlignmentGuides } from "../../utils/canvas-alignment";
import type { CanvasResourceReference } from "../../utils/canvas-resource-references";
import type { CanvasNodeGenerationMode } from "../../components/canvas-node-prompt-panel";
import type { CanvasOverlay } from "../canvas-client-page";
import { useConfigStore } from "@/stores/use-config-store";


export type CanvasStageModel = {
    theme: CanvasTheme;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    selectOnly: (nodeId: string) => void;
    handleUploadRequest: (nodeId?: string, position?: Position) => void;
    containerRef: RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    canvasTool: "select" | "pan";
    backgroundMode: CanvasBackgroundMode;
    alignmentGuides: CanvasAlignmentGuides;
    focusAnimationRef: RefObject<number | null>;
    viewportRef: RefObject<ViewportTransform>;
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
    nodeById: Map<string, CanvasNodeData>;
    selectedConnectionId: string | null;
    relatedHighlight: { nodeIds: Set<string>; connectionIds: Set<string>; };
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
    handleExpandSource: (nodeId: string) => void;
    handleRunSourceRemix: (nodeId: string) => void;
    handleResetSource: (nodeId: string) => void;
    remixImageNodeIdsBySourceId: Map<string, string[]>;
    onGenerateAllSourceRemix: (sourceId: string) => void;
    batchGenerating: boolean;
    assetInsertPositionRef: RefObject<Position | null>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    projectLoaded: boolean;
    exitNodeReferenceSelection: () => void;
};

/**
 * 画布舞台层：无限画布、节点/连线/框选、创建菜单定位、空状态与参考选择提示。
 */
export function CanvasStageLayer({ model }: { model: CanvasStageModel }) {
    const sourceParseEnabled = useConfigStore((state) => state.publicSettings?.content?.sourceParseEnabled ?? true);
    const {
        theme,
        nodes,
        selectedNodeIds,
        selectOnly,
        handleUploadRequest,
        containerRef,
        viewport,
        canvasTool,
        backgroundMode,
        alignmentGuides,
        focusAnimationRef,
        viewportRef,
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
        nodeById,
        selectedConnectionId,
        relatedHighlight,
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
        handleExpandSource,
        handleRunSourceRemix,
        handleResetSource,
        remixImageNodeIdsBySourceId,
        onGenerateAllSourceRemix,
        batchGenerating,
        assetInsertPositionRef,
        setAssetPickerTab,
        setAssetPickerOpen,
        projectLoaded,
        exitNodeReferenceSelection,
    } = model;

    return (
        <>
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
                                        onClose={() => closeOverlay()}
                                    />
                                ) : panelNode.type === CanvasNodeType.Director ? null : panelNode.type === CanvasNodeType.Publish ? (
                                    <CanvasPublishNodePanel
                                        key={panelNode.id}
                                        node={panelNode}
                                        inputs={publishInputsById.get(panelNode.id) || { text: "", textNodeIds: [], images: [] }}
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
                                        onExpand={() => handleExpandSource(panelNode.id)}
                                        onRunRemix={() => handleRunSourceRemix(panelNode.id)}
                                        onReset={() => handleResetSource(panelNode.id)}
                                        remixImageCount={remixImageNodeIdsBySourceId.get(panelNode.id)?.length || 0}
                                        onGenerateAllRemix={() => onGenerateAllSourceRemix(panelNode.id)}
                                        batchGenerating={batchGenerating}
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
                            }
                            renderNodeContent={(contentNode) =>
                                contentNode.type === CanvasNodeType.Director ? (
                                    <CanvasDirectorNodePanel onOpen={() => openOverlay({ kind: "director", nodeId: contentNode.id })} />
                                ) : contentNode.type === CanvasNodeType.Source ? (
                                    <CanvasSourceNodeCard node={contentNode} onOpen={() => openOverlay({ kind: "prompt", nodeId: contentNode.id })} />
                                ) : contentNode.type === CanvasNodeType.Publish ? (
                                    <CanvasPublishNodeCard
                                        node={contentNode}
                                        textCount={publishInputsById.get(contentNode.id)?.textNodeIds.length || 0}
                                        imageCount={publishInputsById.get(contentNode.id)?.images.length || 0}
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
                            }
                            onDragStart={handleNodePointerDown}
                            onHoverStart={(nodeId) => {
                                if (nodeDraggingRef.current) return;
                                setHoveredNodeId(nodeId);
                            }}
                            onHoverEnd={(nodeId) => {
                                setHoveredNodeId((current) => (current === nodeId ? null : current));
                            }}
                            onConnectStart={handleConnectStart}
                            onKeyboardConnect={handleKeyboardConnect}
                            onResize={handleNodeResize}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onRetry={(node) => void handleRetryNode(node)}
                            onViewImage={(node) => openOverlay({ kind: "preview", nodeId: node.id })}
                            onSelectReference={selectNodeReference}
                            onKeyboardSelect={(nodeId) => {
                                selectOnly(nodeId);
                                setSelectedConnectionId(null);
                                setToolbarNodeId(nodeId);
                                setContextMenu(null);
                            }}
                            onContextMenu={(event, id) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
                            }}
                            onOpenPanel={(node) => openOverlay({ kind: "prompt", nodeId: node.id })}
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
        </>
    );
}
