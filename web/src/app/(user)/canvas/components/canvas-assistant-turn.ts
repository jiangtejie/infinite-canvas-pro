"use client";

import type { AiConfig } from "@/stores/use-config-store";

import { runCanvasAgent, type CanvasAgentBatchSummary, type RunCanvasAgentInput } from "../agent/canvas-agent-runtime";
import type { CanvasAgentContext } from "../agent/canvas-agent-context";
import type { CanvasAgentAction, CanvasAgentToolResult } from "../agent/canvas-agent-tools";
import type { CanvasAgentState, CanvasAssistantMessage, CanvasAssistantReference, CanvasAssistantSession } from "../types";
import { errorMessage } from "@/lib/utils";

export type AssistantAgentRunner = (input: RunCanvasAgentInput) => Promise<Awaited<ReturnType<typeof runCanvasAgent>>>;

type AssistantTurnInput = {
    session: CanvasAssistantSession;
    assistantId: string;
    userText: string;
    references: CanvasAssistantReference[];
    activeSkillContents?: Array<{ id: string; source: "system" | "user"; name: string; content: string; hasFiles?: boolean }>;
    requestConfig: AiConfig;
    jsonToolFallbackKey: string;
    createRunner: (session: CanvasAssistantSession, assistantId: string) => AssistantAgentRunner;
    getAgentContext: (state: CanvasAgentState) => CanvasAgentContext;
    executeAction: (action: CanvasAgentAction, signal: AbortSignal) => Promise<CanvasAgentToolResult>;
    onBatchStart?: () => void;
    onBatchEnd?: (summary: CanvasAgentBatchSummary) => void;
    updateSession: (sessionId: string, updater: (session: CanvasAssistantSession) => CanvasAssistantSession) => void;
    updateMessage: (sessionId: string, messageId: string, patch: Partial<CanvasAssistantMessage>) => void;
    takeAbort: (controller: AbortController) => void;
    releaseAbort: (controller: AbortController) => void;
    /** 单测可注入；默认把图片引用转成 dataURL 后随消息发送。 */
    hydrateReference?: (reference: CanvasAssistantReference) => Promise<CanvasAssistantReference>;
    onRunningChange: (running: boolean) => void;
};

async function defaultHydrateReference(reference: CanvasAssistantReference): Promise<CanvasAssistantReference> {
    if (!reference.dataUrl) return reference;
    try {
        const { imageToDataUrl } = await import("@/services/image-storage");
        return { ...reference, dataUrl: await imageToDataUrl(reference) };
    } catch {
        return reference;
    }
}

/**
 * 单轮助手执行：接管 abort、图片引用补全、模型调用、会话回写与错误状态。
 * 面板只负责准备消息与配置。
 */
export async function runAssistantTurn(input: AssistantTurnInput) {
    const controller = new AbortController();
    input.takeAbort(controller);
    input.onRunningChange(true);
    try {
        const hydrateReference = input.hydrateReference || defaultHydrateReference;
        const references = await Promise.all(input.references.map(hydrateReference));
        const run = input.createRunner(input.session, input.assistantId);
        const result = await run({
            config: input.requestConfig,
            initialState: input.session.agentState,
            protocolMessages: input.session.protocolMessages,
            userText: input.userText,
            references,
            activeSkillContents: input.activeSkillContents,
            contextCheckpoint: input.session.contextCheckpoint,
            preferredJsonMode: input.session.jsonToolFallbackKey === input.jsonToolFallbackKey ? input.session.jsonToolFallbackMode || "structured-json" : undefined,
            getContext: input.getAgentContext,
            onBatchStart: input.onBatchStart,
            onBatchEnd: input.onBatchEnd,
            executeAction: (action, signal) => input.executeAction(action, signal || controller.signal),
            signal: controller.signal,
            onEvent: (event) => input.updateMessage(input.session.id, input.assistantId, { status: event.status, activity: event.label }),
            onCheckpoint: (checkpoint) =>
                input.updateSession(input.session.id, (current) => ({
                    ...current,
                    agentState: checkpoint.state,
                    protocolMessages: checkpoint.protocolMessages,
                    contextCheckpoint: checkpoint.contextCheckpoint,
                    jsonToolFallbackKey: checkpoint.jsonFallbackMode ? input.jsonToolFallbackKey : undefined,
                    jsonToolFallbackMode: checkpoint.jsonFallbackMode,
                    updatedAt: new Date().toISOString(),
                })),
        });
        input.updateSession(input.session.id, (current) => ({
            ...current,
            agentState: result.state,
            protocolMessages: result.protocolMessages,
            contextCheckpoint: result.contextCheckpoint,
            jsonToolFallbackKey: result.jsonFallbackMode ? input.jsonToolFallbackKey : undefined,
            jsonToolFallbackMode: result.jsonFallbackMode,
            messages: current.messages.map((message) => (message.id === input.assistantId ? { ...message, text: result.reply, status: "success", activity: undefined } : message)),
            updatedAt: new Date().toISOString(),
        }));
    } catch (error) {
        const stopped = error instanceof Error && error.name === "AbortError";
        input.updateMessage(input.session.id, input.assistantId, {
            text: stopped ? "已停止继续执行。已经创建的节点和已经提交的媒体任务会保留。" : errorMessage(error, "Agent 执行失败"),
            status: stopped ? "waiting" : "error",
            activity: undefined,
        });
    } finally {
        input.releaseAbort(controller);
        input.onRunningChange(false);
    }
}
