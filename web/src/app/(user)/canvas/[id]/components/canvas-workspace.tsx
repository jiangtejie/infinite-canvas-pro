"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
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
import type { FilmDirectorBoardModel } from "../lib/film-studio-types";
import { FilmDirectorBoard } from "./film-director-board";
import { FilmShotFocus } from "./film-shot-focus";
import { FilmViewBody } from "./film-view-body";
import { FilmViewSwitch } from "./film-view-switch";
import { ComicViewSwitch } from "./comic-view-switch";
import { ComicWorkbench } from "./comic-workbench";
import { FilmShotBatchProgress } from "./film-shot-batch-progress";
import { FilmReviewDrawer } from "./film-review-drawer";
import { FilmPreviewOverlay } from "./film-preview-overlay";
import { FilmProductionCenter } from "./film-production-center";
import { FilmShotGroupsDialog } from "./film-shot-groups-dialog";
import { FilmVersionRoomDialog } from "./film-version-room-dialog";
import { useFilmCastStore } from "@/stores/use-film-cast-store";
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
};


export type ComicStudioModel = {
    project: CanvasProject;
    view: "book" | "workbench";
    onViewChange: (view: "book" | "workbench") => void;
    selectedPageId?: string;
    onChangeProject: (project: CanvasProject) => void;
};

/** 侧栏行数随节点增长，平移/缩放时不该跟着页面一起重渲染。 */
const MemoCanvasSidePanel = memo(CanvasSidePanel);

export type CanvasWorkspaceModel = {
    shell: CanvasShellModel;
    stage: CanvasStageModel;
    overlays: CanvasStageOverlaysModel;
    dialogs: CanvasDialogModel;
    assistant: CanvasAssistantModel;
    filmStudio?: FilmDirectorBoardModel;
    comicStudio?: ComicStudioModel;
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
    } = model.shell;
    const filmStudio = model.filmStudio;
    const comicStudio = model.comicStudio;
    const filmBoardActive = Boolean(filmStudio);
    const domainActive = filmBoardActive || Boolean(comicStudio);
    const filmCostumes = useFilmCastStore((state) => state.costumes);
    const [filmReviewOpen, setFilmReviewOpen] = useState(false);
    const filmReviewReport = useMemo(() => (filmMode ? selectFilmReview(nodes, model.stage.connections, currentProject?.film, currentProject?.title, filmCostumes) : null), [currentProject, filmCostumes, filmMode, model.stage.connections, nodes]);
    const filmReviewStale = filmReviewIsStale(currentProject?.film?.consistencyReview, filmReviewReport?.fingerprint);
    const filmReviewBadge = filmReviewReport ? {
        errors: filmReviewReport.issues.filter((issue) => issue.level === "error").length,
        warnings: filmReviewReport.issues.filter((issue) => issue.level === "warning").length,
        stale: filmReviewStale,
    } : undefined;
    const filmViewState = useFilmViewState(filmStudio?.projectId ?? "");
    const filmBatchBottom = filmStudio?.shotFocusOpen && filmViewState.stripOpen ? 180 : 96;
    const batchCurrentNode = filmStudio?.shotBatch.currentShotId ? nodes.find((node) => node.id === filmStudio.shotBatch.currentShotId) : undefined;
    const batchCurrentProgress = batchCurrentNode?.metadata?.progress ?? 0;
    const zenMode = useCanvasUiStore((state) => state.zenMode);
    // 回调保持稳定引用，侧栏（行数 = 节点数）才能在每帧平移时跳过重渲染。
    const handleSidePanelWidthChange = useCallback((width: number) => {
        setSidePanel((current) => ({ ...current, width }));
    }, [setSidePanel]);
    const handleSidePanelClose = useCallback(() => {
        setSidePanel((current) => ({ ...current, open: false }));
    }, [setSidePanel]);
    const handleAssetDragStart = useCallback((payload: InsertAssetPayload) => {
        draggedAssetPayloadRef.current = payload;
    }, [draggedAssetPayloadRef]);
    const handleAssetDragEnd = useCallback(() => {
        window.setTimeout(() => {
            draggedAssetPayloadRef.current = null;
        }, 0);
    }, [draggedAssetPayloadRef]);
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
            {!domainActive ? (
            <MemoCanvasSidePanel
                nodes={nodes}
                selectedNodeIds={selectedNodeIds}
                open={sidePanel.open && !zenMode}
                width={sidePanel.width}
                onWidthChange={handleSidePanelWidthChange}
                onFocusNode={focusNode}
                onAssetDragStart={handleAssetDragStart}
                onAssetDragEnd={handleAssetDragEnd}
                onInsertAsset={handleAssetInsert}
                onClose={handleSidePanelClose}
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
                    onProjects={() => router.push(comicStudio ? "/comic" : filmStudio ? "/film" : "/canvas")}
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
                    filmScenes={filmStudio?.scenes.map((scene) => ({ id: scene.id, label: scene.label }))}
                    activeSceneId={filmStudio?.activeSceneId ?? undefined}
                    onSceneChange={filmStudio?.onSceneChange}
                />
                {comicStudio ? (
                    comicStudio.view === "book" ? (
                        <>
                            <CanvasStageLayer model={model.stage} />
                            <CanvasStageOverlays model={model.overlays} />
                        </>
                    ) : (
                        <ComicWorkbench project={comicStudio.project} selectedPageId={comicStudio.selectedPageId} onChangeProject={comicStudio.onChangeProject} />
                    )
                ) : filmStudio ? (
                    filmStudio.view === "board" ? (
                        <FilmDirectorBoard stage={model.stage} overlays={model.overlays} film={filmStudio} />
                    ) : (
                        <FilmViewBody view={filmStudio.view} model={filmStudio} theme={theme} />
                    )
                ) : (
                    <>
                        <CanvasStageLayer model={model.stage} />
                        <CanvasStageOverlays model={model.overlays} />
                    </>
                )}
                {filmStudio?.shotFocusOpen ? <FilmShotFocus model={filmStudio} theme={theme} /> : null}
                <CanvasDialogs model={model.dialogs} />
                {comicStudio ? <ComicViewSwitch view={comicStudio.view} onChange={comicStudio.onViewChange} /> : null}
                {filmStudio && !filmStudio.shotFocusOpen ? <FilmViewSwitch view={filmStudio.view} onChange={filmStudio.onViewChange} onOpenScript={filmStudio.onOpenScript} onOpenVersions={filmStudio.onOpenVersionBatch} onPreview={filmStudio.onOpenPreview} onOpenProduction={filmStudio.onOpenProduction} onOpenGroups={filmStudio.shotGroups.onOpen} groupCount={filmStudio.shotGroups.groups.length} previewDisabled={!filmStudio.shots.length} onReview={() => setFilmReviewOpen(true)} reviewBadge={filmReviewBadge} versionBadge={filmStudio.versionRoomCount} /> : null}
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
                            filmStudio.onOpenShotFocus(shotId);
                            setFilmReviewOpen(false);
                        }}
                    />
                ) : null}
                {filmStudio?.productionCenter?.open ? <FilmProductionCenter theme={theme} {...filmStudio.productionCenter} /> : null}
                {filmStudio?.previewOpen ? <FilmPreviewOverlay theme={theme} model={filmStudio} onClose={filmStudio.onClosePreview} /> : null}
                {filmStudio?.shotGroups.open ? <FilmShotGroupsDialog theme={theme} projectId={filmStudio.projectId} groups={filmStudio.shotGroups.groups} onCreate={filmStudio.shotGroups.onCreate} onRename={filmStudio.shotGroups.onRename} onDelete={filmStudio.shotGroups.onDelete} onSelect={filmStudio.shotGroups.onSelect} onPreview={filmStudio.shotGroups.onPreview} onProduce={filmStudio.shotGroups.onProduce} onClose={filmStudio.shotGroups.onClose} /> : null}
                {filmStudio?.versionRoom ? <FilmVersionRoomDialog theme={theme} {...filmStudio.versionRoom} /> : null}
            </section>
            {!domainActive ? (
            <div className="flex h-full shrink-0 transition-opacity duration-300" style={{ width: zenMode ? 0 : undefined, opacity: zenMode ? 0 : 1, visibility: zenMode ? "hidden" : "visible" }}>
                <CanvasAssistantPane model={model.assistant} />
            </div>
            ) : null}
        </main>
    );
}
