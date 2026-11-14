"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { CanvasAssistantPanel } from "../../components/canvas-assistant-panel";
import { type AssetPickerTab } from "../../components/asset-picker-modal";
import { type CanvasAgentConfig, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type CanvasPendingAgentRequest, type Position } from "../../types";
import type { CanvasSidePanelState } from "../../stores/use-canvas-store";
import type { CanvasAgentState } from "../../types";
import type { CanvasAgentContext } from "../../agent/canvas-agent-context";
import type { CanvasAgentAction, CanvasAgentExecutionContext, CanvasAgentToolResult } from "../../agent/canvas-agent-tools";


export type CanvasAssistantModel = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    focusNode: (nodeId: string) => void;
    setAssistantMounted: Dispatch<SetStateAction<boolean>>;
    setAgentPanel: Dispatch<SetStateAction<CanvasSidePanelState>>;
    handleUploadRequest: (nodeId?: string, position?: Position) => void;
    agentPanel: CanvasSidePanelState;
    assetInsertPositionRef: RefObject<Position | null>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    assistantMounted: boolean;
    agentReferenceNodeClick: { nodeId: string | null; version: number; };
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    resolvedAgentConfig: CanvasAgentConfig;
    handleAssistantSessionsChange: (sessions: CanvasAssistantSession[], activeId: string | null) => void;
    handleAgentConfigChange: (patch: Partial<CanvasAgentConfig>) => void;
    pasteAssistantImage: (file: File) => void;
    getCanvasAgentContext: (agentState: CanvasAgentState) => CanvasAgentContext;
    executeCanvasAgentAction: (action: CanvasAgentAction, messageReferenceNodeIds: string[], execution?: CanvasAgentExecutionContext) => Promise<CanvasAgentToolResult>;
    beginCanvasAgentBatch: () => void;
    endCanvasAgentBatch: (summary: { rolledBack: boolean }) => void;
    initialAgentRequest: { prompt: CanvasPendingAgentRequest["prompt"]; references: CanvasAssistantReference[]; skills: CanvasPendingAgentRequest["skills"]; } | null;
    setInitialAgentRequest: Dispatch<SetStateAction<{ prompt: CanvasPendingAgentRequest["prompt"]; references: CanvasAssistantReference[]; skills: CanvasPendingAgentRequest["skills"]; } | null>>;
};

/**
 * 画布助手面板：会话、引用节点点击、Agent 配置与工具执行接线。
 */
export function CanvasAssistantPane({ model }: { model: CanvasAssistantModel }) {
    const {
        nodes,
        connections,
        selectedNodeIds,
        focusNode,
        setAssistantMounted,
        setAgentPanel,
        handleUploadRequest,
        agentPanel,
        assetInsertPositionRef,
        setAssetPickerTab,
        setAssetPickerOpen,
        assistantMounted,
        agentReferenceNodeClick,
        chatSessions,
        activeChatId,
        resolvedAgentConfig,
        handleAssistantSessionsChange,
        handleAgentConfigChange,
        pasteAssistantImage,
        getCanvasAgentContext,
        executeCanvasAgentAction,
        beginCanvasAgentBatch,
        endCanvasAgentBatch,
        initialAgentRequest,
        setInitialAgentRequest,
    } = model;

    return (
        <>
            {assistantMounted ? (
                <CanvasAssistantPanel
                    nodes={nodes}
                    connections={connections}
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
                    onBatchStart={beginCanvasAgentBatch}
                    onBatchEnd={endCanvasAgentBatch}
                    onCollapseStart={() =>
                        setAgentPanel((current) => ({ ...current, open: false }))
                    }
                    onCollapse={() => setAssistantMounted(false)}
                    initialRequest={initialAgentRequest}
                    onInitialRequestConsumed={() => setInitialAgentRequest(null)}
                />
            ) : null}
        </>
    );
}
