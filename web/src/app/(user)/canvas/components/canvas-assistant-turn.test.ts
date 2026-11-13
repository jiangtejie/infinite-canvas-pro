import assert from "node:assert/strict";
import test from "node:test";

import type { AiConfig } from "@/stores/use-config-store";

import type { RunCanvasAgentInput } from "../agent/canvas-agent-runtime";
import type { CanvasAgentState, CanvasAssistantMessage, CanvasAssistantSession } from "../types";
import { runAssistantTurn } from "./canvas-assistant-turn";

const state: CanvasAgentState = { phase: "intake", approvedNodeIds: [], referenceNodeIds: [], pendingTaskIds: [], completedTaskIds: [] };
const session = (patch: Partial<CanvasAssistantSession> = {}): CanvasAssistantSession => ({
    id: "s1",
    title: "会话",
    messages: [{ id: "m-assistant", role: "assistant", text: "", status: "thinking" }],
    agentState: state,
    protocolMessages: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
});
const config = () => ({ model: "gpt-test", apiMode: "chat" } as unknown as AiConfig);
const input = (overrides: Record<string, unknown> = {}) => {
    const sessionWrites: CanvasAssistantSession[] = [];
    const messagePatches: Array<Partial<CanvasAssistantMessage>> = [];
    const running: boolean[] = [];
    const aborts: Array<AbortController | null> = [];
    return {
        sessionWrites,
        messagePatches,
        running,
        aborts,
        value: {
            session: session(),
            assistantId: "m-assistant",
            userText: "创建文本",
            references: [],
            requestConfig: config(),
            jsonToolFallbackKey: "chat||gpt-test",
            createRunner: () => async () => ({ reply: "已完成", state, protocolMessages: [], contextCheckpoint: undefined, jsonFallbackMode: undefined }),
            getAgentContext: () => ({ project: { id: "p", title: "t", nodeCount: 0, connectionCount: 0 }, agentState: state, selectedNodeIds: [], nodes: [], connections: [], remixImages: [], generation: { autoGenerateMedia: false, textModel: "", imageModel: "", videoModel: "", audioModel: "", imageQuality: "", imageSize: "", videoQuality: "", videoSize: "", imageCount: "1", videoSeconds: "5", videoGenerateAudio: "false", videoSupportsAudio: false, audioVoice: "", audioLanguage: "", audioFormat: "", audioSpeed: "" }, tasks: [] }),
            executeAction: async () => ({ ok: true }),
            updateSession: (_id: string, updater: (value: CanvasAssistantSession) => CanvasAssistantSession) => sessionWrites.push(updater(session())),
            updateMessage: (_id: string, _messageId: string, patch: Partial<CanvasAssistantMessage>) => messagePatches.push(patch),
            takeAbort: (controller: AbortController) => aborts.push(controller),
            releaseAbort: () => aborts.push(null),
            onRunningChange: (value: boolean) => running.push(value),
            ...overrides,
        } as Parameters<typeof runAssistantTurn>[0],
    };
};

test("successful turn writes reply, state and running flags", async () => {
    const harness = input();
    await runAssistantTurn(harness.value);
    assert.deepEqual(harness.running, [true, false]);
    assert.equal(harness.aborts.length, 2);
    const lastSession = harness.sessionWrites.at(-1)!;
    const assistant = lastSession.messages.find((message) => message.id === "m-assistant");
    assert.equal(assistant?.text, "已完成");
    assert.equal(assistant?.status, "success");
});

test("aborted turn reports stop and keeps waiting status", async () => {
    const harness = input({
        createRunner: () => async () => {
            const error = new Error("stopped");
            error.name = "AbortError";
            throw error;
        },
    });
    await runAssistantTurn(harness.value);
    assert.deepEqual(harness.running, [true, false]);
    assert.equal(harness.messagePatches.at(-1)?.status, "waiting");
    assert.match(harness.messagePatches.at(-1)?.text || "", /已停止/);
});

test("references are hydrated before reaching the runner", async () => {
    const hydrated: string[] = [];
    let received = 0;
    const harness = input({
        references: [{ id: "n1", type: "image", title: "图", dataUrl: "blob:raw" }],
        hydrateReference: async (reference: { id: string }) => {
            hydrated.push(reference.id);
            return { ...reference, dataUrl: "data:image/png;base64,abc" };
        },
        createRunner: () => async (turnInput: RunCanvasAgentInput) => {
            received = turnInput.references.length;
            assert.equal(turnInput.references[0].dataUrl, "data:image/png;base64,abc");
            return { reply: "ok", state, protocolMessages: [] };
        },
    });
    await runAssistantTurn(harness.value);
    assert.deepEqual(hydrated, ["n1"]);
    assert.equal(received, 1);
});
