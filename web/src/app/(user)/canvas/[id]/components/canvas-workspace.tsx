"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { CanvasTopBar } from "./canvas-top-bar";
import { CanvasSidePanel } from "../../components/canvas-side-panel";
import { type CanvasNodeData, type InsertAssetPayload, type Position } from "../../types";
import type { CanvasSidePanelState, CanvasProject } from "../../stores/use-canvas-store";
import { CanvasAssistantPane, type CanvasAssistantModel } from "./canvas-assistant-pane";
import { CanvasDialogs, type CanvasDialogModel } from "./canvas-dialogs";
import { CanvasStageLayer, type CanvasStageModel } from "./canvas-stage-layer";
import { CanvasStageOverlays, type CanvasStageOverlaysModel } from "./canvas-stage-overlays";
import { useCanvasUiStore } from "../../stores/use-canvas-ui-store";
import { useFilmViewState } from "../../stores/use-film-view-store";
import type { FilmStudioModel } from "../lib/film-studio-types";
import { FilmStudioBody } from "./film-studio-body";
import { FilmViewBody } from "./film-view-body";
import { FilmStudioViewSwitch } from "./film-studio-view-switch";
import { FilmShotBatchProgress } from "./film-shot-batch-progress";
import { FilmReviewDrawer } from "./film-review-drawer";
import { FilmAssetProposalDialog } from "./film-asset-proposal-dialog";
import { FilmAssetProductionDialog } from "./film-asset-production-dialog";
import { FilmPreviewOverlay } from "./film-preview-overlay";
import { FilmShotGroupsDialog } from "./film-shot-groups-dialog";
import { FilmShotProductionDialog } from "./film-shot-production-dialog";
import { FilmStructureProposalDialog } from "./film-structure-proposal-dialog";
import { FilmVersionRoomDialog } from "./film-version-room-dialog";
import { filmReviewIsStale, selectFilmReview } from "../lib/film-review";

type CanvasShellModel = {
    theme: CanvasTheme;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    sidePanel: CanvasSidePanelState;
    setSidePanel: Dispatch<SetStateAction<CanvasSidePanelState>>;
    focusNode: (nodeId: string) => void;
    draggedAssetPayloadRef: RefObject<InsertAssetPayload | null>;
    handleAssetInsert: (payload: InsertAssetPayload) => void;
    currentProject: CanvasProject | undefined;
    setAssistantMounted: Dispatch<SetStateAction<boolean>>;
    setAgentPanel: Dispatch<SetStateAction<CanvasSidePanelState>>;
    titleDraft: string;
    titleEditing: boolean;
    setTitleDraft: Dispatch<SetStateAction<string>>;
    startTitleEditing: () => void;
    finishTitleEditing: () => void;
    setTitleEditing: Dispatch<SetStateAction<boolean>>;
    historyState: { canUndo: boolean; canRedo: boolean; };
    router: { push: (href: string) => void };
    createAndOpenProject: () => void;
    setDeleteProjectConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    handleUploadRequest: (nodeId?: string, position?: Position) => void;
    undoCanvas: () => void;
    redoCanvas: () => void;
    agentPanel: CanvasSidePanelState;
    filmMode: boolean;
    onArrangeFilm: () => void;
};


export type CanvasWorkspaceModel = {
    shell: CanvasShellModel;
    stage: CanvasStageModel;
    overlays: CanvasStageOverlaysModel;
    dialogs: CanvasDialogModel;
    assistant: CanvasAssistantModel;
    filmStudio?: FilmStudioModel;
};

export function CanvasWorkspace({ model }: { model: CanvasWorkspaceModel }) {
    const {
        theme,
        nodes,
        selectedNodeIds,
        sidePanel,
        setSidePanel,
        focusNode,
        draggedAssetPayloadRef,
        handleAssetInsert,
        currentProject,
        setAssistantMounted,
        setAgentPanel,
        titleDraft,
        titleEditing,
        setTitleDraft,
        startTitleEditing,
        finishTitleEditing,
        setTitleEditing,
        historyState,
        router,
        createAndOpenProject,
        setDeleteProjectConfirmOpen,
        setClearConfirmOpen,
        handleUploadRequest,
        undoCanvas,
        redoCanvas,
        agentPanel,
        filmMode,
        onArrangeFilm,
    } = model.shell;
    const filmStudio = model.filmStudio;
    const filmViewMode = Boolean(filmStudio && filmStudio.view !== "graph");
    const [filmReviewOpen, setFilmReviewOpen] = useState(false);
    const filmReviewReport = useMemo(() => (filmMode ? selectFilmReview(nodes, model.stage.connections, currentProject?.film, currentProject?.title) : null), [currentProject, filmMode, model.stage.connections, nodes]);
    const filmReviewStale = filmReviewIsStale(currentProject?.film?.consistencyReview, filmReviewReport?.fingerprint);
    const filmReviewBadge = filmReviewReport ? {
        errors: filmReviewReport.issues.filter((issue) => issue.level === "error").length,
        warnings: filmReviewReport.issues.filter((issue) => issue.level === "warning").length,
        stale: filmReviewStale,
    } : undefined;
    const filmViewState = useFilmViewState(filmStudio?.projectId ?? "");
    const filmBatchBottom = filmStudio?.view === "studio" ? (filmViewState.stripOpen ? 180 : 52) : 96;
    const batchCurrentNode = filmStudio?.shotBatch.currentShotId ? nodes.find((node) => node.id === filmStudio.shotBatch.currentShotId) : undefined;
    const batchCurrentProgress = batchCurrentNode?.metadata?.progress ?? 0;
    const zenMode = useCanvasUiStore((state) => state.zenMode);
    useEffect(() => {
        // 浏览器 Esc/界面退出全屏时同步退出 Zen，避免「Zen 但非全屏」的悬空状态。
        const syncFullscreen = () => {
            if (!document.fullscreenElement) useCanvasUiStore.getState().setZenMode(false);
        };
        document.addEventListener("fullscreenchange", syncFullscreen);
        return () => {
            document.removeEventListener("fullscreenchange", syncFullscreen);
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        };
    }, []);
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
            {!filmViewMode ? (
            <CanvasSidePanel
                nodes={nodes}
                selectedNodeIds={selectedNodeIds}
                open={sidePanel.open && !zenMode}
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
            ) : null}
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
                    onProjects={() => router.push(filmStudio ? "/film" : "/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={() => setDeleteProjectConfirmOpen(true)}
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
                    filmMode={filmMode}
                    onArrangeFilm={onArrangeFilm}
                    filmScenes={filmStudio?.scenes.map((scene) => ({ id: scene.id, label: scene.label }))}
                    activeSceneId={filmStudio?.activeSceneId ?? undefined}
                    onSceneChange={filmStudio?.onSceneChange}
                    studioView={filmStudio?.view === "graph" ? "graph" : filmStudio ? "studio" : undefined}
                />
                {filmStudio && filmStudio.view !== "graph" ? (
                    filmStudio.view === "studio" ? <FilmStudioBody model={filmStudio} theme={theme} /> : <FilmViewBody view={filmStudio.view} model={filmStudio} theme={theme} />
                ) : filmStudio ? (
                    <div className="absolute inset-x-0 bottom-0 top-[108px] max-sm:top-[116px]">
                        <CanvasStageLayer model={model.stage} />
                        <CanvasStageOverlays model={model.overlays} />
                    </div>
                ) : (
                    <>
                        <CanvasStageLayer model={model.stage} />
                        <CanvasStageOverlays model={model.overlays} />
                    </>
                )}
                <CanvasDialogs model={model.dialogs} />
                {filmStudio ? <FilmStudioViewSwitch view={filmStudio.view} onChange={filmStudio.onViewChange} onOpenScript={filmStudio.onOpenScript} onOpenVersions={filmStudio.onOpenVersionBatch} onPreview={filmStudio.onOpenPreview} onOpenProduction={filmStudio.onOpenShotProduction} onOpenGroups={filmStudio.shotGroups.onOpen} groupCount={filmStudio.shotGroups.groups.length} previewDisabled={!filmStudio.shots.length} onReview={() => setFilmReviewOpen(true)} reviewBadge={filmReviewBadge} versionBadge={filmStudio.versionRoomCount} /> : null}
                {filmStudio?.shotBatch.running ? <FilmShotBatchProgress theme={theme} state={filmStudio.shotBatch} onStop={filmStudio.onStopShotBatch} bottomOffset={filmBatchBottom} currentProgress={batchCurrentProgress} /> : null}
                {filmStudio ? (
                    <FilmReviewDrawer
                        open={filmReviewOpen}
                        onClose={() => setFilmReviewOpen(false)}
                        theme={theme}
                        model={filmStudio}
                        report={filmReviewReport}
                        film={currentProject?.film}
                        onOpenShot={(shotId) => {
                            filmStudio.onSelectShot(shotId);
                            filmStudio.onViewChange("studio");
                            setFilmReviewOpen(false);
                        }}
                    />
                ) : null}
                {filmStudio?.structureProposal ? <FilmStructureProposalDialog theme={theme} {...filmStudio.structureProposal} /> : null}
                {filmStudio?.assetProposal ? <FilmAssetProposalDialog theme={theme} {...filmStudio.assetProposal} /> : null}
                {filmStudio?.assetProduction?.open ? <FilmAssetProductionDialog theme={theme} {...filmStudio.assetProduction} /> : null}
                {filmStudio?.previewOpen ? <FilmPreviewOverlay theme={theme} model={filmStudio} onClose={filmStudio.onClosePreview} /> : null}
                {filmStudio?.shotProductionOpen ? <FilmShotProductionDialog theme={theme} shots={filmStudio.shots} batch={filmStudio.shotBatch} onStart={(shotIds, kind) => filmStudio.onBatchGenerateShots(shotIds, kind)} onStop={filmStudio.onStopShotBatch} onClose={filmStudio.onCloseShotProduction} /> : null}
                {filmStudio?.shotGroups.open ? <FilmShotGroupsDialog theme={theme} projectId={filmStudio.projectId} groups={filmStudio.shotGroups.groups} onCreate={filmStudio.shotGroups.onCreate} onRename={filmStudio.shotGroups.onRename} onDelete={filmStudio.shotGroups.onDelete} onSelect={filmStudio.shotGroups.onSelect} onPreview={filmStudio.shotGroups.onPreview} onClose={filmStudio.shotGroups.onClose} /> : null}
                {filmStudio?.versionRoom ? <FilmVersionRoomDialog theme={theme} {...filmStudio.versionRoom} /> : null}
            </section>
            {!filmViewMode ? (
            <div className="flex h-full shrink-0 transition-opacity duration-300" style={{ width: zenMode ? 0 : undefined, opacity: zenMode ? 0 : 1, visibility: zenMode ? "hidden" : "visible" }}>
                <CanvasAssistantPane model={model.assistant} />
            </div>
            ) : null}
        </main>
    );
}
