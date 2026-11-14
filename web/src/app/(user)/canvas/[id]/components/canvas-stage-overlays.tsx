"use client";

import type { ChangeEvent as ReactChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import { type CanvasBackgroundMode, type CanvasTheme } from "@/lib/canvas-theme";
import { type VideoFramePosition } from "../../utils/canvas-video-frame";
import { buildGenerationConfig } from "../lib/canvas-generation-config";
import { sourceExpansionNeedsSync } from "../lib/canvas-source-plan";
import { sourceRemixNeedsSync } from "../lib/canvas-source-remix";
import { CanvasDirector } from "../../components/canvas-director";
import { CanvasNodeContextMenu } from "../../components/canvas-context-menu";
import { CanvasNodeHoverToolbar } from "../../components/canvas-node-hover-toolbar";
import { Minimap } from "../../components/canvas-mini-map";
import { CanvasToolbar, type CanvasAlignKind } from "../../components/canvas-toolbar";
import { type AssetPickerTab } from "../../components/asset-picker-modal";
import { CanvasZoomControls } from "../../components/canvas-zoom-controls";
import { CanvasBatchProgress } from "./canvas-batch-progress";
import { CANVAS_Z } from "../lib/canvas-layer";
import { CanvasNodeType, type CanvasDirectorCapture, type CanvasDirectorPanorama, type CanvasDirectorVideo, type CanvasNodeData, type ContextMenuState, type Position } from "../../types";
import type { CanvasSidePanelState } from "../../stores/use-canvas-store";
import type { ViewportTransform } from "../../types";
import type { ThemeName } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasBatchGenerationState } from "../hooks/use-canvas-batch-generation";
import type { PendingPanoramaImport } from "../hooks/use-canvas-ui-state";
import type { CanvasOverlay } from "../canvas-client-page";


export type CanvasStageOverlaysModel = {
    theme: CanvasTheme;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    sidePanel: CanvasSidePanelState;
    historyState: { canUndo: boolean; canRedo: boolean; };
    handleUploadRequest: (nodeId?: string, position?: Position) => void;
    undoCanvas: () => void;
    redoCanvas: () => void;
    viewport: ViewportTransform;
    canvasTool: "select" | "pan";
    backgroundMode: CanvasBackgroundMode;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    showImageInfo: boolean;
    closeOverlay: () => void;
    handleRetryNode: (node: CanvasNodeData) => Promise<void>;
    openOverlay: (overlay: CanvasOverlay) => void;
    togglePromptOverlay: (nodeId: string) => void;
    createNode: (type: CanvasNodeType, position?: Position, textContent?: string, nodeId?: string) => void;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    openDirectorNode: CanvasNodeData | null;
    directorPanoramasByNodeId: Map<string, CanvasDirectorPanorama[]>;
    colorTheme: ThemeName;
    handleDirectorProjectChange: (project: unknown) => void;
    handleDirectorPanoramaRemoved: ({ edgeId, sourceNodeId }: Pick<CanvasDirectorPanorama, "edgeId" | "sourceNodeId">) => void;
    handleDirectorCapturesSent: (directorNodeId: string, captures: CanvasDirectorCapture[]) => Promise<void>;
    handleDirectorVideoSent: (directorNodeId: string, output: CanvasDirectorVideo) => Promise<void>;
    isNodeDragging: boolean;
    nodeImageSettingsOpen: boolean;
    toolbarNode: CanvasNodeData | null;
    keepNodeToolbar: (nodeId: string) => void;
    hideNodeToolbar: () => void;
    handleRemixWithAgent: (nodeId: string) => void;
    handleExpandSource: (nodeId: string) => void;
    handleResetSource: (nodeId: string) => void;
    generateRemixRun: (runId: string) => Promise<void>;
    handleFontSizeChange: (nodeId: string, fontSize: number) => void;
    generateImageFromTextNode: (node: CanvasNodeData) => void;
    extractAudio: (node: CanvasNodeData, trim?: { start: number; end: number; }) => Promise<string | undefined>;
    downloadNodeImage: (node: CanvasNodeData) => void;
    saveNodeAsset: (node: CanvasNodeData) => Promise<boolean | undefined>;
    uploadNodeMediaToCloud: (node: CanvasNodeData) => Promise<void>;
    uploadNodeImageToCloud: (node: CanvasNodeData) => Promise<void>;
    effectiveConfig: AiConfig;
    setMaskEditModel: Dispatch<SetStateAction<string>>;
    setMaskEditChannelId: Dispatch<SetStateAction<string>>;
    createImageReversePromptNodes: (node: CanvasNodeData) => void;
    toggleNodeFreeResize: (nodeId: string) => void;
    deleteNodes: (ids: Set<string>) => void;
    alignSelectedNodes: (kind: CanvasAlignKind) => void;
    groupSelectedNodes: () => void;
    ungroupSelected: () => void;
    duplicateSelectedNodes: () => void;
    setCanvasTool: Dispatch<SetStateAction<"select" | "pan">>;
    setBackgroundMode: Dispatch<SetStateAction<CanvasBackgroundMode>>;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    isMiniMapOpen: boolean;
    size: { width: number; height: number; };
    setZoomScale: (scale: number) => void;
    fitAllNodes: () => void;
    fitSelectedNodes: () => void;
    setIsMiniMapOpen: Dispatch<SetStateAction<boolean>>;
    setShortcutsOpen: (shortcutsOpen: boolean) => void;
    contextMenu: ContextMenuState | null;
    contextMenuNode: CanvasNodeData | null;
    canGenerateFromContextMenu: boolean;
    canEditFromContextMenu: boolean;
    contextMenuGenerateLabel: "重新生成" | "用文本生图" | "生成";
    captureVideoNodeFrame: (nodeId: string, position: VideoFramePosition) => Promise<boolean | undefined>;
    runNodeGenerate: (node: CanvasNodeData) => void;
    duplicateNode: (nodeId: string) => void;
    deleteConnection: (connectionId: string) => void;
    pendingPanoramaImport: PendingPanoramaImport | null;
    finishPanoramaImport: (type: CanvasNodeType.Image | CanvasNodeType.Panorama) => void;
    imageInputRef: RefObject<HTMLInputElement | null>;
    handleImageInputChange: (event: ReactChangeEvent<HTMLInputElement>) => Promise<void>;
    batchState: CanvasBatchGenerationState;
    canBatchGenerate: boolean;
    onBatchGenerate: () => void;
    onStopBatch: () => void;
};

/**
 * 画布浮层：悬浮工具条、画布工具条、缩放/小地图、右键菜单、全景导入菜单与隐藏文件输入。
 */
export function CanvasStageOverlays({ model }: { model: CanvasStageOverlaysModel }) {
    const {
        theme,
        nodes,
        selectedNodeIds,
        sidePanel,
        historyState,
        handleUploadRequest,
        undoCanvas,
        redoCanvas,
        viewport,
        canvasTool,
        backgroundMode,
        setViewport,
        setContextMenu,
        showImageInfo,
        closeOverlay,
        handleRetryNode,
        openOverlay,
        togglePromptOverlay,
        createNode,
        setAssetPickerTab,
        setAssetPickerOpen,
        openDirectorNode,
        directorPanoramasByNodeId,
        colorTheme,
        handleDirectorProjectChange,
        handleDirectorPanoramaRemoved,
        handleDirectorCapturesSent,
        handleDirectorVideoSent,
        isNodeDragging,
        nodeImageSettingsOpen,
        toolbarNode,
        keepNodeToolbar,
        hideNodeToolbar,
        handleRemixWithAgent,
        handleExpandSource,
        handleResetSource,
        generateRemixRun,
        handleFontSizeChange,
        generateImageFromTextNode,
        extractAudio,
        downloadNodeImage,
        saveNodeAsset,
        uploadNodeMediaToCloud,
        uploadNodeImageToCloud,
        effectiveConfig,
        setMaskEditModel,
        setMaskEditChannelId,
        createImageReversePromptNodes,
        toggleNodeFreeResize,
        deleteNodes,
        alignSelectedNodes,
        groupSelectedNodes,
        ungroupSelected,
        duplicateSelectedNodes,
        setCanvasTool,
        setBackgroundMode,
        setShowImageInfo,
        isMiniMapOpen,
        size,
        setZoomScale,
        fitAllNodes,
        fitSelectedNodes,
        setIsMiniMapOpen,
        setShortcutsOpen,
        contextMenu,
        contextMenuNode,
        canGenerateFromContextMenu,
        canEditFromContextMenu,
        contextMenuGenerateLabel,
        captureVideoNodeFrame,
        runNodeGenerate,
        duplicateNode,
        deleteConnection,
        pendingPanoramaImport,
        finishPanoramaImport,
        imageInputRef,
        handleImageInputChange,
        batchState,
        canBatchGenerate,
        onBatchGenerate,
        onStopBatch,
    } = model;

    const remixRun = toolbarNode?.metadata?.remixRole === "plan" ? toolbarNode.metadata.remixRun : undefined;
    const remixImages = remixRun ? nodes.filter((node) => node.metadata?.remixRunId === remixRun.id && node.metadata?.remixRole === "image") : [];
    const remixRunning = remixImages.some((node) => node.metadata?.status === "loading" || node.metadata?.status === "stopping");
    const remixCanGenerate = Boolean(remixRun?.plan) && remixRun?.binding === "active" && !remixRunning;
    const remixCanReplan = Boolean(remixRun) && !remixRunning && toolbarNode?.metadata?.status !== "loading";

    return (
        <>
                {openDirectorNode?.type === CanvasNodeType.Director ? (
                    <CanvasDirector
                        nodeId={openDirectorNode.id}
                        project={openDirectorNode.metadata?.directorProject}
                        panoramas={directorPanoramasByNodeId.get(openDirectorNode.id) || []}
                        theme={colorTheme}
                        onClose={() => closeOverlay()}
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
                    onInfo={(node) => openOverlay({ kind: "info", nodeId: node.id })}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => togglePromptOverlay(node.id)}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onExtractAudio={(node) => void extractAudio(node)}
                    onTrimAudio={(node) => openOverlay({ kind: "audioTrim", nodeId: node.id })}
                    onDownload={downloadNodeImage}
                    onSaveAsset={(node) => void saveNodeAsset(node)}
                    onUploadMediaToCloud={(node) => void uploadNodeMediaToCloud(node)}
                    onUploadImageToCloud={(node) => void uploadNodeImageToCloud(node)}
                    onMaskEdit={(node) => {
                        const nodeConfig = buildGenerationConfig(effectiveConfig, node, "image");
                        setMaskEditModel(nodeConfig.model);
                        setMaskEditChannelId(nodeConfig.imageChannelId || nodeConfig.activeChannelId || "");
                        openOverlay({ kind: "maskEdit", nodeId: node.id });
                    }}
                    onCrop={(node) => openOverlay({ kind: "crop", nodeId: node.id })}
                    onSplit={(node) => openOverlay({ kind: "split", nodeId: node.id })}
                    onUpscale={(node) => openOverlay({ kind: "upscale", nodeId: node.id })}
                    onAngle={(node) => openOverlay({ kind: "angle", nodeId: node.id })}
                    onViewImage={(node) => openOverlay({ kind: "preview", nodeId: node.id })}
                    onReversePrompt={createImageReversePromptNodes}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                    onSourceRemix={(node) => handleRemixWithAgent(node.id)}
                    onSourceExpand={(node) => handleExpandSource(node.id)}
                    onSourceReset={(node) => handleResetSource(node.id)}
                    sourceExpandedNeedsSync={toolbarNode?.type === CanvasNodeType.Source ? sourceExpansionNeedsSync(toolbarNode, nodes) : false}
                    sourceRemixStale={toolbarNode?.type === CanvasNodeType.Source ? sourceRemixNeedsSync(toolbarNode, nodes) : false}
                    onGenerateRemix={(node) => {
                        const runId = node.metadata?.remixRun?.id;
                        if (runId) void generateRemixRun(runId);
                    }}
                    onReplanRemix={(node) => {
                        const sourceId = node.metadata?.remixRun?.input.sourceNodeId;
                        if (sourceId) handleRemixWithAgent(sourceId);
                    }}
                    remixCanGenerate={remixCanGenerate}
                    remixCanReplan={remixCanReplan}
                />

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    selectedHasGroup={nodes.some((node) => node.type === CanvasNodeType.Group && selectedNodeIds.has(node.id))}
                    onAlign={alignSelectedNodes}
                    onGroup={groupSelectedNodes}
                    onUngroup={ungroupSelected}
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
                    onAddSource={() => createNode(CanvasNodeType.Source)}
                    onAddPublish={() => createNode(CanvasNodeType.Publish)}
                    onBatchGenerate={onBatchGenerate}
                    canBatchGenerate={canBatchGenerate}
                    batchGenerating={batchState.running}
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

                <CanvasBatchProgress state={batchState} onStop={onStopBatch} />

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onFitAll={fitAllNodes} onFitSelected={fitSelectedNodes} hasSelection={selectedNodeIds.size > 0} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} onOpenShortcuts={() => setShortcutsOpen(true)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        canCaptureVideoFrame={contextMenuNode?.type === CanvasNodeType.Video && Boolean(contextMenuNode.metadata?.content)}
                        canGenerate={canGenerateFromContextMenu}
                        canEdit={canEditFromContextMenu}
                        generateLabel={contextMenuGenerateLabel}
                        onClose={() => setContextMenu(null)}
                        onCaptureVideoFrame={(position) => {
                            if (contextMenu.type !== "node") return;
                            void captureVideoNodeFrame(contextMenu.nodeId, position);
                        }}
                        onEdit={() => {
                            if (!contextMenuNode) return;
                            setContextMenu(null);
                            openOverlay({ kind: "prompt", nodeId: contextMenuNode.id });
                        }}
                        onGenerate={() => {
                            if (!contextMenuNode) return;
                            setContextMenu(null);
                            runNodeGenerate(contextMenuNode);
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
                        className="fixed left-1/2 top-1/2 w-56 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border shadow-xl backdrop-blur"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, zIndex: CANVAS_Z.dialog }}
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
        </>
    );
}
