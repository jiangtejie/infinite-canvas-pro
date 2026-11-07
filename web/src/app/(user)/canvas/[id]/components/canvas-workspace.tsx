"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { CanvasTopBar } from "./canvas-top-bar";
import { CanvasSidePanel } from "../../components/canvas-side-panel";
import { type CanvasNodeData, type InsertAssetPayload, type Position } from "../../types";
import type { CanvasSidePanelState, CanvasProject } from "../../stores/use-canvas-store";
import { CanvasAssistantPane, type CanvasAssistantModel } from "./canvas-assistant-pane";
import { CanvasDialogs, type CanvasDialogModel } from "./canvas-dialogs";
import { CanvasStageLayer, type CanvasStageModel } from "./canvas-stage-layer";
import { CanvasStageOverlays, type CanvasStageOverlaysModel } from "./canvas-stage-overlays";

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
};


export type CanvasWorkspaceModel = {
    shell: CanvasShellModel;
    stage: CanvasStageModel;
    overlays: CanvasStageOverlaysModel;
    dialogs: CanvasDialogModel;
    assistant: CanvasAssistantModel;
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
    } = model.shell;
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
                />
                <CanvasStageLayer model={model.stage} />
                <CanvasStageOverlays model={model.overlays} />
                <CanvasDialogs model={model.dialogs} />
            </section>
            <CanvasAssistantPane model={model.assistant} />
        </main>
    );
}
