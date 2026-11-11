import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasAgentState, executeActions, runCanvasAgent, shouldRollbackCanvasAgentBatch, summarizeCanvasAgentBatch } from "./canvas-agent-runtime";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasAgentState } from "../types";
import type { CanvasAgentContext } from "./canvas-agent-context";
import type { CanvasAgentAction } from "./canvas-agent-tools";

const initialState: CanvasAgentState = { phase: "intake", approvedNodeIds: [], referenceNodeIds: [], pendingTaskIds: [], completedTaskIds: [] };
const action = (id: string, name: CanvasAgentAction["name"] = "get_canvas_summary"): CanvasAgentAction => ({ id, name, arguments: {} });

test("executeActions returns per-action timing audit and preserves successful payload", async () => {
    const result = await executeActions([action("a1")], initialState, async () => ({ ok: true, value: 42 }));
    assert.equal(result.items[0].result.ok, true);
    assert.equal(result.items[0].result.value, 42);
    assert.equal((result.items[0].result.audit as { actionId: string }).actionId, "a1");
    assert.ok((result.items[0].result.audit as { durationMs: number }).durationMs >= 0);
});

test("executeActions normalizes execution failures and cancellation codes", async () => {
    const failed = await executeActions([action("a2")], initialState, async () => { throw new Error("failed"); });
    assert.equal(failed.items[0].result.code, "tool_execution_failed");
    assert.equal((failed.items[0].result.audit as { actionId: string }).actionId, "a2");
    const cancelled = await executeActions([action("a3")], initialState, async () => { const error = new Error("stopped"); error.name = "AbortError"; throw error; });
    assert.equal(cancelled.items[0].result.code, "cancelled");
});

test("batch summary counts successes and failures", () => {
    const items = [
        { action: action("a1", "create_text_node"), result: { ok: true } },
        { action: action("a2", "create_connection"), result: { ok: false, code: "node_not_found" } },
    ];
    assert.deepEqual(summarizeCanvasAgentBatch(items), { total: 2, succeeded: 1, failed: 1, nodeIds: [] });
});

test("batch rolls back only when every action is a reversible structure write", () => {
    const failure = { ok: false, code: "node_not_found" };
    assert.equal(shouldRollbackCanvasAgentBatch([
        { action: action("a1", "create_text_node"), result: { ok: true } },
        { action: action("a2", "create_connection"), result: failure },
    ]), true);
    assert.equal(shouldRollbackCanvasAgentBatch([
        { action: action("a1", "generate_image"), result: { ok: true } },
        { action: action("a2", "create_text_node"), result: failure },
    ]), false);
    assert.equal(shouldRollbackCanvasAgentBatch([
        { action: action("a1", "create_text_node"), result: { ok: true } },
    ]), false);
});

const fakeConfig = () => ({ model: "gpt-test", textModel: "", apiMode: "chat", baseUrl: "https://example.com", systemPrompt: "", systemPrompts: { text: "" } } as unknown as AiConfig);
const fakeContext = (state: CanvasAgentState): CanvasAgentContext => ({
    project: { id: "p1", title: "画布", nodeCount: 0, connectionCount: 0 },
    agentState: state,
    selectedNodeIds: [],
    nodes: [],
    connections: [],
    generation: { autoGenerateMedia: false, textModel: "gpt-test", imageModel: "img", videoModel: "vid", audioModel: "aud", imageQuality: "high", imageSize: "1024x1024", videoQuality: "720p", videoSize: "16:9", imageCount: "1", videoSeconds: "5", videoGenerateAudio: "false", videoSupportsAudio: false, audioVoice: "", audioLanguage: "", audioFormat: "", audioSpeed: "" },
    tasks: [],
});
const turn = (toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>, content = "") => ({ content, toolCalls, toolMode: "native" as const });
const runWithTurns = async (
    turns: Array<ReturnType<typeof turn>>,
    executeAction: (name: string) => { ok: boolean; code?: string; message?: string },
    extra: { onBatchStart?: () => void; onBatchEnd?: (summary: { total: number; succeeded: number; failed: number; rolledBack: boolean }) => void } = {},
) => {
    let index = 0;
    return runCanvasAgent({
        config: fakeConfig(),
        initialState: createCanvasAgentState(),
        protocolMessages: [],
        userText: "创建文本",
        references: [],
        getContext: fakeContext,
        executeAction: async (action) => executeAction(action.name),
        requestTurn: async () => turns[Math.min(index++, turns.length - 1)],
        ...extra,
    });
};

test("failed structure batch reports rollback and keeps the protocol honest", async () => {
    const summaries: Array<{ total: number; succeeded: number; failed: number; rolledBack: boolean }> = [];
    const starts: number[] = [];
    const result = await runWithTurns(
        [turn([{ id: "c1", name: "create_text_node", arguments: { title: "镜头", content: "正文" } }]), turn([], "已完成")],
        () => ({ ok: false, code: "node_not_found", message: "找不到节点 x" }),
        { onBatchStart: () => starts.push(1), onBatchEnd: (summary) => summaries.push(summary) },
    );
    assert.deepEqual(summaries, [{ total: 1, succeeded: 0, failed: 1, rolledBack: true, nodeIds: [] }]);
    assert.equal(starts.length, 1);
    assert.equal(result.reply, "已完成");
    const toolMessage = result.protocolMessages.find((message) => message.role === "tool");
    assert.ok(toolMessage && toolMessage.role === "tool");
    assert.equal(JSON.parse(toolMessage.content).rolledBack, true);
});

test("media batches keep completed work and are never rolled back", async () => {
    const summaries: Array<{ total: number; succeeded: number; failed: number; rolledBack: boolean }> = [];
    await runWithTurns(
        [
            turn([
                { id: "c1", name: "generate_image", arguments: { prompt: "海边", sourceNodeIds: [] } },
                { id: "c2", name: "create_text_node", arguments: { title: "镜头", content: "正文" } },
            ]),
            turn([], "结束"),
        ],
        (name) => (name === "generate_image" ? { ok: true } : { ok: false, code: "node_not_found", message: "找不到节点 x" }),
        { onBatchEnd: (summary) => summaries.push(summary) },
    );
    assert.deepEqual(summaries, [{ total: 2, succeeded: 1, failed: 1, rolledBack: false, nodeIds: [] }]);
});

test("agent state returns to the pre-batch value when a batch rolls back", async () => {
    const result = await runWithTurns(
        [
            turn([
                { id: "c1", name: "set_agent_state", arguments: { phase: "script" } },
                { id: "c2", name: "create_text_node", arguments: { title: "镜头", content: "正文" } },
            ]),
            turn([], "结束"),
        ],
        (name) => (name === "set_agent_state" ? { ok: true } : { ok: false, code: "node_not_found", message: "找不到节点 x" }),
    );
    assert.equal(result.state.phase, "intake");
});

const runTurns = async (turns: Array<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>; toolMode: "native" | "structured-json" }>, executeAction: (name: string) => { ok: boolean; code?: string; message?: string }) => {
    let index = 0;
    const modes: string[] = [];
    const result = await runCanvasAgent({
        config: fakeConfig(),
        initialState: createCanvasAgentState(),
        protocolMessages: [],
        userText: "创建文本",
        references: [],
        getContext: fakeContext,
        executeAction: async (action) => executeAction(action.name),
        requestTurn: async (request) => {
            modes.push(request.toolMode);
            return turns[Math.min(index++, turns.length - 1)];
        },
    });
    return { result, modes };
};

test("json fallback signal switches the next turn to structured json", async () => {
    const executed: string[] = [];
    const { result, modes } = await runTurns(
        [
            { content: "__CANVAS_AGENT_JSON_FALLBACK__", toolCalls: [], toolMode: "native" },
            { content: JSON.stringify({ actions: [{ tool: "create_text_node", arguments: { title: "镜头", content: "正文" } }], reply: "" }), toolCalls: [], toolMode: "structured-json" },
            { content: JSON.stringify({ actions: [], reply: "完成" }), toolCalls: [], toolMode: "structured-json" },
        ],
        (name) => {
            executed.push(name);
            return { ok: true };
        },
    );
    assert.equal(modes[0], "native");
    assert.equal(modes[1], "structured-json");
    assert.equal(executed.length, 1);
    assert.equal(result.reply, "完成");
});

test("invalid tool arguments are retried before executing anything", async () => {
    const executed: string[] = [];
    const { result } = await runTurns(
        [
            { content: "", toolCalls: [{ id: "c1", name: "create_text_node", arguments: { title: "镜头", content: "正文", unknownKey: 1 } }], toolMode: "native" },
            { content: "", toolCalls: [{ id: "c2", name: "create_text_node", arguments: { title: "镜头", content: "正文" } }], toolMode: "native" },
            { content: "已完成", toolCalls: [], toolMode: "native" },
        ],
        (name) => {
            executed.push(name);
            return { ok: true };
        },
    );
    assert.deepEqual(executed, ["create_text_node"]);
    assert.equal(result.reply, "已完成");
    assert.match(JSON.stringify(result.protocolMessages), /invalid_tool_arguments/);
});

test("arrange nodes is rejected unless the user asked for it", async () => {
    const executed: string[] = [];
    const { result } = await runTurns(
        [
            { content: "", toolCalls: [{ id: "c1", name: "arrange_nodes", arguments: {} }], toolMode: "native" },
            { content: "已完成", toolCalls: [], toolMode: "native" },
        ],
        (name) => {
            executed.push(name);
            return { ok: true };
        },
    );
    assert.deepEqual(executed, []);
    assert.equal(result.reply, "已完成");
    assert.match(JSON.stringify(result.protocolMessages), /action_not_requested/);
});

test("the agent stops after the safety step limit", async () => {
    const batches: number[] = [];
    let index = 0;
    const result = await runCanvasAgent({
        config: fakeConfig(),
        initialState: createCanvasAgentState(),
        protocolMessages: [],
        userText: "创建文本",
        references: [],
        getContext: fakeContext,
        executeAction: async () => ({ ok: true }),
        requestTurn: async () => ({ content: "", toolCalls: [{ id: "c" + index++, name: "create_text_node", arguments: { title: "镜头", content: "正文" } }], toolMode: "native" as const }),
        onBatchEnd: () => batches.push(1),
    });
    assert.equal(batches.length, 12);
    assert.match(result.reply, /安全操作步数上限/);
});
